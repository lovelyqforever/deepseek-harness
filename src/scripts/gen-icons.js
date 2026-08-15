// Generates the app/tray icons as real PNGs (plus a PNG-backed .ico for
// electron-builder) using only Node's built-in zlib — no native deps.
//
// Usage: node scripts/gen-icons.js

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ---- CRC32 (for PNG chunk checksums) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, pixelFn) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing: rounded indigo square + white center dot ----
function roundedRectDistance(x, y, size, radius) {
  const center = (size - 1) / 2;
  const half = size / 2;
  const dx = Math.max(Math.abs(x - center) - (half - radius), 0);
  const dy = Math.max(Math.abs(y - center) - (half - radius), 0);
  return Math.sqrt(dx * dx + dy * dy) - radius;
}

function drawIcon(size) {
  const radius = size * 0.24;
  const dotR = size * 0.26;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const top = [129, 140, 248]; // indigo-400
  const bottom = [67, 56, 202]; // indigo-700
  return (x, y) => {
    const d = roundedRectDistance(x, y, size, radius);
    if (d > 1) return [0, 0, 0, 0];
    const t = y / (size - 1);
    let r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    let g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    let b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= dotR * dotR) {
      r = 255;
      g = 255;
      b = 255;
    }
    const a = d <= 0 ? 255 : Math.round(255 * (1 - d));
    return [r, g, b, a];
  };
}

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

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const icon256 = encodePng(256, drawIcon(256));
const tray32 = encodePng(32, drawIcon(32));

fs.writeFileSync(path.join(assetsDir, 'icon.png'), icon256);
fs.writeFileSync(path.join(assetsDir, 'tray.png'), tray32);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), makeIco(icon256));

console.log('icons written to', assetsDir);
