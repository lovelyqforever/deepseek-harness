import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// dsh-background 宿主半（文件持久化「路线 B」）。
// 背景图存在插件自己目录下的 assets/（D:\DeepseekHarness\plugins\dsh-background\assets\），
// 不占 C 盘；通过 webServer 暴露 state / save / file / clear 四个端点给前端读写。

export const name = "dsh-background";
export const inject = ["webServer"];

// 用 realpath 解析真实路径：插件是经 profile 里的符号链接加载的，realpath 会落到 D 盘真实目录。
const PLUGIN_ROOT = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))));
const ASSET_DIR = join(PLUGIN_ROOT, "assets");
const CONFIG_FILE = join(ASSET_DIR, "config.json");

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const EXT_MIME = {};
for (const [mime, ext] of Object.entries(MIME_EXT)) EXT_MIME[ext] = mime;

function ensureDir() {
  mkdirSync(ASSET_DIR, { recursive: true });
}

function readConfig() {
  try {
    const data = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

function clampNum(v, min, max, def) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}

// 当前背景状态；url 带 ?v=<filename> 作为 cache-bust（每次保存生成唯一文件名，前端换图必刷新）
function state() {
  const cfg = readConfig();
  const out = {};
  if (cfg.provider && cfg.file) {
    out.provider = cfg.provider;
    out.file = cfg.file;
    out.url = "/plugins/background/file?v=" + encodeURIComponent(cfg.file);
  }
  out.readability = cfg.readability || {};
  return out;
}

function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

export function apply(ctx, config) {
  ensureDir();

  // 1) 读当前状态（配置卡 + 页面加载时还原背景）
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/state",
    handler: (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        json(res, 405, { ok: false });
        return;
      }
      json(res, 200, state());
    },
  });

  // 2) 保存图片（data URL）→ 写文件 + 更新 config + 清理旧图，返回新状态
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/save",
    handler: (req, res) => {
      if (req.method !== "POST") {
        json(res, 405, { ok: false });
        return;
      }
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let dataUrl = "";
        try {
          dataUrl = JSON.parse(raw).dataUrl || "";
        } catch {}
        const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
        if (!m) {
          json(res, 400, { ok: false, error: "invalid dataUrl" });
          return;
        }
        const ext = MIME_EXT[m[1]];
        if (!ext) {
          json(res, 400, { ok: false, error: "unsupported image type: " + m[1] });
          return;
        }
        try {
          const old = readConfig();
          const filename = "bg-" + Date.now() + "." + ext;
          writeFileSync(join(ASSET_DIR, filename), Buffer.from(m[2], "base64"));
          if (old.file && old.file !== filename) {
            try {
              unlinkSync(join(ASSET_DIR, old.file));
            } catch {}
          }
          writeConfig({ provider: "image", file: filename, readability: old.readability });
          console.log("[dsh-background] saved", filename, "->", ASSET_DIR);
          json(res, 200, { ok: true, ...state() });
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      });
    },
  });

  // 3) 清除背景（删 config + 删文件）
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/clear",
    handler: (req, res) => {
      if (req.method !== "POST") {
        json(res, 405, { ok: false });
        return;
      }
      try {
        const old = readConfig();
        if (old.file) {
          try {
            unlinkSync(join(ASSET_DIR, old.file));
          } catch {}
        }
        writeConfig({ readability: old.readability });
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
    },
  });

  // 4) 伺服当前背景图
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/file",
    handler: (req, res) => {
      const cfg = readConfig();
      const file = cfg && cfg.file ? join(ASSET_DIR, cfg.file) : null;
      if (!file || !existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("no background");
        return;
      }
      const ext = extname(cfg.file).slice(1).toLowerCase();
      const mime = EXT_MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      res.end(readFileSync(file));
    },
  });

  // 5) 保存可读性参数（压暗/磨砂/模糊），与背景图独立存储
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/readability",
    handler: (req, res) => {
      if (req.method !== "POST") {
        json(res, 405, { ok: false });
        return;
      }
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(raw) || {};
        } catch {}
        const old = readConfig();
        const next = {
          ...(old.provider && old.file ? { provider: old.provider, file: old.file } : {}),
          readability: {
            scrim: clampNum(body.scrim, 0, 0.85, 0.38),
            frostAlpha: clampNum(body.frostAlpha, 0.05, 1, 0.6),
            blur: clampNum(body.blur, 0, 40, 16),
          },
        };
        writeConfig(next);
        json(res, 200, { ok: true, readability: next.readability });
      });
    },
  });

  console.log("[dsh-background] mounted; assets dir:", ASSET_DIR);
}
