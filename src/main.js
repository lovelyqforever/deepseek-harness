// DeepSeek Harness desktop shell (Electron wrapper).
//
// Behaviour:
//   - Double-click => open a native window and boot the `dsh web` backend in
//     the background (it is spawned as a child process, same engine you run in
//     the terminal).
//   - The window can be resized / maximised / full-screened freely.
//   - Clicking the window's X button HIDES it to the system tray; it does NOT
//     quit. The backend keeps running (pre-warmed).
//   - Right-click the tray icon => "打开主界面" (show) or "退出" (quit).
//   - "退出" kills the whole `dsh web` process tree, then exits Electron.
//
// The backend is booted on a FIXED port (WEB_PORT) instead of `--port 0`. A
// fixed port keeps the origin (http://127.0.0.1:<port>) stable across launches,
// so the web frontend's localStorage state — notably the last active
// conversation (`dsh.sessions.current`) — survives restarts. The actual URL is
// read from the backend's `dsh web: http://...` stdout line.

'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme, shell, ipcMain } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_ID = 'com.deepseek.dshdesktop';
const APP_NAME = 'DeepSeek Harness';
const WEB_PORT = '3210'; // fixed port: keeps the web origin stable so localStorage (last conversation) survives restarts
const LOG_DIR = path.join(app.getPath('appData'), 'dsh-desktop'); // %APPDATA%\dsh-desktop
const LOG_FILE = path.join(LOG_DIR, 'desktop.log');

// ---------------------------------------------------------------------------
// logging (also echoes to stdout so `npm start` shows it in a terminal)
// ---------------------------------------------------------------------------
function log(...args) {
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
  // eslint-disable-next-line no-console
  console.log(`[dsh-desktop] ${line}`);
}

// ---------------------------------------------------------------------------
// backend discovery
// ---------------------------------------------------------------------------
function defaultDshBin() {
  const fromEnv = process.env.DSH_DESKTOP_DSH_BIN;
  const candidates = [];
  if (fromEnv) candidates.push(fromEnv);
  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    );
  }
  candidates.push(
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  );
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return fromEnv || candidates.find(Boolean) || '';
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let mainWindow = null;
let tray = null;
let backend = null; // child process
let backendUrl = null; // e.g. http://127.0.0.1:54321
let isQuitting = false;

const asset = (name) => path.join(__dirname, 'assets', name);

// ---------------------------------------------------------------------------
// backend lifecycle
// ---------------------------------------------------------------------------
function startBackend() {
  const nodeBin = process.env.DSH_DESKTOP_NODE || 'node';
  const dshBin = defaultDshBin();
  log('resolved node=', nodeBin, 'dshBin=', dshBin);

  if (!fs.existsSync(dshBin)) {
    const msg = `找不到 dsh 程序（${dshBin}）。请先运行 npm install -g @deepseek-ai/dsh，或用环境变量 DSH_DESKTOP_DSH_BIN 指定路径。`;
    log('ERROR', msg);
    showSplashError(msg);
    return;
  }

  backend = spawn(nodeBin, [dshBin, '--profile', 'web', '--port', WEB_PORT], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  log('backend spawned, pid=', backend.pid);

  const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  let stdoutBuf = '';
  let stderrBuf = '';

  backend.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    // process complete lines
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stripAnsi(stdoutBuf.slice(0, idx)).trim();
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (line) {
        log('backend:', line);
        const m = line.match(/^dsh web:\s+(http:\/\/\S+)/);
        if (m && !backendUrl) {
          backendUrl = m[1];
          log('backend ready at', backendUrl);
          loadApp();
        }
      }
    }
  });

  backend.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    let idx;
    while ((idx = stderrBuf.indexOf('\n')) >= 0) {
      const line = stderrBuf.slice(0, idx).trim();
      stderrBuf = stderrBuf.slice(idx + 1);
      if (line) log('backend stderr:', line);
    }
  });

  backend.on('error', (err) => {
    log('backend spawn error:', err.message);
    backend = null;
    showSplashError('启动引擎失败：' + err.message);
  });

  backend.on('exit', (code, signal) => {
    log('backend exited, code=', code, 'signal=', signal);
    backend = null;
    backendUrl = null;
    if (!isQuitting) {
      showSplashError('引擎已停止（code=' + code + '）。请从托盘选择“退出”后重新打开。');
    }
  });
}

function killBackend() {
  if (!backend || !backend.pid) return;
  const pid = backend.pid;
  log('killing backend process tree, pid=', pid);
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      log('taskkill succeeded');
    } catch (err) {
      log('taskkill failed (process may already be gone):', err.message);
    }
  }
  try {
    backend.kill();
  } catch {}
  backend = null;
  backendUrl = null;
}

// ---------------------------------------------------------------------------
// window + splash
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    backgroundColor: '#0f1115',
    icon: asset('icon.png'),
    frame: false, // 去掉原生标题栏，改由前端自绘（跟随主题 / 自定义背景）
    thickFrame: true, // 保留 Windows 原生边缘拉伸与阴影
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links in the system browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Zoom / fullscreen shortcuts. The removed default menu used to provide
  // these; reimplement them so Ctrl++ / Ctrl+- / Ctrl+0 behave consistently.
  // Note: on most keyboards "Ctrl++" is physically Ctrl+Shift+=, so we accept
  // Ctrl+=, Ctrl+Shift+= and numpad + as zoom-in.
  const clampZoom = (level) => Math.max(-5, Math.min(5, level));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // F11 fullscreen (no modifiers).
    if (input.key === 'F11' && !input.control && !input.meta && !input.alt) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
      return;
    }

    if (!input.control && !input.meta) return;
    if (input.alt) return; // don't hijack AltGr (Ctrl+Alt) combos

    const key = input.key.toLowerCase();
    const code = input.code || '';

    // Ctrl+Shift+I => devtools (kept for debugging; no menu entry now).
    if (input.shift && (key === 'i' || code === 'KeyI')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }

    if (!input.shift && (key === '-' || code === 'NumpadSubtract')) {
      mainWindow.webContents.setZoomLevel(clampZoom(mainWindow.webContents.getZoomLevel() - 0.5));
      event.preventDefault();
    } else if (!input.shift && (key === '0' || code === 'Numpad0')) {
      mainWindow.webContents.setZoomLevel(0);
      event.preventDefault();
    } else if (key === '=' || key === '+' || code === 'NumpadAdd') {
      mainWindow.webContents.setZoomLevel(clampZoom(mainWindow.webContents.getZoomLevel() + 0.5));
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('window shown');
  });

  // X button => hide to tray (do not quit)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      log('window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Push maximize/restore state to the web-drawn title bar (icon swap).
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximize-change', false);
  });

  // Start on a splash while the backend boots.
  mainWindow.loadFile('splash.html');
}

function loadApp() {
  if (!mainWindow || mainWindow.isDestroyed() || !backendUrl) return;
  log('loading', backendUrl);
  mainWindow.loadURL(backendUrl).catch((err) => {
    log('loadURL failed:', err.message);
    showSplashError('加载界面失败：' + err.message);
  });
}

function showSplashError(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const encoded = encodeURIComponent(message);
  mainWindow.loadFile('splash.html', { search: 'err=' + encoded }).catch(() => {});
}

// ---------------------------------------------------------------------------
// tray
// ---------------------------------------------------------------------------
function createTray() {
  let image;
  try {
    image = nativeImage.createFromPath(asset('tray.png'));
  } catch {}
  if (!image || image.isEmpty()) {
    // fallback: 1x1 so Tray never throws
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主界面', click: () => showWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          log('quit requested from tray');
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  // Left-click also brings the window back.
  tray.on('click', () => showWindow());
  log('tray created');
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    if (backendUrl) loadApp();
    else if (!backend) startBackend();
  }
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------------------
// frameless window-control IPC (the web UI draws the title bar)
// ---------------------------------------------------------------------------
function setupIpc() {
  ipcMain.on('win:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.on('win:toggle-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('win:close', () => {
    // Same as the native X: hide to tray, do not quit.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  ipcMain.on('win:is-maximized', (event) => {
    event.returnValue = !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });
  ipcMain.on('win:set-native-theme', (_event, theme) => {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      nativeTheme.themeSource = theme;
    }
  });
}

// ---------------------------------------------------------------------------
// app lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('another instance is running; quitting');
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    log('second-instance signal received');
    showWindow();
  });

  app.whenReady().then(() => {
    log('electron ready');
    // Frameless: the native title bar is gone (the web UI draws its own).
    // Native dialogs/menus follow the OS appearance; the web side can override
    // via window.desktop.setNativeTheme().
    // Remove the default File/Edit/View/Window/Help menu bar entirely; it is a
    // browser-style menu that does not match this desktop client. Its useful
    // accelerators (zoom, fullscreen) are reimplemented in createWindow().
    Menu.setApplicationMenu(null);
    setupIpc();
    createTray();
    createWindow();
    startBackend();
  });

  // Keep the app alive when all windows are closed (it lives in the tray).
  app.on('window-all-closed', () => {
    log('all windows closed (staying in tray)');
  });

  app.on('activate', () => {
    showWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    log('before-quit');
  });

  app.on('will-quit', () => {
    log('will-quit: killing backend');
    killBackend();
  });

  app.on('quit', () => {
    log('quit');
  });
}
