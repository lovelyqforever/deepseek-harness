import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

// dsh-update-check 服务端插件：检测 DSH 是否有新版本，暴露状态给前端，并执行更新。
// - 启动时 + 每 checkIntervalMs 查一次 npm registry，对比本机安装版本。
// - 注册 /plugins/update-check/status（JSON 状态）。
// - 注册 /plugins/update-check/update（POST 触发更新）。
// - 注册 /plugins/update-check/client.js（前端脚本），并通过 tapIndex 注入。

export const name = "dsh-update-check";
export const inject = ["webServer"];

const clientJsPath = new URL("./client.js", import.meta.url);

export function apply(ctx, config) {
  const cfg = config ?? {};
  const updateCommand = String(cfg.updateCommand ?? "npm install -g @deepseek-ai/dsh@latest");
  const checkIntervalMs = Number(cfg.checkIntervalMs ?? 6 * 3600 * 1000) || 6 * 3600 * 1000;
  const registryUrl = String(cfg.registryUrl ?? "https://registry.npmjs.org/@deepseek-ai/dsh/latest");
  const debug = !!cfg.debug; // 调试/演示：伪造“有更新”，便于验证按钮位置与流程

  const status = {
    installed: null,
    latest: null,
    hasUpdate: false,
    checkedAt: null,
    error: null,
    updateState: "idle", // idle | updating | done | error
    updateLog: "",
  };

  // 本机安装版本：优先全局 npm（profile 里的 dsh 是指向它的 junction），
  // 再退回 profile 自己的 node_modules。
  function installedVersion() {
    const candidates = [];
    if (process.env.APPDATA) {
      candidates.push(
        path.join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai", "dsh", "package.json"),
      );
    }
    const home =
      process.env.DSH_HOME ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".dsh") : null);
    if (home) {
      candidates.push(
        path.join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json"),
      );
    }
    for (const p of candidates) {
      try {
        const v = JSON.parse(readFileSync(p, "utf8"))?.version;
        if (v) return v;
      } catch {}
    }
    return null;
  }

  async function check() {
    if (debug) {
      status.installed = installedVersion() || "0.1.0-rc.6";
      status.latest = "0.1.0-rc.9-debug";
      status.hasUpdate = true;
      status.error = null;
      status.checkedAt = new Date().toISOString();
      return;
    }
    status.installed = installedVersion();
    status.checkedAt = new Date().toISOString();
    try {
      const res = await fetch(registryUrl, {
        headers: { "User-Agent": "dsh-update-check", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
      const j = await res.json();
      status.latest = j?.version ?? null;
      status.error = null;
    } catch (e) {
      status.latest = null;
      status.error = e?.message ?? String(e);
    }
    status.hasUpdate = !!(status.installed && status.latest && status.installed !== status.latest);
  }

  function runUpdate() {
    if (status.updateState === "updating") return;
    status.updateState = "updating";
    status.updateLog = "";
    if (debug) {
      status.updateLog = "[debug] 演示模式：跳过真实更新\n";
      setTimeout(() => {
        status.updateState = "done";
        status.updateLog += "[debug] 完成\n";
      }, 1200);
      return;
    }
    const append = (s) => {
      status.updateLog += s;
      if (status.updateLog.length > 20000) status.updateLog = status.updateLog.slice(-20000);
    };
    let child;
    try {
      child = spawn(updateCommand, { shell: true, windowsHide: true });
    } catch (e) {
      status.updateState = "error";
      status.updateLog = String(e?.message ?? e);
      return;
    }
    child.stdout?.on("data", (c) => append(c.toString()));
    child.stderr?.on("data", (c) => append(c.toString()));
    child.on("error", (e) => {
      status.updateState = "error";
      append("\n" + (e?.message ?? String(e)));
    });
    child.on("close", (code) => {
      status.updateState = code === 0 ? "done" : "error";
      append(`\n[exit ${code}]`);
      check(); // 更新完重新核对版本
    });
  }

  check();
  const timer = setInterval(check, checkIntervalMs);
  if (typeof timer.unref === "function") timer.unref();

  ctx.on("dispose", () => clearInterval(timer));

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/update-check/status",
    handler: async (_req, res) => {
      const body = JSON.stringify(status);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/update-check/update",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      runUpdate();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ started: true }));
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/update-check/client.js",
    handler: async (_req, res) => {
      let js;
      try {
        js = readFileSync(clientJsPath, "utf8");
      } catch {
        js = "/* dsh-update-check: client.js missing */";
      }
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(js);
    },
  });

  ctx.webServer.tapIndex((html) =>
    html.replace(
      "</body>",
      '<script src="/plugins/update-check/client.js"></script></body>',
    ),
  );
}
