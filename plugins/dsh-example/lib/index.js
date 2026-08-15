// 最小 dsh 插件。Cordis 挂载本插件时会调用 apply(ctx, config)。
// config 来自 cordis.patch.yml 里该条目的 config 字段。

export const name = "example-hello";
export const inject = [];

export function apply(ctx, config) {
  const greeting = config?.greeting ?? "Hello from dsh-example-hello";
  // ctx.logger 在这个 harness 里默认只进内存缓冲、不打到控制台；
  // 用 console.log 才会真正出现在运行 `dsh web` 的那个终端里。
  console.log(`[dsh-example-hello] ${greeting}`);
  console.log("[dsh-example-hello] mounted — this is the demo plugin");
}
