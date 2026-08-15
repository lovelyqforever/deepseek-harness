import { readFileSync } from "node:fs";

// dsh-titlebar 宿主半：注册 /plugins/titlebar/client.js 并通过 tapIndex 注入。
// 前端脚本只在 Electron 桌面壳（存在 window.desktop 桥接）下渲染标题栏；
// 在普通浏览器 WebUI 下自动跳过，不影响网页使用。

export const name = "dsh-titlebar";
export const inject = ["webServer"];

const clientJsPath = new URL("./client.js", import.meta.url);

export function apply(ctx) {
  ctx.webServer.register({
    kind: "exact",
    path: "/plugins/titlebar/client.js",
    handler: (_req, res) => {
      let js;
      try {
        js = readFileSync(clientJsPath, "utf8");
      } catch {
        js = "/* dsh-titlebar: client.js missing */";
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
      '<script src="/plugins/titlebar/client.js"></script></body>',
    ),
  );
}
