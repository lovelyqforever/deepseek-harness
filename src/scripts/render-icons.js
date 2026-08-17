// Renders the DeepSeek whale logo (assets/whale.svg) into the app/tray icons
// using Electron's Chromium. Run with: npx electron scripts/render-icons.js
'use strict';

const { app, BrowserWindow, nativeImage, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// ---- PNG-in-ICO container (single 256x256 entry, PNG-compressed) ----
function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8); // bytes in resource
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, png]);
}

const whaleSvg = fs.readFileSync(path.join(assetsDir, 'whale.svg'), 'utf8')
  .replace(/<style>[\s\S]*?<\/style>/, ''); // strip the prefers-color-scheme media query

function htmlFor(size) {
  const svg = whaleSvg
    .replace(/width="50\.000000"/, 'width="100%"')
    .replace(/height="50\.000000"/, 'height="100%"');
  const whale = Math.round(size * 0.62);
  return `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;background:#000000}
    svg{width:${whale}px;height:${whale}px;display:block}
    path{fill:#ffffff !important}
  </style></head><body>${svg}</body></html>`;
}

async function render256() {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlFor(256)));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const png = img.toPNG();
  win.destroy();
  return png;
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  try {
    const p256 = await render256();
    const tray = nativeImage.createFromBuffer(p256).resize({ width: 32, height: 32, quality: 'best' });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), p256);
    fs.writeFileSync(path.join(assetsDir, 'tray.png'), tray.toPNG());
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), makeIco(p256));
    console.log('icons rendered: icon.png=' + p256.length + ' bytes');
  } catch (e) {
    console.error('render failed:', e && e.message);
    process.exitCode = 1;
  }
  app.exit(0);
});
