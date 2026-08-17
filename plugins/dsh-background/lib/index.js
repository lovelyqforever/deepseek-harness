import z from "@deepseek-ai/schemastery";
import { installSettingsSection } from "@deepseek-ai/dsh-settings";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// dsh-background 宿主半（rc.7 设置命名空间路线）。
// 背景「元数据」（provider/file/params/readability）存入 `background` 设置命名空间（JSON，
// 跨重启由 settings 层持久化）；图片「二进制」仍存插件 assets/ 目录，通过 /save /file
// /delete 三个端点读写。配置卡 key 与命名空间同名，才会被「插件配置」页枚举出来。

export const name = "dsh-background";
export const inject = ["webServer"];

const PLUGIN_ROOT = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))));
const ASSET_DIR = join(PLUGIN_ROOT, "assets");

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

// 命名空间 schema：仅存 JSON 元数据；图片二进制不塞进设置（避免 settings.yaml 膨胀）。
const Config = z.object({
  provider: z.string().default(""),
  file: z.string().default(""),
  params: z.object({
    speed: z.number().default(14),
    hue: z.number().default(0),
    brightness: z.number().default(100),
  }).default({ speed: 14, hue: 0, brightness: 100 }),
  readability: z.object({
    scrim: z.number().default(0.38),
    frost: z.number().default(50),
    edge: z.number().default(0.25),
    wallpaperBlur: z.number().default(0),
  }).default({ scrim: 0.38, frost: 50, edge: 0.25, wallpaperBlur: 0 }),
});

function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

export function apply(ctx, config) {
  ensureDir();

  // 注册 background 命名空间；config 作为 base 层，schema 默认值兜底。
  installSettingsSection(ctx, "background", Config, config ?? {}, {
    setSource: () => {},
    onChange: () => {},
  });

  // 1) 上传图片（data URL）→ 写文件，返回文件名；旧文件由客户端显式调用 /delete 清理。
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
          const filename = "bg-" + Date.now() + "." + ext;
          writeFileSync(join(ASSET_DIR, filename), Buffer.from(m[2], "base64"));
          json(res, 200, { ok: true, file: filename });
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      });
    },
  });

  // 2) 伺服当前背景图（文件名作为 cache-bust 查询参数 ?v=<filename>）
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/file",
    handler: (req, res) => {
      const q = (req.url || "").split("?")[1] || "";
      const pair = q.split("&").map((kv) => kv.split("=")).find((kv) => kv[0] === "v");
      let filename = "";
      try {
        filename = basename(decodeURIComponent(pair && pair[1] ? pair[1] : ""));
      } catch {
        filename = "";
      }
      const file = filename ? join(ASSET_DIR, filename) : null;
      if (!file || !existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("no background");
        return;
      }
      const ext = extname(filename).slice(1).toLowerCase();
      const mime = EXT_MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      res.end(readFileSync(file));
    },
  });

  // 3) 删除背景图文件（清除 / 切换极光时由客户端调用，避免孤儿文件）
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/background/delete",
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
        const filename = basename(typeof body.file === "string" ? body.file : "");
        if (!filename) {
          json(res, 400, { ok: false, error: "no file" });
          return;
        }
        try {
          const file = join(ASSET_DIR, filename);
          if (existsSync(file)) unlinkSync(file);
          json(res, 200, { ok: true });
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      });
    },
  });

  console.log("[dsh-background] mounted; settings namespace `background` + assets dir:", ASSET_DIR);
}
