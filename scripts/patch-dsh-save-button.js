#!/usr/bin/env node
/**
 * ============================================================================
 * patch-dsh-save-button.js
 * ----------------------------------------------------------------------------
 * 作用：给 DSH 内置「插件配置」卡片（dsh-client-ui-settings-plugins）的“保存”按钮
 *       打补丁，修复它文字颜色用错 token 导致的“白框、文字看不见”问题。
 *
 * 背景 / 根因：
 *   - 内置卡的保存按钮把「背景 token」 --dsw-alias-bg-layer-3 当成「文字色」来用，
 *     这属于语义误用（背景 token 不该当前景色）。
 *   - 默认主题下它之所以正常，是因为 --dsw-alias-bg-layer-3 的值恰好和正确的前景
 *     token --dsw-alias-label-primary-inverted 完全相同（浅色=白、深色=深灰）。
 *   - 一旦有主题覆盖（例如 dsh-background 的「磨砂」frost 功能）把 bg-layer-3 变透明，
 *     这个巧合就失效：按钮文字跟着变透明，于是深色主题下变成“白底白字 / 看不见”。
 *
 * 修法：
 *   - 把保存按钮文字色从 bg-layer-3 换成 label-primary-inverted。
 *   - 两者默认值相同 → 零视觉变化；但 label-primary-inverted 是真正的前景 token，
 *     不会被 frost 覆盖成透明，所以修复后无论 frost 调多少都正常。
 *
 * 为什么需要脚本：
 *   - 这个文件属于 npm 全局包 @deepseek-ai/dsh 的自带依赖（不在你自己的仓库里），
 *     执行 `npm install -g @deepseek-ai/dsh@latest` 升级后会整个重装、把补丁冲掉，
 *     所以升级后需要重新跑一次本脚本。
 *
 * 用法：
 *   node scripts/patch-dsh-save-button.js
 *   （在 D:\DeepseekHarness 目录下执行，或写全路径）
 *
 * 幂等说明：
 *   - 已经是修复后的版本 → 提示 skip，直接退出（退出码 0）。
 *   - 发现旧规则 → 打补丁并提示刷新页面。
 *   - 找不到文件 / 找不到旧规则 → 告警提示人工确认（不会改坏任何东西）。
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// —— 需要替换的两段字符串（精确匹配内置包打包产物里的压缩 CSS 规则）——
// 旧（有 bug）：背景 token 当文字色
const OLD = ".YyYd_a_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}";
// 新（修复后）：换成真正的前景 token
const NEW = ".YyYd_a_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted)}";

// —— 1) 定位 npm 全局根目录（等于 `npm root -g` 的返回值）——
let npmRoot;
try {
  npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
} catch (err) {
  console.error("[patch] 无法执行 `npm root -g`，请确认已安装 Node/npm。");
  console.error("[patch] 错误信息：" + (err && err.message ? err.message : err));
  process.exit(1);
}
console.log("[patch] npm 全局根目录：" + npmRoot);

// —— 2) 候选路径（升级后目录结构若变化，在这里补新路径即可）——
// 当前实际位置：dsh 包内部的嵌套依赖
// 备用位置：某些 npm 版本/配置会把依赖提升(hoist)到全局根目录下
function candidatePaths() {
  return [
    path.join(npmRoot, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai", "dsh-client-ui-settings-plugins", "lib", "client.js"),
    path.join(npmRoot, "@deepseek-ai", "dsh-client-ui-settings-plugins", "lib", "client.js"),
  ];
}

// —— 3) 兜底：在 npmRoot 下浅层递归找 dsh-client-ui-settings-plugins/lib/client.js ——
function searchClientJs(dir, depth) {
  if (depth <= 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      // 命中包目录：直接拼 lib/client.js
      if (ent.name === "dsh-client-ui-settings-plugins") {
        const libClient = path.join(full, "lib", "client.js");
        if (fs.existsSync(libClient)) return libClient;
      }
      // 只往 @deepseek-ai / node_modules 这类目录里钻，避免整树扫描
      if (ent.name === "@deepseek-ai" || ent.name === "node_modules") {
        const hit = searchClientJs(full, depth - 1);
        if (hit) return hit;
      }
    }
  }
  return null;
}

let target = null;
for (const c of candidatePaths()) {
  if (fs.existsSync(c)) {
    target = c;
    break;
  }
}
if (!target) {
  target = searchClientJs(npmRoot, 6);
}
if (!target) {
  console.error("[patch] 找不到目标文件 dsh-client-ui-settings-plugins/lib/client.js。");
  console.error("[patch] 说明：dsh 升级后目录结构可能变化。请确认该包的实际位置，");
  console.error("[patch]       并在脚本上方的 candidatePaths() 里补上对应路径后重跑。");
  process.exit(1);
}
console.log("[patch] 目标文件：" + target);

// —— 4) 读文件、判断状态、打补丁 ——
let content;
try {
  content = fs.readFileSync(target, "utf8");
} catch (err) {
  console.error("[patch] 读取文件失败：" + (err && err.message ? err.message : err));
  process.exit(1);
}

// 已经是修复后的版本 → 跳过（幂等）
if (content.includes(NEW)) {
  console.log("[patch] 已是修复后的版本，无需处理。");
  process.exit(0);
}

// 找不到旧规则 → 告警（可能是上游已经改了规则，或规则字符串变了）
if (!content.includes(OLD)) {
  console.error("[patch] 未找到需要替换的旧规则（上游可能已修复，或压缩 CSS 规则有变化）。");
  console.error("[patch] 请人工打开该文件，确认保存按钮的文字色是否仍是 --dsw-alias-bg-layer-3；");
  console.error("[patch] 若不是，则说明上游已修好，无需本脚本。");
  process.exit(0);
}

// 打补丁：替换所有匹配（这里正常只有一处）
const next = content.split(OLD).join(NEW);
try {
  fs.writeFileSync(target, next, "utf8");
} catch (err) {
  console.error("[patch] 写入文件失败（可能是文件被占用/只读）：" + (err && err.message ? err.message : err));
  process.exit(1);
}

console.log("[patch] 已打补丁！");
console.log("[patch] 保存按钮文字色：--dsw-alias-bg-layer-3  →  --dsw-alias-label-primary-inverted");
console.log("[patch] 请在浏览器里硬刷新页面（Ctrl + Shift + R）让改动生效。");
