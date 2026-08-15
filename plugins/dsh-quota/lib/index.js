import { readFileSync, statSync } from "node:fs";

// dsh-quota 服务端插件：登录 Sub2API，抓订阅额度摘要，暴露给前端一个小部件。
// - 每 refreshMs 毫秒刷新一次（默认 60 秒）。
// - 注册 /plugins/quota/data（JSON 额度数据）。
// - 注册 /plugins/quota/client.js（前端小部件脚本）。
// - 通过 webServer.tapIndex 把小部件脚本注入到 index.html。

export const name = "dsh-quota";
export const inject = ["webServer"];

const clientJsPath = new URL("./client.js", import.meta.url);

export function apply(ctx, config) {
  const cfg = config ?? {};
  const baseURL = (cfg.baseURL ?? "http://10.70.174.231:9001").replace(/\/+$/, "");
  const email = cfg.email;
  const password = cfg.password;
  const refreshMs = Number(cfg.refreshMs ?? 60000) || 60000;

  let cached = null; // 最近一次成功抓到的 summary data
  let token = null; // 当前 access_token
  let dailyTokens = 0; // 今日 deepseek 消耗的总 token 数（input + output + cache）

  async function login() {
    try {
      const res = await fetch(`${baseURL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      token = j?.data?.access_token ?? null;
      return token;
    } catch {
      return null;
    }
  }

  async function fetchSummary() {
    return fetch(`${baseURL}/api/v1/subscriptions/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function refresh() {
    try {
      if (!token && !(await login())) return;
      let res = await fetchSummary();
      if (res.status === 401) {
        token = null;
        if (!(await login())) return;
        res = await fetchSummary();
      }
      if (!res.ok) return;
      const j = await res.json();
      if (j?.code === 0 && j.data) cached = j.data;
      await refreshTokens();
    } catch {
      // 网络抖动时保留上一次成功的数据，不抛出
    }
  }

  // 今日 deepseek token 用量：汇总 /api/v1/usage 里今天的 input+output+cache token
  async function refreshTokens() {
    try {
      const ds = (cached?.subscriptions ?? []).find((s) => /deepseek/i.test(s.group_name || ""));
      if (!ds) return;
      // 今日日期（UTC+8）
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const d = String(now.getUTCDate()).padStart(2, "0");
      const today = `${y}-${m}-${d}`;
      let sum = 0;
      let page = 1;
      for (;;) {
        const res = await fetch(
          `${baseURL}/api/v1/usage?start_date=${today}&end_date=${today}&page=${page}&page_size=200`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 401 || !res.ok) return;
        const j = await res.json();
        const items = j?.data?.items ?? [];
        for (const rec of items) {
          if (Number(rec.group_id) === Number(ds.group_id)) {
            sum +=
              Number(rec.input_tokens || 0) +
              Number(rec.output_tokens || 0) +
              Number(rec.cache_creation_tokens || 0) +
              Number(rec.cache_read_tokens || 0) +
              Number(rec.cache_creation_5m_tokens || 0) +
              Number(rec.cache_creation_1h_tokens || 0);
          }
        }
        const pages = Number(j?.data?.pages ?? 1);
        if (page >= pages || items.length === 0) break;
        page += 1;
      }
      dailyTokens = sum;
    } catch {}
  }

  refresh();
  const timer = setInterval(refresh, refreshMs);

  // 开发用：轮询 client.js 变化，通过 SSE 通知浏览器自动刷新（改 UI 无需手动重启）
  const reloadClients = new Set();
  let clientJsStamp = "";
  const pollClientJs = () => {
    try {
      const st = statSync(clientJsPath);
      const stamp = `${st.mtimeMs}:${st.size}`;
      if (clientJsStamp === "") {
        clientJsStamp = stamp;
      } else if (stamp !== clientJsStamp) {
        clientJsStamp = stamp;
        for (const res of reloadClients) {
          try { res.write('data: {"type":"reload"}\n\n'); } catch {}
        }
      }
    } catch {}
  };
  const reloadTimer = setInterval(pollClientJs, 800);
  if (typeof reloadTimer.unref === "function") reloadTimer.unref();

  ctx.on("dispose", () => {
    clearInterval(timer);
    clearInterval(reloadTimer);
    for (const res of reloadClients) { try { res.destroy(); } catch {} }
    reloadClients.clear();
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/quota/data",
    handler: async (_req, res) => {
      const body = JSON.stringify(
        cached ? { ...cached, daily_tokens: dailyTokens } : { error: "no-data" },
      );
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/quota/client.js",
    handler: async (_req, res) => {
      let js;
      try {
        js = readFileSync(clientJsPath, "utf8");
      } catch {
        js = "/* dsh-quota: client.js missing */";
      }
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(js);
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/quota/events",
    handler: (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": connected\n\n");
      reloadClients.add(res);
      res.on("close", () => reloadClients.delete(res));
    },
  });

  ctx.webServer.tapIndex((html) =>
    html.replace(
      "</body>",
      '<script src="/plugins/quota/client.js"></script></body>',
    ),
  );
}
