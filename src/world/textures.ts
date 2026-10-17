import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, type Texture } from 'three';

// All textures are painted in code at start-up (no image files), so every
// pixel of art in the game is original.

/** Small, fast, repeatable random-number generator (same seed = same art). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise that tiles seamlessly every `period` cells. */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wrap = (v: number) => ((v % period) + period) % period;
  const a = hash2(wrap(xi), wrap(yi), seed);
  const b = hash2(wrap(xi + 1), wrap(yi), seed);
  const c = hash2(wrap(xi), wrap(yi + 1), seed);
  const d = hash2(wrap(xi + 1), wrap(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Layered noise (several sizes added together), tileable, roughly 0..1. */
export function fbm(x: number, y: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(x * period, y * period, period, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/** Non-tiling 2D noise for world-space use (terrain colour and height). */
export function worldNoise(x: number, z: number, scale: number, seed: number): number {
  const period = 1024;
  return fbm((x * scale) / period, (z * scale) / period, period, 4, seed);
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement, color = true): Texture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Paints every pixel from a function returning [r, g, b] (0..255) and a height (0..1). */
function paint(
  size: number,
  fn: (u: number, v: number) => { rgb: Rgb; height: number },
): { color: Texture; bump: Texture } {
  const [canvas, ctx] = makeCanvas(size);
  const [bumpCanvas, bumpCtx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const bump = bumpCtx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { rgb, height } = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
      const h = Math.max(0, Math.min(255, height * 255));
      bump.data[i] = h;
      bump.data[i + 1] = h;
      bump.data[i + 2] = h;
      bump.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bumpCtx.putImageData(bump, 0, 0);
  return { color: finish(canvas), bump: finish(bumpCanvas, false) };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(a: Rgb, k: number): Rgb {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** Packed dirt with pebbles and darker damp patches. */
export function dirtTexture(): { color: Texture; bump: Texture } {
  const base = hexToRgb('#6b5843');
  const dark = hexToRgb('#3f3226');
  const light = hexToRgb('#8a765e');
  return paint(512, (u, v) => {
    const big = fbm(u, v, 4, 4, 11);
    const fine = fbm(u, v, 32, 3, 23);
    const pebbles = tileNoise(u * 90, v * 90, 90, 5);
    let c = mix(dark, base, Math.min(1, big * 1.6));
    c = mix(c, light, Math.max(0, fine - 0.55) * 1.4);
    let h = big * 0.4 + fine * 0.6;
    if (pebbles > 0.82) {
      const p = (pebbles - 0.82) / 0.18;
      c = mix(c, scale(light, 1.1), p * 0.8);
      h += p * 0.6;
    }
    return { rgb: scale(c, 0.9 + fine * 0.2), height: h * 0.8 };
  });
}

/** Weathered wooden planks running vertically. */
export function plankTexture(tint = '#6d5038', planks = 6, seed = 3): { color: Texture; bump: Texture } {
  const wood = hexToRgb(tint);
  const dark = scale(wood, 0.45);
  const rand = seededRandom(seed);
  const shades = Array.from({ length: planks }, () => 0.75 + rand() * 0.45);
  return paint(256, (u, v) => {
    const plank = Math.floor(u * planks);
    const within = u * planks - plank;
    const grain = fbm(u * 0.25 + plank * 0.37, v, 32, 3, 40 + plank);
    const streak = Math.sin((v * 40 + grain * 6 + plank * 3.1) * Math.PI) * 0.5 + 0.5;
    let c = scale(wood, shades[plank] * (0.8 + streak * 0.25));
    c = mix(c, dark, Math.max(0, grain - 0.6) * 1.5);
    const gap = within < 0.04 || within > 0.96;
    if (gap) c = scale(dark, 0.6);
    const knot = tileNoise(u * 24, v * 24, 24, 90 + plank);
    if (knot > 0.9) c = mix(c, dark, (knot - 0.9) * 8);
    return { rgb: c, height: gap ? 0 : 0.5 + streak * 0.2 + grain * 0.3 };
  });
}

/** Grey fieldstones with dark mortar between them (used for the well). */
export function stoneTexture(): { color: Texture; bump: Texture } {
  const stone = hexToRgb('#77736b');
  const mortar = hexToRgb('#3a3631');
  const rows = 6;
  return paint(256, (u, v) => {
    const row = Math.floor(v * rows);
    const offset = (row % 2) * 0.5;
    const cols = 4;
    const uu = u * cols + offset;
    const col = Math.floor(uu);
    const fu = uu - col;
    const fv = v * rows - row;
    const edge = Math.min(fu, 1 - fu, fv * 0.6, (1 - fv) * 0.6);
    const shade = 0.7 + hash2(col % cols, row, 7) * 0.5;
    const n = fbm(u, v, 16, 3, 70);
    const isMortar = edge < 0.05;
    const c = isMortar ? mortar : scale(mix(stone, hexToRgb('#5d6a55'), Math.max(0, n - 0.6) * 1.5), shade);
    return { rgb: c, height: isMortar ? 0 : Math.min(1, edge * 5) * 0.7 + n * 0.3 };
  });
}

/** Dirty lime plaster for house walls. */
export function plasterTexture(): { color: Texture; bump: Texture } {
  const plaster = hexToRgb('#a39a88');
  const grime = hexToRgb('#5e5547');
  return paint(256, (u, v) => {
    const n = fbm(u, v, 4, 5, 101);
    const streak = fbm(u * 1.0, v * 0.15, 8, 3, 202);
    const c = mix(plaster, grime, Math.min(1, Math.max(0, n - 0.35) * 1.4 + Math.max(0, streak - 0.55) * 1.5));
    return { rgb: c, height: n };
  });
}

/** Overlapping dark wooden shingles for roofs. */
export function shingleTexture(): { color: Texture; bump: Texture } {
  const wood = hexToRgb('#4a3d34');
  const rows = 8;
  return paint(256, (u, v) => {
    const row = Math.floor(v * rows);
    const fv = v * rows - row;
    const uu = u * 6 + (row % 2) * 0.5;
    const col = Math.floor(uu);
    const fu = uu - col;
    const shade = 0.65 + hash2(col % 6, row, 33) * 0.5;
    const n = fbm(u, v, 16, 3, 300);
    const gap = fu < 0.05 || fv > 0.92;
    const c = gap ? scale(wood, 0.35) : scale(mix(wood, hexToRgb('#4f5a48'), Math.max(0, n - 0.55)), shade * (0.75 + fv * 0.35));
    return { rgb: c, height: gap ? 0 : fv * 0.8 + n * 0.2 };
  });
}

/** Straw for hay bales and thatch. */
export function strawTexture(): { color: Texture; bump: Texture } {
  const straw = hexToRgb('#9c8455');
  const dark = hexToRgb('#5c4a2c');
  return paint(256, (u, v) => {
    const strands = fbm(u * 0.08, v, 64, 3, 500);
    const clumps = fbm(u, v, 4, 3, 501);
    const c = mix(dark, straw, Math.min(1, strands * 0.9 + clumps * 0.5));
    return { rgb: c, height: strands };
  });
}

/** Red painted steel with scuffs and rust, for explosive barrels. */
export function barrelTexture(): { color: Texture; bump: Texture } {
  const paintRed = hexToRgb('#8a1f17');
  const rust = hexToRgb('#4a2a1a');
  const bare = hexToRgb('#5a5450');
  return paint(256, (u, v) => {
    const n = fbm(u, v, 8, 4, 600);
    const drips = fbm(u * 0.4, v * 0.05, 16, 2, 601);
    let c = mix(paintRed, rust, Math.max(0, n - 0.55) * 2 + Math.max(0, drips - 0.6) * 1.5);
    if (n > 0.78) c = mix(c, bare, (n - 0.78) * 4);
    // A pale warning band with a simple original flame mark.
    const du = Math.abs(((u * 2) % 1) - 0.5);
    const dv = v - 0.5;
    if (Math.abs(dv) < 0.11 && du < 0.12) {
      const inFlame = du < 0.07 * (1 - (dv + 0.11) / 0.22) + 0.015 && dv > -0.08;
      c = inFlame ? hexToRgb('#2a1a12') : mix(hexToRgb('#c8b27a'), c, Math.max(0, n - 0.6));
    }
    return { rgb: c, height: n * 0.5 };
  });
}

/** Rough wooden crate side: horizontal boards inside a darker frame with a brace. */
export function crateTexture(): { color: Texture; bump: Texture } {
  const wood = hexToRgb('#7a6145');
  const frame = hexToRgb('#4d3b29');
  return paint(256, (u, v) => {
    const border = Math.min(u, 1 - u, v, 1 - v);
    const onBrace = Math.abs(u - v) < 0.06;
    const board = Math.floor(v * 4);
    const fv = v * 4 - board;
    const grain = fbm(u, v * 0.25 + board * 0.3, 16, 3, 700 + board);
    let c: Rgb;
    let h: number;
    if (border < 0.09 || onBrace) {
      c = scale(frame, 0.85 + grain * 0.3);
      h = 1;
    } else {
      c = scale(wood, 0.75 + hash2(board, 1, 71) * 0.35 + grain * 0.2);
      h = 0.5 + grain * 0.2;
      if (fv < 0.04) {
        c = scale(frame, 0.4);
        h = 0;
      }
    }
    return { rgb: c, height: h };
  });
}
