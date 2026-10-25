import zlib from 'node:zlib';
import crypto from 'node:crypto';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode des pixels RGB 8 bits en PNG. */
export function encodePng(width: number, height: number, rgb: Uint8Array, text?: Record<string, string>): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  for (const [k, v] of Object.entries(text ?? {})) parts.push(chunk('tEXt', Buffer.from(`${k}\0${v}`, 'latin1')));
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

export function hash32(s: string): number {
  return crypto.createHash('sha256').update(s).digest().readUInt32BE(0);
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT: Record<string, string[]> = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawLabel(rgb: Uint8Array, w: number, h: number, label: string, scale: number): void {
  const pad = scale * 4;
  let x0 = pad;
  const y0 = h - pad - 7 * scale;
  for (const ch of label) {
    const g = FONT[ch];
    if (!g) continue;
    for (let gy = 0; gy < 7; gy++)
      for (let gx = 0; gx < 5; gx++)
        if (g[gy]![gx] === '1')
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) {
              const x = x0 + gx * scale + sx, y = y0 + gy * scale + sy;
              if (x >= w || y >= h) continue;
              const i = (y * w + x) * 3;
              rgb[i] = 255; rgb[i + 1] = 244; rgb[i + 2] = 214;
            }
    x0 += 6 * scale;
  }
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Image synthétique déterministe (démo sans GPU) : paysage nocturne (aurore, planète ou couchant). Dépend du prompt et de la graine. */
export function mockImage(width: number, height: number, prompt: string, seed: number): Buffer {
  const hs = hash32(`${prompt}|${seed}`);
  const rnd = mulberry32(hs);
  const scene = Math.floor(rnd() * 3);
  const hue = scene === 2 ? 8 + rnd() * 30 : 170 + rnd() * 150;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const fr = [2 + rnd() * 2, 1.5 + rnd() * 2, 2.5 + rnd() * 2];
  const top = hsl2rgb(hue + 210, 0.55, scene === 2 ? 0.14 : 0.05);
  const bot = hsl2rgb(hue + (scene === 2 ? 15 : 160), 0.6, scene === 2 ? 0.52 : 0.16);
  const ridgeBase = scene === 2 ? 0.62 : 0.78;
  const cell = Math.max(2, Math.round(width / 260));
  const rgb = new Uint8Array(width * height * 3);
  const aspect = width / height;
  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const ridge = ridgeBase + 0.07 * Math.sin(u * 7 + ph[0]!) + 0.035 * Math.sin(u * 19 + ph[1]!) + 0.015 * Math.sin(u * 47 + ph[2]!);
      let r: number, g: number, b: number;
      if (v >= ridge) {
        if (scene === 2) {
          const sea = hsl2rgb(hue + 200, 0.6, 0.1 + (1 - (v - ridge) / (1 - ridge)) * 0.14);
          const streak = Math.exp(-Math.pow((u - 0.5) / (0.03 + (v - ridge) * 0.3), 2)) * (0.5 + 0.5 * Math.sin(v * 220 + ph[3]!)) * 0.7;
          r = sea[0] + 255 * streak; g = sea[1] + 190 * streak; b = sea[2] + 120 * streak;
        } else {
          const d = 1 - (v - ridge) * 2;
          r = 8 * d + 3; g = 10 * d + 4; b = 18 * d + 6;
        }
      } else {
        const k = Math.pow(v / ridge, 1.4);
        r = top[0] + (bot[0] - top[0]) * k; g = top[1] + (bot[1] - top[1]) * k; b = top[2] + (bot[2] - top[2]) * k;
        if (scene === 0) {
          for (let n = 0; n < 3; n++) {
            const yc = 0.22 + 0.09 * n + 0.07 * Math.sin(u * fr[n]! * 3.14 + ph[n]!);
            const w = (v - yc) / 0.06;
            const a = Math.exp(-w * w) * (0.55 + 0.45 * Math.sin(u * 16 + n * 2 + ph[3]!)) * 0.85;
            const c = hsl2rgb(hue + n * 35, 0.9, 0.6);
            r += c[0] * a; g += c[1] * a; b += c[2] * a;
          }
        } else if (scene === 1) {
          const dx = (u - 0.64) * aspect, dy = v - 0.42, d = Math.sqrt(dx * dx + dy * dy);
          const R = 0.2;
          if (d < R) {
            const lx = (dx / R) * -0.6 + (dy / R) * -0.6;
            const lit = Math.max(0, Math.min(1, 0.55 + lx * 0.5)) + 0.05 * Math.sin(dy * 60 + ph[1]!);
            const c = hsl2rgb(hue + 20 * (dy / R), 0.7, 0.12 + 0.5 * lit);
            r = c[0]; g = c[1]; b = c[2];
          } else {
            const gl = Math.exp(-(d - R) * 9) * 0.6;
            const c = hsl2rgb(hue, 0.8, 0.6);
            r += c[0] * gl; g += c[1] * gl; b += c[2] * gl;
          }
        } else {
          const dx = (u - 0.5) * aspect, dy = v - ridge, d = Math.sqrt(dx * dx + dy * dy);
          const gl = Math.exp(-d * 5) * 0.9 + (d < 0.07 ? 1 : 0);
          r += 255 * gl; g += 215 * gl; b += 150 * gl;
        }
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        const sh = Math.imul(cx * 73856093 ^ cy * 19349663 ^ hs, 2654435761) >>> 0;
        if (v < ridge * 0.9 && sh % 700 === 0) {
          const tw = 140 + (sh >>> 12) % 115;
          r += tw; g += tw; b += tw * 0.9;
        }
      }
      const dx2 = u - 0.5, dy2 = v - 0.5;
      const vig = 1 - Math.min(0.5, (dx2 * dx2 + dy2 * dy2) * 1.1);
      const i = (y * width + x) * 3;
      rgb[i] = Math.min(255, r * vig); rgb[i + 1] = Math.min(255, g * vig); rgb[i + 2] = Math.min(255, b * vig);
    }
  }
  drawLabel(rgb, width, height, 'ZODIAK MOCK', Math.max(2, Math.round(width / 260)));
  return encodePng(width, height, rgb, { Software: 'ZODIAK AI mock backend', Comment: 'Image synthétique : aucun modèle IA utilisé' });
}
