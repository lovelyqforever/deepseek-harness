// ============================================================================
// dsh-session-archiver — 宿主半（跑在 DSH 的 Node 进程里）
//
// 目标：在「设置 → 归档对话」里查看已归档的会话，并一键取消归档，
// 把会话重新放回工作区侧边栏。
//
// 机制：
//   1) 列表     —— 读核心服务 workspaceRegistry：
//                  - workspaceRegistry.archivedSessionIds    已归档的会话 id 数组
//                  - workspaceRegistry.readSessionHeader(id) 会话标题/时间/工作区路径
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
// enqueueOperation（与官方 archiveSession 同一条链路）。若未来 DSH 升级改了
// workspaceRegistry 内部实现，这里需要适配。
// ============================================================================

export const name = "dsh-session-archiver";

// 只声明确实通过 ctx.<service> 读取的服务；workspaceRegistry 是 DSH 核心工作区注册表。
export const inject = ["webServer", "workspaceRegistry"];

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

export function apply(ctx, config) {
  const registry = ctx.workspaceRegistry;

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
        for (const id of registry.archivedSessionIds) {
          try {
            // readSessionHeader 依次查「活动会话 → 缓存 → 会话持久化」，拿标题等信息。
            const header = await registry.readSessionHeader(id);
            sessions.push({
              id,
              title: header.title || id,
              updatedAt: header.updatedAt ?? null,
              cwd: header.cwd ?? null,
            });
          } catch {
            // 会话已不存在 / header 读不到：跳过，不阻塞整个列表。
          }
        }
        // 按更新时间倒序（最新的排前面）；时间戳可能是数字或 ISO 字符串，统一归一化。
        const toMs = (v) => {
          if (v == null) return 0;
          const n = typeof v === "number" ? v : Date.parse(v);
          return Number.isFinite(n) ? n : 0;
        };
        sessions.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
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
