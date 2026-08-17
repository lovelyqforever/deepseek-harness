// ============================================================================
// dsh-session-archiver — 宿主半（跑在 DSH 的 Node 进程里）
//
// 目标：在「设置 → 归档对话」里查看已归档的会话，并一键取消归档，
// 把会话重新放回工作区侧边栏。
//
// 机制：
//   1) 列表     —— 读核心服务 workspaceRegistry：
//                  - workspaceRegistry.archivedSessionIds    已归档的会话 id 数组
//                  - sessionPersistence.readFrom(id, 0)      会话日志（事件流）
//                  标题取「第一条用户消息」（用户的第一个问题），读不到就退回
//                  session/title 事件，再退回会话 id。
//                  （说明：会话 header 只含 id/createdAt/cwd/agentPreset 等元数据，
//                  不含标题；标题/第一个问题在 session.jsonl.zstd 的日志事件里。）
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
// enqueueOperation（与官方 archiveSession 同一条链路）；标题提取依赖
// sessionPersistence.readFrom + user/message 事件结构。若未来 DSH 升级改了
// 这些内部实现，需要在这里适配。
// ============================================================================

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

// 从会话事件流里取「第一个用户问题」作标题：
//   1) 优先取第一条 user/message（source.kind === "user"）的文本；
//   2) 没有则退回最新一条 session/title（DSH 推导/手写的标题）。
function extractSessionTitle(events) {
  for (const e of events) {
    if (e?.type !== "user/message") continue;
    if (e?.data?.source?.kind !== "user") continue;
    const text = (e.data.content || [])
      .filter((b) => b && b.type === "text")
      .map((b) => b.text || "")
      .join(" ");
    const cleaned = cleanTitleText(text);
    if (cleaned) return truncateTitle(cleaned);
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "session/title" && typeof e?.data?.title === "string") {
      const cleaned = cleanTitleText(e.data.title);
      if (cleaned) return truncateTitle(cleaned);
    }
  }
  return null;
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
        const sessions = [];
        // 逐个顺序处理，避免一次性把多个大日志全塞进内存。
        for (const id of registry.archivedSessionIds) {
          try {
            let title = null;
            let createdAt = null;
            let cwd = null;
            try {
              // 读会话日志（事件流），取第一条用户消息当标题。
              const { meta, events } = await persistence.readFrom(id, 0);
              createdAt = meta?.createdAt ?? null;
              cwd = meta?.cwd ?? null;
              title = extractSessionTitle(events || []);
            } catch {
              // 日志读不到就退回 header（只有元数据、没有标题）。
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
