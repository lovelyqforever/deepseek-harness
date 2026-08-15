# dsh-example-hello

一个最小示例插件，用于演示 DeepSeek Harness 的插件安装流程。

- `package.json`：声明这是一个带 `dsh.bundle` 的组合包（bundle）。
- `cordis.patch.yml`：bundle patch 层，往插件树新增一条 `example-hello` 条目。
- `lib/index.js`：插件本体，导出 `apply(ctx, config)`，挂载时打印一行日志。

挂载成功后，可在 设置 → 插件 → 插件列表 里看到 `example-hello`（已启用）。
