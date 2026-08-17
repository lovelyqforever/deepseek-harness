import z from "@deepseek-ai/schemastery";
import { installSettingsSection } from "@deepseek-ai/dsh-settings";

// dsh-hello 宿主半（rc.7 设置命名空间路线）。
// 问候语存入 `hello` 设置命名空间（JSON，跨重启由 settings 层持久化），
// 客户端通过 settingsScope 读写；配置卡 key 与该命名空间同名，
// 才会被「插件配置」页按命名空间枚举出来。

export const name = "dsh-hello";

const DEFAULT_GREETING = "你好！这是一个可配置的问候语。";

// 命名空间 schema：仅一个 greeting 字符串字段，schema 默认值兜底。
const Config = z.object({
  greeting: z.string().default(DEFAULT_GREETING),
});

export function apply(ctx, config) {
  // 注册 hello 命名空间；config 作为 base 层，schema 默认值兜底。
  // 宿主本身不消费该值（客户端横幅读 settingsScope），只需注册以便暴露与持久化。
  installSettingsSection(ctx, "hello", Config, config ?? {}, {
    setSource: () => {},
    onChange: () => {},
  });
  console.log("[dsh-hello] mounted; settings namespace `hello` registered");
}
