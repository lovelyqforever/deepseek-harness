import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// dsh-hello 宿主半（文件持久化路线）。
// 不走 settings API —— 那条「浏览器设置通道」有命名空间白名单（dsh-host-apiproxy 里
// 的 WEB_SETTINGS_NAMESPACES），`hello` 不在里面会回 settings-not-exposed。
// 改成自己用 node:fs 把问候语存到一个 JSON 文件，再通过 webServer 暴露 GET/POST 两个端点给浏览器读写。

export const name = "dsh-hello";
export const inject = ["webServer"];

const DEFAULT_GREETING = "你好！这是一个可配置的问候语。";

function greetingFile() {
  const root = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(root, "hello-greeting.json");
}

export function apply(ctx, config) {
  const defaultGreeting = config?.greeting ?? DEFAULT_GREETING;
  const file = greetingFile();

  function readGreeting() {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (typeof data.greeting === "string") return data.greeting;
    } catch {}
    return defaultGreeting;
  }

  function writeGreeting(greeting) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ greeting }, null, 2), "utf8");
  }

  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/hello/greeting",
    handler: (req, res) => {
      if (req.method === "GET" || req.method === "HEAD") {
        const body = JSON.stringify({ greeting: readGreeting() });
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      }

      if (req.method === "POST") {
        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });
        req.on("end", () => {
          let greeting;
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed.greeting === "string") greeting = parsed.greeting;
          } catch {}
          if (greeting === undefined) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, error: "invalid body" }));
            return;
          }
          try {
            writeGreeting(greeting);
            console.log(`[dsh-hello] greeting saved = ${JSON.stringify(greeting)}`);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, greeting }));
          } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
          }
        });
        return;
      }

      res.writeHead(405);
      res.end();
    },
  });

  console.log(`[dsh-hello] mounted; greeting file: ${file}`);
}
