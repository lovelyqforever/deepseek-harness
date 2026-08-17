import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";

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
    plugins.push({
      name: pkgName,
      enabled: !disabled.has(entryId),
      version: readVersion(dir),
    });
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

  console.log(`[dsh-plugin-manager] mounted; live patch: ${livePatchFile(cfg)}`);
}
