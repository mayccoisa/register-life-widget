// Gera PNGs de ícone em runtime — sem precisar de arquivos externos.
// Usado pra tray icon e janela. Cores diferentes refletem estado do timer.

const zlib = require('zlib');
const { nativeImage } = require('electron');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function buildPng(size, drawPixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y);
      const i = y * stride + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Hex string → [r, g, b]
function hex(c) {
  const m = c.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

// Desenha um relógio simples: círculo cheio + ponteiros brancos
function makeClockIcon(size, fillHex) {
  const [fr, fg, fb] = hex(fillHex);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  const innerRadius = radius - Math.max(1, size / 16);

  // Ponteiros: 12h (vertical até centro) e 3h (horizontal até centro)
  const handLen = innerRadius * 0.7;
  const handThickness = Math.max(0.6, size / 16);

  return buildPng(size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > radius + 0.5) return [0, 0, 0, 0]; // fora: transparente

    // Anti-aliasing simples na borda
    const edgeAlpha = Math.max(0, Math.min(1, radius + 0.5 - dist)) * 255;

    // Ponteiro 12h: x ≈ cx, y de cy a cy - handLen
    const onHandV = Math.abs(dx) <= handThickness && dy <= 0 && dy >= -handLen;
    // Ponteiro 3h: y ≈ cy, x de cx a cx + handLen
    const onHandH = Math.abs(dy) <= handThickness && dx >= 0 && dx <= handLen;

    if (onHandV || onHandH) {
      return [255, 255, 255, Math.round(edgeAlpha)];
    }
    return [fr, fg, fb, Math.round(edgeAlpha)];
  });
}

const COLORS = {
  idle: '#4f9eff',     // azul (sem timer)
  running: '#4ade80',  // verde (rodando)
  paused: '#fbbf24',   // amarelo (pausado)
  pomodoro: '#ff5c5c', // vermelho (pomodoro ativo)
};

const cache = new Map();

function getTrayIcon(state = 'idle') {
  const key = `tray-${state}`;
  if (cache.has(key)) return cache.get(key);
  const png = makeClockIcon(16, COLORS[state] || COLORS.idle);
  const img = nativeImage.createFromBuffer(png);
  cache.set(key, img);
  return img;
}

function getAppIcon() {
  if (cache.has('app')) return cache.get('app');
  const png = makeClockIcon(64, COLORS.idle);
  const img = nativeImage.createFromBuffer(png);
  cache.set('app', img);
  return img;
}

module.exports = { getTrayIcon, getAppIcon, COLORS };
