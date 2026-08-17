import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

// dsh-plugin-manager 宿主半。
// 目标：让用户在 Web GUI 的「设置 → 插件 → 插件开关」里用开关控制自有插件的启用/禁用，
// 不再敲命令行。开关本质 = 在 profile 的 cordis.patch.yml（用户 patch 层）里加/删
// `- id: <入口id>\n  disabled: true`（入口 id 从每个插件自己的 cordis.patch.yml 读取，
// 避免 `@liustack/modlens` 这类「入口 id ≠ 包名」的例外写错 id），且同时写两份：
//   1) C 盘 live：~/.dsh/profiles/<profile>/cordis.patch.yml（本次重启后生效）
//   2) 仓库模板：<repo>/profile/cordis.patch.yml（进 Git，防止 setup.ps1 覆盖回滚）
// 不删任何依赖/源码，不改 bundles/dependencies，不自动 commit。

export const name = "dsh-plugin-manager";
export const inject = ["webServer"];

const MANAGER_NAME = "dsh-plugin-manager";
const PATCH_HEADER =
  "# 用户 patch 层 —— 由 dsh-plugin-manager 维护的「启用/禁用」开关，请勿手改。\n";

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profileDir(config) {
  return join(dshHome(), "profiles", config?.profileName || "web");
}

function liveManifestFile(config) {
  return join(profileDir(config), "package.json");
}

function livePatchFile(config) {
  return join(profileDir(config), "cordis.patch.yml");
}

// 读 live profile 的 package.json，取 link: 依赖（= 我的插件）并反推仓库模板目录。
function readLiveDependencies(config) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(liveManifestFile(config), "utf8"));
  } catch {
    return { deps: {}, repoRoot: null };
  }
  const deps = manifest.dependencies ?? {};
  let repoRoot = null;
  for (const spec of Object.values(deps)) {
    if (typeof spec !== "string" || !spec.startsWith("link:")) continue;
    // setup.ps1 写入绝对路径：link:<repo>/plugins/<name>
    const target = spec.slice("link:".length);
    const pluginsDir = dirname(target);
    const repo = dirname(pluginsDir);
    if (repo) {
      repoRoot = repo;
      break;
    }
  }
  return { deps, repoRoot };
}

function templatePatchFile(config, repoRoot) {
  const override = config?.templateProfileDir;
  if (override) {
    return join(
      isAbsolute(override) ? override : join(dshHome(), override),
      "cordis.patch.yml",
    );
  }
  return repoRoot ? join(repoRoot, "profile", "cordis.patch.yml") : null;
}

// 仓库模板的 package.json（用于把第三方插件的版本号同步进 Git，供另一台机器复用）。
function templateManifestFile(config, repoRoot) {
  const override = config?.templateProfileDir;
  const base = override
    ? (isAbsolute(override) ? override : join(dshHome(), override))
    : (repoRoot ? join(repoRoot, "profile") : null);
  return base ? join(base, "package.json") : null;
}

// —— cordis.patch.yml 的极简行解析/序列化（只关心 `- id: X` + `disabled: true`）——

function parseDisabledNames(text) {
  const names = new Set();
  const lines = String(text ?? "").split(/\r?\n/);
  let currentId = null;
  let currentDisabled = false;
  const flush = () => {
    if (currentId && currentDisabled) names.add(currentId);
    currentId = null;
    currentDisabled = false;
  };
  for (const raw of lines) {
    const code = raw.replace(/\s+#.*$/, "").trim();
    if (code === "") continue;
    if (code.startsWith("- ")) {
      flush();
      const m = /^- id:\s*["']?([^"'\s]+)["']?/.exec(code);
      currentId = m ? m[1] : null;
      currentDisabled = /disabled:\s*true\b/.test(code);
      continue;
    }
    if (currentId !== null && /^disabled:\s*true\b/.test(code)) {
      currentDisabled = true;
    }
  }
  flush();
  return names;
}

function serializePatch(names) {
  const sorted = [...names].sort();
  if (sorted.length === 0) return PATCH_HEADER + "[]\n";
  return (
    PATCH_HEADER +
    sorted.map((n) => `- id: ${n}\n  disabled: true`).join("\n") +
    "\n"
  );
}

function readPatchText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return "";
    throw e;
  }
}

function atomicWrite(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  writeFileSync(tmp, content, "utf8");
  try {
    renameSync(tmp, file);
  } catch {
    // Windows 上某些情况 rename 覆盖已存在文件会失败，先删再重命名。
    try {
      unlinkSync(file);
    } catch {}
    renameSync(tmp, file);
  }
}

// 从插件目录读版本号（link: 走仓库 plugins/ 目录，版本依赖走 live profile 的 node_modules）。
function readVersion(dir) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return manifest.version || null;
  } catch {
    return null;
  }
}

// 从插件自己的 cordis.patch.yml 读真实入口 id（bundle patch 的 `- id: X`）。
// 有些插件入口 id ≠ 包名（如 @liustack/modlens 的入口 id 是 modlens），
// 用包名当 id 去写 disabled 会匹配不到，所以以真实入口 id 为准。
function readEntryId(dir) {
  try {
    const text = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
    const m = /^\s*- id:\s*["']?([^"'\s]+)["']?/m.exec(text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// 解析依赖的真实磁盘目录：link: 走仓库 plugins/ 目录，普通版本号走 live profile 的 node_modules。
function depDir(config, pkgName, spec) {
  if (typeof spec === "string" && spec.startsWith("link:")) {
    return spec.slice("link:".length);
  }
  return join(profileDir(config), "node_modules", pkgName);
}

// 非 link: 依赖只有在它的 package.json 里带 dsh 字段（确实是 DSH 插件）时才算插件，
// 避免把将来可能出现的普通 npm 库误列进开关列表。
function isDshPlugin(dir) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return !!(manifest && manifest.dsh);
  } catch {
    return false;
  }
}

// —— 第三方插件更新检测（只针对方式 2 的版本号依赖）——
let updateCache = new Map(); // pkgName -> npm 最新版本号（仅记录"有更新"的）

function registryUrl(pkgName) {
  // scoped：@scope/name -> @scope%2Fname；unscoped 原样
  const enc = pkgName.includes("/") ? pkgName.replace("/", "%2F") : pkgName;
  return "https://registry.npmjs.org/" + enc + "/latest";
}

async function fetchLatest(pkgName) {
  const res = await fetch(registryUrl(pkgName), { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  return data && typeof data.version === "string" ? data.version : null;
}

function isNewer(latest, installed) {
  if (!latest || !installed || latest === installed) return false;
  const la = String(latest).split(".").map((n) => parseInt(n, 10) || 0);
  const ia = String(installed).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(la.length, ia.length);
  for (let i = 0; i < len; i++) {
    const a = la[i] ?? 0, b = ia[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

async function refreshUpdates(config) {
  const { deps } = readLiveDependencies(config);
  const next = new Map();
  for (const [pkgName, spec] of Object.entries(deps)) {
    if (typeof spec !== "string" || spec.startsWith("link:")) continue;
    if (pkgName === MANAGER_NAME) continue;
    const dir = depDir(config, pkgName, spec);
    if (!isDshPlugin(dir)) continue;
    const installed = readVersion(dir);
    try {
      const latest = await fetchLatest(pkgName);
      if (latest && installed && isNewer(latest, installed)) next.set(pkgName, latest);
    } catch {}
  }
  updateCache = next;
  return next;
}

function runPnpmInstall(config) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["install"], {
      cwd: profileDir(config),
      shell: true,
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (c) => { out += c; });
    child.stderr?.on("data", (c) => { err += c; });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("pnpm install failed (exit " + code + "): " + (err || out).trim()));
    });
  });
}

async function updatePlugin(config, name) {
  const { deps, repoRoot } = readLiveDependencies(config);
  const spec = deps[name];
  if (typeof spec !== "string" || spec.startsWith("link:")) {
    throw new Error(`not an updatable third-party plugin: ${name}`);
  }
  if (name === MANAGER_NAME) throw new Error("cannot update the manager itself");
  const latest = updateCache.get(name) || (await fetchLatest(name));
  if (!latest) throw new Error("cannot determine latest version for " + name);

  // 1) 改 C 盘 live package.json 的版本号（本机立即生效的依赖描述）
  const liveFile = liveManifestFile(config);
  const live = JSON.parse(readFileSync(liveFile, "utf8"));
  live.dependencies = live.dependencies || {};
  live.dependencies[name] = latest;
  atomicWrite(liveFile, JSON.stringify(live, null, 2) + "\n");

  // 2) 改仓库模板 package.json 的版本号（进 Git、跨机同步）
  const tpl = templateManifestFile(config, repoRoot);
  if (tpl && existsSync(tpl)) {
    const tplManifest = JSON.parse(readFileSync(tpl, "utf8"));
    tplManifest.dependencies = tplManifest.dependencies || {};
    tplManifest.dependencies[name] = latest;
    atomicWrite(tpl, JSON.stringify(tplManifest, null, 2) + "\n");
  }

  // 3) 重新拉取安装新版本
  await runPnpmInstall(config);

  // 4) 清掉这条更新记录
  updateCache.delete(name);

  console.log(`[dsh-plugin-manager] updated ${name} -> ${latest}`);
  return { name, version: latest };
}

// 列出「我的插件」及启用状态
function listPlugins(config) {
  const { deps, repoRoot } = readLiveDependencies(config);
  const liveNames = parseDisabledNames(readPatchText(livePatchFile(config)));
  const tpl = templatePatchFile(config, repoRoot);
  const tplNames = tpl ? parseDisabledNames(readPatchText(tpl)) : new Set();
  const disabled = new Set([...liveNames, ...tplNames]);
  const plugins = [];
  for (const [pkgName, spec] of Object.entries(deps)) {
    if (typeof spec !== "string" || pkgName === MANAGER_NAME) continue;
    const isLink = spec.startsWith("link:");
    const dir = depDir(config, pkgName, spec);
    if (!isLink && !isDshPlugin(dir)) continue;
    const entryId = readEntryId(dir) || pkgName;
    const p = {
      name: pkgName,
      enabled: !disabled.has(entryId),
      version: readVersion(dir),
    };
    if (!isLink) p.latest = updateCache.get(pkgName) || null;
    plugins.push(p);
  }
  plugins.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    plugins,
    paths: { live: livePatchFile(config), template: tpl },
  };
}

// 启用/禁用：disabled=true 加条目，disabled=false 删条目；同时写两份。
function setDisabled(config, name, disabled) {
  const { deps, repoRoot } = readLiveDependencies(config);
  if (typeof deps[name] !== "string") {
    throw new Error(`unknown plugin: ${name}`);
  }
  if (name === MANAGER_NAME) {
    throw new Error("cannot toggle the manager itself");
  }
  const entryId = readEntryId(depDir(config, name, deps[name])) || name;
  const live = livePatchFile(config);
  const tpl = templatePatchFile(config, repoRoot);

  const names = new Set(parseDisabledNames(readPatchText(live)));
  if (tpl) {
    for (const n of parseDisabledNames(readPatchText(tpl))) names.add(n);
  }

  if (disabled) names.add(entryId);
  else names.delete(entryId);

  const content = serializePatch(names);
  atomicWrite(live, content);
  if (tpl) atomicWrite(tpl, content);

  return { name, enabled: !disabled, live, template: tpl };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

export function apply(ctx, config) {
  const cfg = config ?? {};

  // 启动时后台检查一次第三方插件更新（不阻塞启动，结果缓存，供 /list 使用）。
  refreshUpdates(cfg).catch(() => {});

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/plugin-manager/list",
    handler: (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        sendJson(res, 200, listPlugins(cfg));
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
      }
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/plugin-manager/set",
    handler: (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {}
        const name = body?.name;
        const enabled = body?.enabled;
        if (typeof name !== "string" || typeof enabled !== "boolean") {
          sendJson(res, 400, {
            ok: false,
            error: "invalid body: expect { name: string, enabled: boolean }",
          });
          return;
        }
        try {
          const result = setDisabled(cfg, name, !enabled);
          console.log(
            `[dsh-plugin-manager] ${name} -> ${result.enabled ? "enabled" : "disabled"}`,
          );
          sendJson(res, 200, {
            ok: true,
            name: result.name,
            enabled: result.enabled,
          });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
        }
      });
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/plugin-manager/check",
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        await refreshUpdates(cfg);
        sendJson(res, 200, { ok: true, ...listPlugins(cfg) });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
      }
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/plugin-manager/update",
    handler: (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {}
        const name = body?.name;
        if (typeof name !== "string") {
          sendJson(res, 400, { ok: false, error: "invalid body: expect { name: string }" });
          return;
        }
        updatePlugin(cfg, name)
          .then((result) => {
            sendJson(res, 200, { ok: true, ...result });
          })
          .catch((e) => {
            sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
          });
      });
    },
  });

  console.log(`[dsh-plugin-manager] mounted; live patch: ${livePatchFile(cfg)}`);
}
