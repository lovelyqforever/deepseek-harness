import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// dsh-mcp 宿主半：
//  - 读取仓库根 mcp.yaml（单一份，进 Git）
//  - 对每个 enabled 的 server，用 ctx.loader.create() 动态实例化官方 @deepseek-ai/dsh-mcp-client
//  - 通过 webServer 暴露 /mcp/manager/* 端点，供客户端半「MCP 管理」页调用
//
// 说明：仓库插件宿主半只能依赖 node 内置模块（link: 插件不会把自己的依赖装进仓库），
// 所以官方 mcp-client 和 yaml 都通过 ctx.loader 解析，而不是静态 import。

export const name = "dsh-mcp";
export const inject = ["webServer", "loader", "tools"];

const MCP_CLIENT = "@deepseek-ai/dsh-mcp-client";

// 本文件在 <repo>/plugins/dsh-mcp/lib/index.js，向上三级到仓库根。
function defaultConfigPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "mcp.yaml");
}

async function loadYaml(ctx) {
  const mod = await ctx.loader.import("yaml");
  const y = mod && mod.parseDocument ? mod : mod && mod.default;
  if (!y || typeof y.parseDocument !== "function") {
    throw new Error("dsh-mcp: cannot load 'yaml' via ctx.loader.import");
  }
  return y;
}

// env 值约定：以 "$" 开头的字符串从进程环境变量解析（如 "$GITHUB_TOKEN"），其余原样透传。
function resolveEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    out[k] = typeof v === "string" && v.startsWith("$") ? (process.env[v.slice(1)] ?? "") : v;
  }
  return out;
}

function toClientConfig(server) {
  const cfg = {
    serverName: server.serverName,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60000,
    failOnStartupError: server.failOnStartupError ?? false,
  };
  if (server.transport === "stdio") {
    cfg.command = server.command;
    cfg.args = server.args ?? [];
    cfg.env = resolveEnv(server.env);
    cfg.cwd = server.cwd ?? "";
  } else {
    cfg.url = server.url;
    cfg.headers = server.headers ?? {};
  }
  return cfg;
}

// 真连接判定：mcp-client 只在握手成功 + 工具发现完成后才把工具注册进 ctx.tools，
// 因此存在 mcp__<serverName>__* 工具即代表该 server 真正连上了。
function isConnected(ctx, serverName) {
  const tools = ctx.tools;
  if (!tools || typeof tools.view !== "function") return false;
  const prefix = `mcp__${serverName ?? ""}__`;
  try {
    const visible = tools.view().visible;
    if (!visible) return false;
    for (const name of visible.keys()) if (name.startsWith(prefix)) return true;
  } catch {}
  return false;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

export async function apply(ctx, config) {
  const file = config?.mcpConfigPath || defaultConfigPath();
  const running = new Map(); // server.id -> loader entry id

  async function readDoc() {
    const YAML = await loadYaml(ctx);
    try {
      return YAML.parseDocument(readFileSync(file, "utf8"));
    } catch (e) {
      if (e && e.code === "ENOENT") return YAML.parseDocument("servers: []\n");
      throw e;
    }
  }

  async function readServers() {
    const doc = await readDoc();
    const root = doc.toJS() ?? {};
    return Array.isArray(root.servers) ? root.servers : [];
  }

  async function startServer(server) {
    const entryId = await ctx.loader.create({
      id: "mcp-" + server.id,
      name: MCP_CLIENT,
      config: toClientConfig(server),
    });
    running.set(server.id, entryId);
    return entryId;
  }

  async function stopServer(id) {
    const entryId = running.get(id);
    if (!entryId) return;
    running.delete(id);
    try {
      await ctx.loader.remove(entryId);
    } catch (e) {
      ctx.logger?.warn?.(`dsh-mcp: remove entry ${entryId}: ${e?.message ?? e}`);
    }
  }

  async function reloadAll() {
    const servers = await readServers();
    const seen = new Set();
    for (const server of servers) {
      seen.add(server.id);
      if (server.enabled === false) {
        await stopServer(server.id);
        continue;
      }
      if (running.has(server.id)) await stopServer(server.id);
      await startServer(server);
    }
    for (const id of [...running.keys()]) {
      if (!seen.has(id)) await stopServer(id);
    }
  }

  reloadAll().catch((e) => ctx.logger?.error?.(`dsh-mcp startup: ${e?.message ?? e}`));

  ctx.effect(() => () => {
    for (const id of [...running.keys()]) stopServer(id).catch(() => {});
  }, "dsh-mcp.cleanup");

  ctx.webServer.register({
    kind: "exact",
    path: "/mcp/manager/list",
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const servers = await readServers();
        sendJson(res, 200, {
          ok: true,
          servers: servers.map((s) => ({
            id: s.id,
            serverName: s.serverName,
            transport: s.transport,
            enabled: s.enabled !== false,
            running: running.has(s.id),
            connected: isConnected(ctx, s.serverName),
          })),
        });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
      }
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/mcp/manager/set",
    handler: (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", async () => {
        let body;
        try { body = JSON.parse(raw); } catch {}
        const id = body?.id;
        const enabled = body?.enabled;
        if (typeof id !== "string" || typeof enabled !== "boolean") {
          sendJson(res, 400, { ok: false, error: "invalid body: expect { id, enabled }" });
          return;
        }
        try {
          const doc = await readDoc();
          const servers = doc.toJS()?.servers ?? [];
          const idx = servers.findIndex((s) => s.id === id);
          if (idx < 0) {
            sendJson(res, 404, { ok: false, error: `unknown server id: ${id}` });
            return;
          }
          doc.setIn(["servers", idx, "enabled"], enabled);
          writeFileSync(file, doc.toString(), "utf8");
          if (enabled) {
            if (running.has(id)) await stopServer(id);
            await startServer(servers[idx]);
          } else {
            await stopServer(id);
          }
          sendJson(res, 200, { ok: true, id, enabled });
        } catch (e) {
          sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
        }
      });
    },
  });

  console.log(`[dsh-mcp] mounted; config: ${file}`);
}
