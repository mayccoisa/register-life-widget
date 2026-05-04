// Gera build/icon.ico e build/icon.png a partir do gerador em src/icon.js.
// Executado antes do empacotamento (electron-builder).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePngClock(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  const innerRadius = radius - Math.max(1, size / 16);
  const handLen = innerRadius * 0.7;
  const handThickness = Math.max(0.6, size / 16);
  const [fr, fg, fb] = [79, 158, 255]; // azul

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = y * stride + 1 + x * 4;
      if (dist > radius + 0.5) { raw[i + 3] = 0; continue; }
      const a = Math.max(0, Math.min(1, radius + 0.5 - dist)) * 255;
      const onHandV = Math.abs(dx) <= handThickness && dy <= 0 && dy >= -handLen;
      const onHandH = Math.abs(dy) <= handThickness && dx >= 0 && dx <= handLen;
      if (onHandV || onHandH) { raw[i] = 255; raw[i+1] = 255; raw[i+2] = 255; raw[i+3] = Math.round(a); }
      else { raw[i] = fr; raw[i+1] = fg; raw[i+2] = fb; raw[i+3] = Math.round(a); }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO container com PNG embutidos (suportado no Windows Vista+).
function makeIco(sizes) {
  const pngs = sizes.map((s) => ({ size: s, png: makePngClock(s) }));
  const headerSize = 6 + pngs.length * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type ICO
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = headerSize;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size; // width (0 = 256)
    e[1] = size === 256 ? 0 : size; // height
    e[2] = 0; // colors
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8); // bytes
    e.writeUInt32LE(offset, 12);    // offset
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

const buildDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(buildDir, { recursive: true });

// PNG 256x256 (usado como icon.png e fallback)
fs.writeFileSync(path.join(buildDir, 'icon.png'), makePngClock(256));
console.log('✓ build/icon.png');

// ICO multi-size (16, 32, 48, 64, 128, 256)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco([16, 32, 48, 64, 128, 256]));
console.log('✓ build/icon.ico');
