# DeepSeek Harness 桌面客户端（Electron 套壳 + 系统托盘）

给 `dsh web` 套一个原生 Windows 窗口，并加上常驻托盘。

## 行为

- 双击启动 → 原生窗口 + 后台自动拉起 `dsh web`（引擎），窗口内就是原版 Web 界面。
- 窗口可随意缩放、最大化、全屏；设置等所有按钮照常工作。
- 点窗口右上角 **×** = **最小化到托盘**，不退出，后端保持保温。
- 右键托盘图标 → **打开主界面** / **退出**。
- **退出** = 杀掉整个 `dsh web` 进程树，然后退出 Electron（相当于“杀死进程”）。

## 关键设计

- 后端用 `--port 0` 启动（操作系统自动分配空闲端口），**不会**和你终端里已在 3080 端口跑的 `dsh web` 冲突。
- 真实地址从后端标准输出里的 `dsh web: http://...` 那一行解析得到。
- 单实例锁：重复双击会聚焦已开的窗口，而不是再拉一个引擎。
- 日志写到 `%APPDATA%\dsh-desktop\desktop.log`。

## 目录

```
D:\DeepseekHarness\Desktop
├─ main.js            Electron 主进程（托盘/窗口/后端生命周期）
├─ splash.html        启动画面
├─ scripts\gen-icons.js  图标生成器（纯 Node，无原生依赖）
├─ assets\            生成的 icon.png / tray.png / icon.ico
├─ package.json
└─ dist\              electron-builder 打包产物（.exe）
```

## 使用

```powershell
cd D:\DeepseekHarness\Desktop
npm install            # 首次安装 Electron（约几百 MB）
npm start              # 直接跑（不打包，方便调试）
npm run dist           # 打包成安装包 + 便携 exe，产物在 dist\
```

## 依赖

- 已全局安装 `@deepseek-ai/dsh`（`dsh` 命令可用）。
- 默认用 `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\lib\bin.js` 定位 dsh。

可用环境变量覆盖：

- `DSH_DESKTOP_DSH_BIN`：dsh 的 `bin.js` 绝对路径。
- `DSH_DESKTOP_NODE`：node 可执行文件路径（默认 `node`）。

## 已知边界

- 托盘“退出”是干净退出；若用任务管理器强杀 Electron 进程，后端可能成为孤儿进程，需手动 `taskkill` 一次。
- 首次打包（`npm run dist`）electron-builder 会从网络下载 NSIS / 签名工具，需要联网。
