// Renders the DeepSeek whale logo (assets/whale.svg) into the app/tray icons
// using Electron's Chromium. Run with: npx electron scripts/render-icons.js
'use strict';

const { app, BrowserWindow, nativeImage, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Sizes embedded in the .ico. Windows Explorer needs the small sizes (16/24/32/48)
// for folder/list/detail views; a 256-only .ico makes the unpacked exe fall back to
// the generic Electron icon while the NSIS/portable exes still render the 256 fine.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// ---- multi-entry ICO container (PNG-compressed entries; Win10/11 handles these) ----
function makeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.size >= 256 ? 0 : img.size; // width (0 => 256)
    entry[1] = img.size >= 256 ? 0 : img.size; // height (0 => 256)
    entry[2] = 0; // palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(img.png.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // offset to resource
    entries.push(entry);
    offset += img.png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
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
    const base = nativeImage.createFromBuffer(p256);
    const images = ICO_SIZES.map((size) => ({
      size,
      png: size === 256 ? p256 : base.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    }));
    const tray = base.resize({ width: 32, height: 32, quality: 'best' });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), p256);
    fs.writeFileSync(path.join(assetsDir, 'tray.png'), tray.toPNG());
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), makeIco(images));
    console.log('icons rendered: icon.png=' + p256.length + ' bytes, ico entries=' + images.length);
  } catch (e) {
    console.error('render failed:', e && e.message);
    process.exitCode = 1;
  }
  app.exit(0);
});
