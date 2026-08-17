# DeepSeek Harness 双机开发工作区

这是桌面程序 DeepSeek Harness 的源码仓库：插件源码、桌面壳源码、profile 清单全部进 Git，两台机器 clone 即用。

## 目录结构

```
deepseek-harness/
├─ plugins/               # 插件源码（进 Git，每个插件一个目录）
│  ├─ dsh-hello/          # 示例插件：配置卡 → 保存 → 持久化
│  ├─ dsh-quota/          # 额度查询
│  ├─ dsh-update-check/   # 更新检查
│  ├─ dsh-titlebar/       # 标题栏
│  ├─ dsh-background/     # 背景图
│  └─ dsh-example/        # 教学示例（仅源码，未注册）
├─ profile/               # profile 模板（进 Git；DSH 不直接读，见下）
│  ├─ package.json        # ★ 唯一要改的清单：bundles + dependencies
│  └─ pnpm-workspace.yaml # pnpm 扁平安装配置
├─ src/                   # 桌面壳源码（Electron；node_modules/dist 不进 Git）
├─ app/                   # 打包好的 exe（不进 Git）
├─ setup.ps1              # 一键搭建脚本
├─ .gitignore
└─ README.md
```

## 核心概念：两份 package.json

DSH 启动时**只读** `~/.dsh/profiles/web/package.json`（C 盘，DSH_HOME 下），**不读**仓库里的 `profile/package.json`。

- **仓库 `profile/package.json` = 模板/图纸**：进 Git、跨机器共享，用相对 `link:../plugins/*`。
- **C 盘 `~/.dsh/profiles/web/package.json` = 成品**：DSH 真正读它，由 `setup.ps1` 每次按模板生成（并把相对 link 换成绝对路径）。

> ⚠️ **改配置永远改仓库里的模板，不要直接改 C 盘那份**（会被 setup.ps1 覆盖，也不进 Git）。

> **`setup.ps1` 只负责把模板落地/同步到 C 盘**：两个场景——① 新机器首次搭建；② 你在模板里改了内容（自有插件、bundles、第三方插件版本号）后同步到本机。**日常安装、更新、启停第三方插件不经过它**：本机用 `pnpm add "<pkg>@<version>" --save-exact` 或插件管理界面里的「更新」按钮，模板里的版本号留给另一台机器 clone 后跑 setup.ps1 自动补齐。

`profile/` 下没有 `cordis.yml` / `cordis.patch.yml`——它们由 DSH 启动时自动生成/重写，不需要提交。

## 加一个新插件（四步）

1. 在 `plugins/<名字>/` 写插件源码（宿主半 `lib/index.js`，可选客户端半 `lib/client.js`）。
2. 在 `profile/package.json` 注册两处：
   - `dsh.profile.bundles` 数组加 `"<名字>"`
   - `dependencies` 加 `"<名字>": "link:../plugins/<名字>"`
3. **跑 `.\setup.ps1`（把这次模板变更同步到本机 C 盘）**：把模板同步到 C 盘 profile + 建软链，然后重启 exe。
4. `git add -A && git commit && git push`（另一台机器 clone 后跑 setup.ps1 得到同样结果）。

## 第三方插件（从网上装的）

网上插件的默认安装命令（`dsh plugin add <pkg>` / `npm i <pkg>`）会装进 **C 盘 profile 的 node_modules**，不进 Git——另一台机器拿不到。要进仓库，**默认用方式 2（只记版本号）**；只有想改/检查源码、或插件没发布 npm 时，才用方式 1（vendor 进 plugins/）。

### 方式 2：只记版本号（默认，已发布 npm、不用改源码）

在 `profile/package.json` 注册两处：

- `dsh.profile.bundles` 数组加 `"<pkg>"`
- `dependencies` 加 `"<pkg>": "<version>"`（**精确版本号，不用 `link:`、别用 `^`**）

- **本机下载（不跑 setup.ps1）**：直接 `pnpm add "<pkg>@<version>" --save-exact`（在 `~/.dsh/profiles/web` 目录执行），或用插件管理界面里的「更新」按钮；插件装进 **DSH_HOME 目录**（`~/.dsh/profiles/web/node_modules/`），不放进仓库 `plugins/`。
- **跨机同步**：模板里记的版本号只负责让另一台机器 clone 后跑 `setup.ps1` 时，由 `pnpm install` 自动补齐缺失的第三方插件。

> 锁精确版本号（如 `"3.18.1"`）而不是 `^`：profile 的 `pnpm-lock.yaml` 不进 Git，`^` 会让不同机器解析到不同小版本。

### 方式 1：vendor 源码进 `plugins/`（备选，想改/检查源码，或插件没发布 npm）

```powershell
# 示例：vendor 已发布包 <pkg>@<version>
Push-Location $env:TEMP
npm pack <pkg>@<version>                     # 下载发布版包 → 一个 .tgz
tar -xzf <下载出的 .tgz> -C D:\DeepseekHarness\plugins
Rename-Item D:\DeepseekHarness\plugins\package <pkg>
Pop-Location
```

然后按上面「加一个新插件」注册：`dependencies` 写 `"<名字>": "link:../plugins/<名字>"`。

> 用 `npm pack`（发布版包，含构建产物 `dist/`），别 `git clone`（源码仓库，含 `src/` + devDeps，可能没构建）。vendor 后删掉包内 `node_modules` / `package-lock.json`。

## 另一台机器：从零跑起 exe

> 关键前提：`app/`（打包好的 exe）**没进 Git**，所以要么从 `src/` 重新打包，要么从第一台机器拷一份。
> 澄清：`npm run dist`（打包）是**终端命令**，不是"打开程序"——它读 `src/` 源码、产出 exe，产出的 exe 才是你之后双击打开的。

### 方式 A：从源码重新打包（推荐给开发机）

```powershell
# ① 装 Node.js（npm 一起带）

# ② 装 DSH 引擎 + pnpm（全局，一次性）
npm i -g @deepseek-ai/dsh
npm i -g pnpm

# ③ 拉仓库
git clone https://github.com/lovelyqforever/deepseek-harness.git
cd deepseek-harness

# ④ 装插件（生成 C 盘 profile + 软链）
.\setup.ps1

# ⑤ 从源码打包 exe
cd src
npm install
npm run dist
```

打包产物在 `src\dist\`：
- `win-unpacked\DeepSeek Harness.exe`（解包版，直接双击）
- `DeepSeekHarness-portable.exe`（便携单文件，可拷到任意位置）

### 方式 B：直接拷 exe（快，不想重打包时）

壳（exe）是通用的、跟插件无关。若只想在另一台跑起来：

1. 走完方式 A 的 ①–④ 步（装引擎 + 拉仓库 + setup.ps1）。
2. 把第一台机器的 `app\` 文件夹（或 `DeepSeekHarness-portable.exe`）拷到第二台。
3. 双击运行。

## exe 和插件是两回事

| 改了什么 | 另一台怎么同步 | 要重打包 exe 吗 |
|---|---|---|
| 只加/改插件 | `git pull` + `.\setup.ps1` + 重启 exe | ❌ 不用 |
| 改壳（`src/`） | `git pull` + `cd src; npm run dist` | ✅ 要 |

## 密钥 / 机器相关配置（不进 Git）

- API key：`~/.dsh/.credentials.yaml`（每台机器各填各的）。
- 主题 / 模型 / baseURL：`~/.dsh/settings.yaml`（机器相关）。
- 插件里别硬编码本机路径或局域网 IP（如 dsh-quota 的 baseURL），换机器要能改。
