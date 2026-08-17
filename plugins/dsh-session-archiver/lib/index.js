// ============================================================================
// dsh-session-archiver — 宿主半（跑在 DSH 的 Node 进程里）
//
// 目标：在「设置 → 归档对话」里查看已归档的会话，并一键取消归档，
// 把会话重新放回工作区侧边栏。
//
// 机制：
//   1) 列表     —— 读核心服务 workspaceRegistry 的 archivedSessionIds，再对每个
//                  会话「只读日志文件开头的几帧」提取第一条用户消息（第一个问题）。
//                  会话日志是多个 zstd 帧拼成的（首帧=header，其后=事件批次），
//                  第一条用户消息几乎总在最开头的几帧里，因此只读前 512KB、边解压
//                  边找即可，不必解压整个几十 MB 的日志——这就是提速的关键。
//                  （会话 header 只含 id/createdAt/cwd/agentPreset 等元数据，不含标题。）
//   2) 取消归档 —— 官方 API 只有 archiveSession（归档），没有 unarchive。
//                  这里复用 archiveSession 内部同一条
//                  enqueueOperation + requireState + setState 链路，把该 id
//                  从 archivedSessionIds 里去掉再 setState。setState 会：
//                    a. 持久化写回 ~/.dsh/storages/workspace.json
//                    b. 触发存储层 domain/changed 事件
//                    c. host-apiproxy 监听到 → 推 host/archived-sessions-changed 给浏览器
//                    d. 侧边栏实时刷新，会话重新出现（不需要重启 exe）
//
// 兼容性说明：取消归档复用了 workspaceRegistry 的 setState / requireState /
// enqueueOperation；标题提取依赖 sessionPersistence.listArtifacts + 日志首几帧的
// user/message 事件结构（与 dsh-session-title 的 collectSessionTitleMessages 一致）。
// 若未来 DSH 升级改了这些内部实现，需要在这里适配。
// ============================================================================

import { closeSync, openSync, readSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

export const name = "dsh-session-archiver";

// 只声明确实通过 ctx.<service> 读取的服务。
export const inject = ["webServer", "workspaceRegistry", "sessionPersistence"];

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

// ----------------------------------------------------------------------------
// 标题清洗：去掉终端控制序列 / 控制字符 / 方向性隐形字符，折叠空白成单行。
// 正则与 DSH 自带 dsh-session-title 的 normalize 保持一致。
// ----------------------------------------------------------------------------
const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/g;
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g;
const ESC_SEQUENCE = /\u001B[@-_]/g;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

function cleanTitleText(input) {
  return input
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(ESC_SEQUENCE, "")
    .replace(CONTROL_CHARACTER, "")
    .replace(DIRECTIONAL_CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 截断到 max 个字符，超出加省略号（客户端 CSS 还会再按宽度做 ellipsis）。
function truncateTitle(text, max = 120) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

// ----------------------------------------------------------------------------
// zstd 帧扫描：复刻 DSH dsh-session-persistence-jsonl 的 scanZstdFrames。
// 会话日志 = 一个 header 帧 + 若干事件批次帧，逐个解压即可拿到 JSONL 明文。
// ----------------------------------------------------------------------------
const ZSTD_MAGIC = 0xFD2FB528;
function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag);
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}

// 只读文件前 MAX_READ_BYTES 字节，逐帧解压，边解边找第一条用户消息。
// 找到就立刻返回，避免解压整个日志（大日志能省几秒）。
const MAX_READ_BYTES = 512 * 1024; // 前 512KB 足够覆盖第一条用户消息
const MAX_PLAIN_BYTES = 2 * 1024 * 1024; // 明文兜底上限，防止病态日志

function readFirstUserMessage(filePath) {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(MAX_READ_BYTES);
    const got = readSync(fd, buf, 0, buf.length, 0);
    if (got <= 0) return null;
    const data = buf.subarray(0, got);

    let frames;
    try {
      frames = scanZstdFrames(data).frames;
    } catch {
      return null;
    }

    let carry = ""; // 上一帧末尾可能的半行，拼到下一帧开头
    let plainBytes = 0;
    let fallbackTitle = null;

    for (const f of frames) {
      const out = zstdDecompressSync(data.subarray(f.start, f.end)).toString("utf8");
      plainBytes += Buffer.byteLength(out, "utf8");
      const text = carry + out;
      const lines = text.split("\n");
      carry = lines.pop() || ""; // 最后一段可能是半行，留到下一帧
      for (const line of lines) {
        if (line.length === 0) continue;
        let rec;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        // 第一条用户消息（source.kind === "user"）：用户的第一个问题。
        if (rec?.type === "user/message" && rec?.data?.source?.kind === "user") {
          const t = (rec.data.content || [])
            .filter((b) => b && b.type === "text")
            .map((b) => b.text || "")
            .join(" ");
          const cleaned = cleanTitleText(t);
          if (cleaned) return truncateTitle(cleaned);
        }
        // 兜底：DSH 推导/手写的 session/title。
        if (fallbackTitle === null && rec?.type === "session/title" && typeof rec?.data?.title === "string") {
          const cleaned = cleanTitleText(rec.data.title);
          if (cleaned) fallbackTitle = truncateTitle(cleaned);
        }
      }
      if (plainBytes > MAX_PLAIN_BYTES) break;
    }
    return fallbackTitle;
  } finally {
    closeSync(fd);
  }
}

// 把数字/ISO 时间统一归一化成毫秒（排序用）。
function toMs(v) {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
}

export function apply(ctx, config) {
  const registry = ctx.workspaceRegistry;
  const persistence = ctx.sessionPersistence;

  // --------------------------------------------------------------------------
  // GET/HEAD /plugins/session-archiver/list —— 列出所有已归档会话
  // --------------------------------------------------------------------------
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/session-archiver/list",
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        // 一次性拿到每个会话的元数据 + 文件路径（只读各自 header 首帧，很便宜）。
        let byId = new Map();
        try {
          const artifacts = await persistence.listArtifacts();
          for (const a of artifacts) {
            if (a?.header?.id) byId.set(a.header.id, a);
          }
        } catch {
          byId = new Map();
        }

        const sessions = [];
        for (const id of registry.archivedSessionIds) {
          try {
            const art = byId.get(id);
            let title = null;
            let createdAt = null;
            let cwd = null;
            if (art) {
              createdAt = art.header?.createdAt ?? null;
              cwd = art.header?.cwd ?? null;
              try {
                title = readFirstUserMessage(art.path);
              } catch {
                title = null;
              }
            } else {
              // 读不到 artifact 就退回 header（只有元数据、没有标题）。
              const header = await registry.readSessionHeader(id);
              createdAt = header?.createdAt ?? null;
              cwd = header?.cwd ?? null;
            }
            sessions.push({
              id,
              title: title || id,
              createdAt,
              cwd,
            });
          } catch {
            // 会话已不存在：跳过，不阻塞整个列表。
          }
        }
        // 按创建时间倒序（最新的排前面）。
        sessions.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        sendJson(res, 200, { ok: true, sessions });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
      }
    },
  });

  // --------------------------------------------------------------------------
  // POST /plugins/session-archiver/unarchive —— 取消归档一个会话
  // --------------------------------------------------------------------------
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/session-archiver/unarchive",
    handler: (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (c) => {
        raw += c.toString("utf8");
      });
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {}
        const sessionId = body?.sessionId;
        if (typeof sessionId !== "string" || sessionId.length === 0) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid body: expect { sessionId: string }",
          });
          return;
        }
        // enqueueOperation 串行化写入，避免与 archiveSession 并发竞态。
        registry
          .enqueueOperation(async () => {
            const state = registry.requireState();
            // 幂等：已不在归档列表里就直接返回，不报错。
            if (!state.archivedSessionIds.includes(sessionId)) return;
            await registry.setState({
              ...state,
              archivedSessionIds: state.archivedSessionIds.filter((x) => x !== sessionId),
            });
          })
          .then(() => {
            console.log(`[dsh-session-archiver] unarchived: ${sessionId}`);
            sendJson(res, 200, { ok: true, sessionId });
          }, (e) => {
            sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
          });
      });
    },
  });

  console.log("[dsh-session-archiver] mounted");
}
