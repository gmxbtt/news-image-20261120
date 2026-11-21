// THE WORLD IN ONE PAGE — Friday 20 November 2026.
//
// Entry for make.fun news-image-20261120: "Sum up the world's news of
// Friday 20 November 2026 in one image". A Node 22 program, standard
// library only, no assets, no network, fully deterministic: two runs write
// byte-identical PNGs. It draws a newspaper front page in code and writes
// it to entry.png.
//
// The day's news (all first reported on 20 November 2026, corroborated
// across Reuters / WSJ / AFP coverage): Trump, Xi and Putin meet in
// Shenzhen and issue a peace declaration — hours later Russia launches one
// of the largest missile and drone attacks of the war on Ukraine, killing
// eight; the world court rules Myanmar committed genocide against the
// Rohingya, the first time it has held a state responsible; a Houthi
// missile hits Riyadh's tallest tower, the PIF headquarters; Anthropic's
// shares open at $111.50 and close up 17% in the biggest IPO ever; Wall
// Street plunges on Friday, the S&P and Dow into correction as Nvidia
// falls 14%; Mongolia's president resigns and an early election looms.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// framebuffer + drawing primitives
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const fb = new Uint8Array(W * H * 3);

function rgb(hexStr: string): RGB {
  const n = parseInt(hexStr.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function set(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
      i += 3;
    }
  }
}
function hline(x0: number, x1: number, y: number, c: RGB, th = 1): void {
  rect(Math.min(x0, x1), y - Math.floor(th / 2), Math.abs(x1 - x0), th, c);
}
function vline(x: number, y0: number, y1: number, c: RGB, th = 1): void {
  rect(x - Math.floor(th / 2), Math.min(y0, y1), th, Math.abs(y1 - y0), c);
}
// Bresenham, endpoints rounded first so the loop always terminates.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, th = 1): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const r = Math.max(0, Math.floor(th / 2));
  for (;;) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy <= r * r + r) set(ax + ox, ay + oy, c);
      }
    }
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) set(x, y, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, th = 1): void {
  const steps = Math.max(24, Math.floor(2 * Math.PI * r));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const b = ((i + 1) / steps) * 2 * Math.PI;
    line(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), c, th);
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.floor(Math.min(x0, x1, x2));
  const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2));
  const maxY = Math.ceil(Math.max(y0, y1, y2));
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
      const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
      const cc = 1 - a - b;
      if (a >= 0 && b >= 0 && cc >= 0) set(x, y, c);
    }
  }
}
// n-spiked burst, alternating outer/inner radius.
function burst(cx: number, cy: number, rOuter: number, rInner: number, spikes: number, c: RGB): void {
  for (let i = 0; i < spikes * 2; i++) {
    const a0 = (i / (spikes * 2)) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / (spikes * 2)) * 2 * Math.PI - Math.PI / 2;
    const r0 = i % 2 === 0 ? rOuter : rInner;
    const r1 = i % 2 === 0 ? rInner : rOuter;
    tri(cx, cy, cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0), cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1), c);
  }
  disc(cx, cy, rInner * 0.55, c);
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function vgrad(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    const t = yy / Math.max(1, h - 1);
    rect(x, y + yy, w, 1, [
      Math.round(mix(top[0], bottom[0], t)),
      Math.round(mix(top[1], bottom[1], t)),
      Math.round(mix(top[2], bottom[2], t)),
    ]);
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows of 5 bits, stored as 7 numbers
// (bit 4 = leftmost column). All text is uppercased before drawing.
// ---------------------------------------------------------------------------
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0],
  '-': [0, 0, 0, 14, 0, 0, 0],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '%': [25, 26, 2, 4, 8, 11, 19],
  $: [4, 15, 20, 14, 5, 30, 4],
  '&': [12, 18, 20, 8, 21, 18, 13],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '#': [10, 10, 31, 10, 31, 10, 10],
  '@': [14, 17, 23, 21, 22, 16, 14],
  '*': [0, 4, 21, 14, 21, 4, 0],
};
const BLANK: number[] = [0, 0, 0, 0, 0, 0, 0];

function glyph(x: number, y: number, ch: string, s: number, c: RGB): void {
  const g = FONT[ch] || BLANK;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if ((g[r] >> (4 - col)) & 1) rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
// Advance per character, including a 1-unit gap.
function textW(text: string, s: number): number {
  return text.length * 6 * s - s;
}
function text(x: number, y: number, str: string, s: number, c: RGB): void {
  const up = str.toUpperCase();
  for (let i = 0; i < up.length; i++) glyph(x + i * 6 * s, y, up[i], s, c);
}
function textCentred(cx: number, y: number, str: string, s: number, c: RGB): void {
  text(cx - Math.floor(textW(str, s) / 2), y, str, s, c);
}
// Greedy word wrap to maxWidth pixels; returns lines (already uppercased).
function wrap(str: string, s: number, maxWidth: number): string[] {
  const words = str.toUpperCase().split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textW(trial, s) <= maxWidth || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}
// Draw a wrapped paragraph; returns the y just below it.
function para(x: number, y: number, str: string, s: number, maxWidth: number, c: RGB, lh: number, maxLines = 99): number {
  const lines = wrap(str, s, maxWidth).slice(0, maxLines);
  for (let i = 0; i < lines.length; i++) text(x, y + i * lh, lines[i], s, c);
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------
// PNG encoder (deterministic: no ancillary chunks, fixed zlib level)
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const PAPER = rgb('#f6f1e5');
const INK = rgb('#191919');
const RED = rgb('#b3202c');
const NAVY = rgb('#1f3a5f');
const GOLD = rgb('#c8a24a');
const GREY = rgb('#6b675c');
const LIGHT = rgb('#e9e2cf');
const WHITE = rgb('#ffffff');
const ORANGE = rgb('#e07830');
const SMOKE = rgb('#8a8a8a');
const GREEN = rgb('#2e7d32');
const DARK = rgb('#0d1526');

// ---------------------------------------------------------------------------
// illustrations (all flat vector scenes, drawn in code)
// ---------------------------------------------------------------------------

// Lead: three flags over a summit table, missile arc in the sky.
function drawSummit(x: number, y: number, w: number, h: number): void {
  vgrad(x, y, w, h, rgb('#101d33'), rgb('#274b73'));
  // stars
  const stars: [number, number][] = [[0.06, 0.08], [0.2, 0.05], [0.38, 0.1], [0.58, 0.06], [0.78, 0.11], [0.92, 0.05], [0.14, 0.18], [0.5, 0.16], [0.7, 0.2], [0.3, 0.14]];
  for (const [fx, fy] of stars) disc(x + fx * w, y + fy * h, 2, WHITE);
  // missile arc, top right, ending in a burst
  for (let t = 0; t <= 8; t++) {
    if (t % 2 === 0) {
      const t0 = t / 8;
      const t1 = (t + 1) / 8;
      line(
        x + (0.98 - 0.2 * t0) * w, y + (0.04 + 0.34 * t0 * t0) * h,
        x + (0.98 - 0.2 * t1) * w, y + (0.04 + 0.34 * t1 * t1) * h,
        WHITE, 3,
      );
    }
  }
  burst(x + 0.78 * w, y + 0.38 * h, 22, 10, 8, ORANGE);
  burst(x + 0.78 * w, y + 0.38 * h, 12, 5, 8, RED);
  // summit table
  rect(x, y + h * 0.78, w, h * 0.22, rgb('#3a2a1c'));
  rect(x, y + h * 0.78, w, 4, GOLD);
  // three flags on poles above the table
  const flags: { fx: number; draw: (fx: number, fy: number, fw: number, fh: number) => void }[] = [
    {
      fx: 0.14,
      draw: (fx, fy, fw, fh) => {
        // US: stripes + blue canton
        for (let i = 0; i < 7; i++) rect(fx, fy + (i * fh) / 7, fw, fh / 7 + 1, i % 2 === 0 ? RED : WHITE);
        rect(fx, fy, fw * 0.45, fh * 0.55, NAVY);
        for (const [sx, sy] of [[0.1, 0.12], [0.28, 0.12], [0.1, 0.32], [0.28, 0.32], [0.19, 0.22]]) disc(fx + sx * fw, fy + sy * fh, 2, WHITE);
      },
    },
    {
      fx: 0.42,
      draw: (fx, fy, fw, fh) => {
        // China: red field, gold stars
        rect(fx, fy, fw, fh, RED);
        burst(fx + fw * 0.2, fy + fh * 0.25, 7, 3, 5, GOLD);
        for (const [sx, sy] of [[0.62, 0.12], [0.72, 0.3], [0.72, 0.52], [0.62, 0.68]]) burst(fx + sx * fw, fy + sy * fh, 4, 2, 5, GOLD);
      },
    },
    {
      fx: 0.7,
      draw: (fx, fy, fw, fh) => {
        // Russia: white / blue / red tricolour
        rect(fx, fy, fw, fh / 3, WHITE);
        rect(fx, fy + fh / 3, fw, fh / 3, rgb('#2f5aa8'));
        rect(fx, fy + (2 * fh) / 3, fw, fh / 3, RED);
      },
    },
  ];
  for (const f of flags) {
    const fx = x + f.fx * w;
    const fy = y + h * 0.42;
    const fw = 0.2 * w;
    const fh = h * 0.24;
    vline(fx - 3, fy - h * 0.06, y + h * 0.78, GOLD, 3);
    disc(fx - 3, fy - h * 0.06, 4, GOLD);
    f.draw(fx, fy, fw, fh);
  }
}

// The Hague: courthouse with columns, scales of justice above.
function drawCourt(x: number, y: number, w: number, h: number): void {
  vgrad(x, y, w, h, rgb('#dfe8ef'), rgb('#aebfd0'));
  // scales of justice, centred top
  const cx = x + w / 2;
  const cy = y + h * 0.2;
  vline(cx, cy - 16, cy + 18, INK, 3);
  line(cx - 26, cy - 14, cx + 26, cy - 14, INK, 3);
  line(cx - 26, cy - 14, cx - 34, cy + 4, INK, 2);
  line(cx - 26, cy - 14, cx - 18, cy + 4, INK, 2);
  line(cx - 34, cy + 4, cx - 18, cy + 4, INK, 2);
  line(cx + 26, cy - 14, cx + 18, cy + 4, INK, 2);
  line(cx + 26, cy - 14, cx + 34, cy + 4, INK, 2);
  line(cx + 34, cy + 4, cx + 18, cy + 4, INK, 2);
  disc(cx, cy - 18, 4, GOLD);
  // courthouse: pediment + columns + steps
  const baseY = y + h * 0.88;
  tri(x + w * 0.08, y + h * 0.52, x + w * 0.92, y + h * 0.52, cx, y + h * 0.34, INK);
  disc(cx, y + h * 0.43, 8, GOLD);
  for (const fx of [0.14, 0.34, 0.54, 0.74]) {
    rect(x + fx * w, y + h * 0.52, w * 0.09, h * 0.34, WHITE);
    rect(x + fx * w, y + h * 0.52, w * 0.09, 5, INK);
  }
  rect(x + w * 0.08, y + h * 0.86, w * 0.84, 6, INK);
  rect(x + w * 0.04, baseY, w * 0.92, 5, INK);
  rect(x + w * 0.4, y + h * 0.66, w * 0.2, h * 0.2, NAVY);
}

// Riyadh: night skyline, the tall PIF tower hit, burst at mid-height.
function drawRiyadh(x: number, y: number, w: number, h: number): void {
  vgrad(x, y, w, h, DARK, rgb('#2c3e5e'));
  disc(x + 0.86 * w, y + 0.18 * h, 12, GOLD);
  disc(x + 0.89 * w, y + 0.16 * h, 10, DARK);
  const base = y + h;
  const buildings: [number, number, number][] = [
    [0.0, 0.42, 0.1], [0.1, 0.55, 0.1], [0.2, 0.38, 0.09], [0.29, 0.62, 0.1],
    [0.39, 0.48, 0.09], [0.62, 0.55, 0.1], [0.72, 0.4, 0.09], [0.81, 0.58, 0.1], [0.91, 0.45, 0.09],
  ];
  for (const [fx, fh, fw] of buildings) rect(x + fx * w, base - fh * h, fw * w, fh * h, rgb('#101b2e'));
  // PIF tower (tallest, centre) with slanted top
  const tx = x + 0.48 * w;
  rect(tx, y + 0.12 * h, 0.17 * w, h * 0.88, rgb('#2c4a6e'));
  tri(tx, y + 0.12 * h, tx + 0.17 * w, y + 0.12 * h, tx + 0.17 * w, y + 0.02 * h, rgb('#2c4a6e'));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 3; c++) {
      if ((r * 3 + c) % 3 === 0) rect(tx + 4 + c * 10, y + h * (0.2 + r * 0.08), 5, 5, GOLD);
    }
  }
  // damage burst where the missile hit
  burst(tx + 0.07 * w, y + 0.42 * h, 18, 8, 7, ORANGE);
  burst(tx + 0.07 * w, y + 0.42 * h, 10, 4, 7, RED);
  // interceptor trails
  line(x + 0.1 * w, y + 0.12 * h, x + 0.3 * w, y + 0.3 * h, WHITE, 2);
  burst(x + 0.3 * w, y + 0.3 * h, 9, 4, 6, WHITE);
}

// Anthropic debut: a chart that pops to 111.50, then settles at 97.17.
function drawAnthropic(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, WHITE);
  const ox = x + 0.08 * w;
  const oy = y + h * 0.78;
  const pw = w * 0.84;
  const ph = h * 0.56;
  hline(ox, ox + pw, oy, INK, 2);
  vline(ox, oy - ph, oy, INK, 2);
  // price line: 83 -> 111.50 -> 97.17
  const px0 = ox + pw * 0.05;
  const px1 = ox + pw * 0.45;
  const px2 = ox + pw * 0.95;
  const py0 = oy - ph * 0.15;
  const py1 = oy - ph * 0.95;
  const py2 = oy - ph * 0.55;
  line(px0, py0, px1, py1, GREEN, 4);
  line(px1, py1, px2, py2, GREEN, 4);
  disc(px0, py0, 5, INK);
  disc(px1, py1, 6, GOLD);
  disc(px2, py2, 5, INK);
  text(x + 0.38 * w, y + 0.02 * h, '111.50', 2, GOLD);
  text(x + 0.78 * w, y + h * 0.3, '97.17', 2, INK);
  text(x + 0.08 * w, y + h * 0.84, '+17% DAY ONE', 2, GREEN);
}

// Wall Street: a red chart falling hard, with the day's numbers.
function drawMarkets(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, rgb('#2a0e10'));
  const ox = x + 0.08 * w;
  const oy = y + h * 0.72;
  const pw = w * 0.84;
  const ph = h * 0.5;
  hline(ox, ox + pw, oy, WHITE, 2);
  vline(ox, oy - ph, oy, WHITE, 2);
  // falling line in steps
  const pts: [number, number][] = [
    [0.05, 0.95], [0.25, 0.8], [0.4, 0.82], [0.55, 0.55], [0.7, 0.5], [0.85, 0.2], [0.95, 0.12],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    line(ox + pts[i][0] * pw, oy - pts[i][1] * ph, ox + pts[i + 1][0] * pw, oy - pts[i + 1][1] * ph, RED, 4);
  }
  // down arrow at the end
  const ex = ox + 0.95 * pw;
  const ey = oy - 0.12 * ph;
  line(ex, ey - 14, ex, ey + 10, RED, 4);
  line(ex - 8, ey + 2, ex, ey + 10, RED, 4);
  line(ex + 8, ey + 2, ex, ey + 10, RED, 4);
  text(x + 0.08 * w, y + h * 0.82, 'S&P -3.7%', 2, WHITE);
  text(x + 0.5 * w, y + h * 0.06, 'NASDAQ -5.3%', 2, WHITE);
}

// Mongolia: steppe under a big sky, a ballot box in the foreground.
function drawMongolia(x: number, y: number, w: number, h: number): void {
  vgrad(x, y, w, h * 0.6, rgb('#7fb2dd'), rgb('#dfeefc'));
  disc(x + 0.82 * w, y + 0.16 * h, 12, GOLD);
  // rolling hills
  rect(x, y + h * 0.6, w, h * 0.4, rgb('#5d8a4a'));
  for (let i = 0; i < 3; i++) disc(x + (0.2 + i * 0.3) * w, y + h * 0.8, 22, rgb('#6b9a55'));
  // a ger (round tent) in the distance
  const gx = x + 0.68 * w;
  rect(gx, y + h * 0.62, 34, 12, WHITE);
  tri(gx - 3, y + h * 0.62, gx + 37, y + h * 0.62, gx + 17, y + h * 0.52, RED);
  // ballot box, front centre
  const bx = x + w * 0.32;
  const by = y + h * 0.55;
  rect(bx, by, w * 0.36, h * 0.3, WHITE);
  rect(bx, by, w * 0.36, 6, NAVY);
  rect(bx + w * 0.13, by - 4, w * 0.1, 8, INK);
  // ballot slip going in
  rect(bx + w * 0.14, by - h * 0.22, w * 0.08, h * 0.2, rgb('#f7d774'));
  line(bx + w * 0.16, by - h * 0.18, bx + w * 0.19, by - h * 0.12, RED, 2);
  line(bx + w * 0.19, by - h * 0.12, bx + w * 0.21, by - h * 0.06, RED, 2);
  textCentred(x + w / 2, by + h * 0.14, 'VOTE', 2, NAVY);
}

// ---------------------------------------------------------------------------
// layout — a newspaper front page, 1024 x 1024
// ---------------------------------------------------------------------------
function border(x: number, y: number, w: number, h: number, c: RGB, th = 2): void {
  hline(x, x + w, y, c, th);
  hline(x, x + w, y + h, c, th);
  vline(x, y, y + h, c, th);
  vline(x + w, y, y + h, c, th);
}

function main(): void {
  rect(0, 0, W, H, PAPER);

  // masthead
  textCentred(512, 30, 'THE WORLD IN ONE PAGE', 6, INK);
  hline(24, 1000, 84, INK, 3);
  hline(24, 1000, 89, INK, 1);
  textCentred(512, 98, 'FRIDAY 20 NOVEMBER 2026', 3, INK);
  hline(24, 1000, 130, INK, 3);

  // ---- lead: Shenzhen summit, then missiles ------------------------------
  drawSummit(24, 140, 476, 312);
  border(24, 140, 476, 312, INK);
  text(524, 144, 'PEACE TALK IN', 2, RED);
  text(524, 172, 'SUMMIT DECLARES', 4, INK);
  text(524, 204, 'PEACE - THEN', 4, INK);
  text(524, 236, 'RUSSIA STRIKES', 4, INK);
  para(
    524, 282,
    "Trump said he held 'very good talks' with Putin at a three-way summit with Xi Jinping in Shenzhen, and the three leaders issued a peace declaration. Hours later Russia launched one of the largest missile and drone attacks of the war on Ukraine, killing eight people and pummeling power plants.",
    2, 476, INK, 15, 9,
  );

  // ---- divider ------------------------------------------------------------
  hline(24, 1000, 462, INK, 2);

  // ---- row 2: The Hague + Riyadh -------------------------------------------
  drawCourt(24, 472, 476, 110);
  border(24, 472, 476, 110, INK);
  text(24, 592, 'WORLD COURT:', 3, INK);
  text(24, 616, 'MYANMAR GUILTY', 3, INK);
  para(
    24, 648,
    'The world court ruled Myanmar committed genocide against the Rohingya, the first time it has held a state responsible. Myanmar called the ruling unfair.',
    2, 476, INK, 15, 4,
  );

  drawRiyadh(524, 472, 476, 110);
  border(524, 472, 476, 110, INK);
  text(524, 592, 'MISSILE HITS', 3, INK);
  text(524, 616, "RIYADH'S TOP TOWER", 3, INK);
  para(
    524, 648,
    'A Houthi missile hit Riyadh’s tallest tower, the PIF headquarters, blowing out windows on seven floors. No one was hurt.',
    2, 476, INK, 15, 4,
  );

  // ---- divider ------------------------------------------------------------
  hline(24, 1000, 740, INK, 2);

  // ---- row 3: Anthropic + markets + Mongolia -------------------------------
  drawAnthropic(24, 750, 310, 84);
  border(24, 750, 310, 84, INK);
  text(24, 842, 'ANT SOARS, THEN', 2, INK);
  text(24, 860, 'FADES ON DEBUT', 2, INK);
  para(
    24, 884,
    'Anthropic opened at $111.50, up 34% on its $83 IPO price, and closed up 17% at $97.17 in the biggest IPO ever.',
    2, 310, INK, 14, 5,
  );

  drawMarkets(357, 750, 310, 84);
  border(357, 750, 310, 84, INK);
  text(357, 842, 'WALL ST PLUNGES', 2, INK);
  text(357, 860, 'INTO CORRECTION', 2, INK);
  para(
    357, 884,
    'The S&P fell 3.7% and the Nasdaq 5.3% on Friday, both into correction. Nvidia fell 14% as its ex-chief faces a probe.',
    2, 310, INK, 14, 5,
  );

  drawMongolia(690, 750, 310, 84);
  border(690, 750, 310, 84, INK);
  text(690, 842, "MONGOLIA'S", 2, INK);
  text(690, 860, 'PRESIDENT QUITS', 2, INK);
  para(
    690, 884,
    'Parliament accepted President Khurelsukh’s resignation after corruption claims, setting up an early election.',
    2, 310, INK, 14, 5,
  );

  // ---- footer ---------------------------------------------------------------
  hline(24, 1000, 972, INK, 2);
  textCentred(512, 982, 'REPORTED FRIDAY 20 NOVEMBER 2026', 2, GREY);

  // ---- write ---------------------------------------------------------------
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG();
  writeFileSync(join(outDir, 'entry.png'), png);
  // eslint-disable-next-line no-console
  console.log(`entry.png ${png.length} bytes -> ${join(outDir, 'entry.png')}`);
}

main();
