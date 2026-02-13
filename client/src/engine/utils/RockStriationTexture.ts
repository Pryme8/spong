/**
 * Procedural rock striation texture generator.
 * Ported from rock-striation-demo.html for use as rock diffuse textures.
 * Draws to a Canvas 2D context; tileable and deterministic from seed.
 */

import { SeededRandom } from '@spong/shared';

export const ROCK_STRITATION_PATTERNS = [
  'horizontal',
  'diagonal',
  'wavy',
  'foliation',
  'crossBed',
  'vein',
  'banded'
] as const;

export type RockStriationPatternType = (typeof ROCK_STRITATION_PATTERNS)[number];

function hashStringToNumber(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick a pattern type deterministically from a rock seed. */
export function pickPatternFromSeed(seed: string): RockStriationPatternType {
  const h = hashStringToNumber(seed);
  const index = (h >>> 0) % ROCK_STRITATION_PATTERNS.length;
  return ROCK_STRITATION_PATTERNS[Math.abs(index)];
}

function hash(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function hash2(seed: number, x: number, y: number): number {
  return ((seed * 31 + x) * 73856093 ^ (y * 19349663)) >>> 0;
}

function noise2D(
  rng: SeededRandom,
  x: number,
  y: number,
  freq: number
): number {
  const xi = Math.floor(x * freq) & 255;
  const yi = Math.floor(y * freq) & 255;
  const xf = (x * freq) % 1;
  const yf = (y * freq) % 1;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = hash(xi, yi);
  const a = (h % 1000) / 1000;
  const b = ((h >> 8) % 1000) / 1000;
  const c = ((h >> 16) % 1000) / 1000;
  const d = ((h >> 24) % 1000) / 1000;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function gradNoiseTileable(
  seedNum: number,
  u: number,
  v: number,
  gridSize: number
): number {
  const x = u * gridSize;
  const y = v * gridSize;
  const xi = Math.floor(x) % gridSize;
  const yi = Math.floor(y) % gridSize;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const uu = smoothstep(xf);
  const vv = smoothstep(yf);
  function grad(ix: number, iy: number): { x: number; y: number } {
    const h = hash2(seedNum, ix, iy);
    const angle = (h % 628) / 100;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }
  function corner(g: { x: number; y: number }, ox: number, oy: number): number {
    return g.x * (xf - ox) + g.y * (yf - oy);
  }
  const g00 = grad(xi, yi);
  const g10 = grad((xi + 1) % gridSize, yi);
  const g01 = grad(xi, (yi + 1) % gridSize);
  const g11 = grad((xi + 1) % gridSize, (yi + 1) % gridSize);
  const n00 = corner(g00, 0, 0);
  const n10 = corner(g10, 1, 0);
  const n01 = corner(g01, 0, 1);
  const n11 = corner(g11, 1, 1);
  const n0 = n00 * (1 - uu) + n10 * uu;
  const n1 = n01 * (1 - uu) + n11 * uu;
  return n0 * (1 - vv) + n1 * vv;
}

function gray(t: number): string {
  const g = Math.max(0, Math.min(255, Math.round(255 * t)));
  return `rgb(${g},${g},${g})`;
}

function sampleBilinearTiled(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number
): number {
  sx = ((sx % w) + w) % w;
  sy = ((sy % h) + h) % h;
  const ix = Math.floor(sx) % w;
  const iy = Math.floor(sy) % h;
  const fx = sx - Math.floor(sx);
  const fy = sy - Math.floor(sy);
  const ix1 = (ix + 1) % w;
  const iy1 = (iy + 1) % h;
  const i00 = (iy * w + ix) * 4;
  const i10 = (iy * w + ix1) * 4;
  const i01 = (iy1 * w + ix) * 4;
  const i11 = (iy1 * w + ix1) * 4;
  const r =
    data[i00] * (1 - fx) * (1 - fy) +
    data[i10] * fx * (1 - fy) +
    data[i01] * (1 - fx) * fy +
    data[i11] * fx * fy;
  return Math.max(0, Math.min(255, Math.round(r)));
}

const DEFAULT_LAYER_COUNT = 24;
const DEFAULT_ROUGHNESS = 0.4;
const DEFAULT_CONTRAST = 0.7;
const DEFAULT_WARP = 1;
const DEFAULT_GRAIN = 0.08;

export interface RockStriationOptions {
  layerCount?: number;
  roughness?: number;
  contrast?: number;
  warpAmount?: number;
  grainAmount?: number;
}

function applyGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  amount: number
): void {
  if (amount <= 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const rng = new SeededRandom(seed + '_grain');
  const scale = amount * 255;
  for (let i = 0; i < data.data.length; i += 4) {
    const g = data.data[i];
    const noise = (rng.next() - 0.5) * 2 * scale;
    const v = Math.max(0, Math.min(255, Math.round(g + noise)));
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
}

function applyDistortion(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  amount: number
): void {
  if (amount <= 0) return;
  const data = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(data.data);
  const seedNum = hashStringToNumber(seed);
  const distScale = amount * 90;
  const grid1 = 24;
  const grid2 = 48;
  const nScale = 0.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const dx =
        (gradNoiseTileable(seedNum, u, v, grid1) * 0.6 +
          gradNoiseTileable(seedNum + 1000, u, v, grid2) * 0.4) *
        nScale *
        distScale;
      const dy =
        (gradNoiseTileable(seedNum + 500, u, v, grid1) * 0.6 +
          gradNoiseTileable(seedNum + 1500, u, v, grid2) * 0.4) *
        nScale *
        distScale;
      const sx = x + dx;
      const sy = y + dy;
      const val = sampleBilinearTiled(src, w, h, sx, sy);
      const i = (y * w + x) * 4;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = val;
    }
  }
  ctx.putImageData(data, 0, 0);
}

function drawHorizontal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  seedNum: number,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const step = 6;
  let y = 0;
  for (let i = 0; i < layerCount; i++) {
    const thick = 0.8 + rng.next() * 0.5;
    const bandHeight = (h / layerCount) * thick;
    const topY = y;
    y += bandHeight;
    const botY = Math.min(y, h);
    ctx.beginPath();
    ctx.moveTo(0, topY);
    for (let x = 0; x <= w; x += step) {
      const n =
        (noise2D(rng, x * 0.0015 + seedNum, topY * 0.001, 1.5) - 0.5) *
        bandHeight *
        roughness *
        1.5;
      ctx.lineTo(x, topY + n);
    }
    ctx.lineTo(w, botY);
    for (let x = w; x >= 0; x -= step) {
      const n =
        (noise2D(rng, x * 0.0015 + seedNum + 100, botY * 0.001, 1.5) - 0.5) *
        bandHeight *
        roughness *
        1.5;
      ctx.lineTo(x, botY + n);
    }
    ctx.closePath();
    const t = (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(t);
    ctx.fill();
    if (y >= h) break;
  }
}

function drawDiagonal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  seedNum: number,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const angle = Math.PI * 0.35;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA;
  const perpY = cosA;
  const bandStep = (w + h) / layerCount;
  const extent = Math.max(w, h) * 1.5;
  for (let i = 0; i <= layerCount; i++) {
    const baseAlong = (i - layerCount * 0.5) * bandStep;
    ctx.beginPath();
    const steps = 500;
    for (let s = 0; s <= steps; s++) {
      const along = (s / steps - 0.5) * 2 * extent;
      const n =
        (noise2D(
          rng,
          (baseAlong + along * 0.3) * 0.003 + seedNum,
          i * 0.15,
          2
        ) -
          0.5) *
        bandStep *
        roughness *
        1.2;
      const x = w * 0.5 + along * cosA + (baseAlong + n) * perpX;
      const y = h * 0.5 + along * sinA + (baseAlong + n) * perpY;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const along = (s / steps - 0.5) * 2 * extent;
      const n =
        (noise2D(
          rng,
          (baseAlong + bandStep + along * 0.3) * 0.003 + seedNum + 7,
          (i + 1) * 0.15,
          2
        ) -
          0.5) *
        bandStep *
        roughness *
        1.2;
      const x =
        w * 0.5 +
        along * cosA +
        (baseAlong + bandStep + n) * perpX;
      const y =
        h * 0.5 +
        along * sinA +
        (baseAlong + bandStep + n) * perpY;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const t = (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(t);
    ctx.fill();
  }
}

function drawWavy(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  seedNum: number,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const bandHeight = h / layerCount;
  const waveAmp1 = bandHeight * 3 * (0.4 + roughness * 0.8);
  const waveAmp2 = bandHeight * 1.2 * (0.2 + roughness * 0.5);
  const freq1 = 0.006;
  const freq2 = 0.018;
  const step = 5;
  for (let i = 0; i < layerCount; i++) {
    const topY = (i / layerCount) * h;
    const botY = ((i + 1) / layerCount) * h;
    ctx.beginPath();
    ctx.moveTo(0, topY);
    for (let x = 0; x <= w; x += step) {
      const wave =
        Math.sin(x * freq1 + i * 0.5) * waveAmp1 +
        Math.sin(x * freq2 + i * 0.3) * waveAmp2;
      const n =
        (noise2D(rng, x * 0.002 + seedNum, topY * 0.002, 2) - 0.5) *
        bandHeight *
        roughness;
      ctx.lineTo(x, topY + wave + n);
    }
    ctx.lineTo(w, botY);
    for (let x = w; x >= 0; x -= step) {
      const wave =
        Math.sin(x * freq1 + (i + 1) * 0.5) * waveAmp1 +
        Math.sin(x * freq2 + (i + 1) * 0.3) * waveAmp2;
      const n =
        (noise2D(rng, x * 0.002 + seedNum + 1, botY * 0.002, 2) - 0.5) *
        bandHeight *
        roughness;
      ctx.lineTo(x, botY + wave + n);
    }
    ctx.closePath();
    const t = (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(t);
    ctx.fill();
  }
}

function drawFoliation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  seedNum: number,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const bands = layerCount * 4;
  const bandHeight = h / bands;
  const step = 3;
  for (let i = 0; i < bands; i++) {
    const topY = (i / bands) * h;
    const botY = ((i + 1) / bands) * h;
    ctx.beginPath();
    ctx.moveTo(0, topY);
    for (let x = 0; x <= w; x += step) {
      const n =
        (noise2D(rng, x * 0.008 + seedNum, topY * 0.008, 2.5) - 0.5) *
        bandHeight *
        roughness *
        0.8;
      ctx.lineTo(x, topY + n);
    }
    ctx.lineTo(w, botY);
    for (let x = w; x >= 0; x -= step) {
      const n =
        (noise2D(rng, x * 0.008 + seedNum + 1, botY * 0.008, 2.5) - 0.5) *
        bandHeight *
        roughness *
        0.8;
      ctx.lineTo(x, botY + n);
    }
    ctx.closePath();
    const t = (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(t);
    ctx.fill();
  }
}

function drawOneCrossBedFan(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  centerX: number,
  centerY: number,
  arcLayers: number,
  maxR: number,
  roughness: number,
  contrast: number,
  fanSeed: number,
  rng: SeededRandom
): void {
  for (let i = 0; i < arcLayers; i++) {
    const t = (i + 1) / arcLayers;
    const radius = t * t * maxR + 15;
    const startAngle = -Math.PI * 0.5 + rng.range(-0.5, 0.5);
    const sweep = Math.PI * 0.7 + rng.range(0.2, 0.7);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    for (let a = 0; a <= 1; a += 0.015) {
      const angle = startAngle + a * sweep;
      const n =
        (noise2D(rng, angle * 3 + fanSeed + i * 11, i * 0.2, 2) - 0.5) *
        radius *
        roughness *
        0.4;
      const r = radius + n;
      ctx.lineTo(centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r);
    }
    ctx.closePath();
    const grayT =
      (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(grayT);
    ctx.fill();
  }
}

function drawCrossBed(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const fanCount = 2 + Math.floor(rng.next() * 3);
  const maxR = Math.min(w, h) * 0.45;
  const seedNum = hashStringToNumber(seed);
  for (let f = 0; f < fanCount; f++) {
    const centerX = rng.range(w * 0.2, w * 0.8);
    const centerY = rng.range(h * 0.2, h * 0.8);
    const arcLayers = Math.max(
      10,
      Math.floor(layerCount * (0.5 + rng.next() * 0.5))
    );
    drawOneCrossBedFan(
      ctx,
      w,
      h,
      centerX,
      centerY,
      arcLayers,
      maxR,
      roughness,
      contrast,
      seedNum + f * 1000,
      rng
    );
  }
}

function drawVein(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  ctx.fillStyle = gray((1 - contrast) * 0.4);
  ctx.fillRect(0, 0, w, h);
  const rng = new SeededRandom(seed);
  const crackCount = 25 + Math.floor(layerCount * 0.8);
  const jitter = 12 + roughness * 25;
  const lineW = 0.8 + roughness * 1.5;
  ctx.strokeStyle = gray(0.5 + contrast * 0.5);
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let c = 0; c < crackCount; c++) {
    const len = 40 + rng.next() * 180;
    let x = rng.range(0, w);
    let y = rng.range(0, h);
    const angle = rng.range(0, Math.PI * 2);
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    const steps = 8 + Math.floor(len * 0.08);
    const stepLen = len / steps;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      x += vx * stepLen + (rng.next() - 0.5) * jitter;
      y += vy * stepLen + (rng.next() - 0.5) * jitter;
      const turn = (rng.next() - 0.5) * 0.6;
      const vxNew = vx * Math.cos(turn) - vy * Math.sin(turn);
      const vyNew = vx * Math.sin(turn) + vy * Math.cos(turn);
      vx = vxNew;
      vy = vyNew;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const majorCracks = 4 + Math.floor(roughness * 6);
  ctx.lineWidth = lineW * 2.5;
  ctx.strokeStyle = gray(0.85);
  for (let m = 0; m < majorCracks; m++) {
    const fromEdge = rng.next() > 0.5;
    let x = fromEdge ? (rng.next() > 0.5 ? 0 : w) : rng.range(0, w);
    let y = fromEdge ? rng.range(0, h) : (rng.next() > 0.5 ? 0 : h);
    const stepLen = 15 + rng.next() * 22;
    let vx = (rng.next() - 0.5) * 2;
    let vy = (rng.next() - 0.5) * 2;
    const mag = Math.hypot(vx, vy) || 1;
    vx /= mag;
    vy /= mag;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (
      let s = 0;
      s < 50 && x >= -20 && x <= w + 20 && y >= -20 && y <= h + 20;
      s++
    ) {
      x += vx * stepLen + (rng.next() - 0.5) * jitter * 1.2;
      y += vy * stepLen + (rng.next() - 0.5) * jitter * 1.2;
      const turn = (rng.next() - 0.5) * 0.4;
      const vxNew = vx * Math.cos(turn) - vy * Math.sin(turn);
      const vyNew = vx * Math.sin(turn) + vy * Math.cos(turn);
      vx = vxNew;
      vy = vyNew;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBanded(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
  seedNum: number,
  layerCount: number,
  roughness: number,
  contrast: number
): void {
  const rng = new SeededRandom(seed);
  const thickBands = Math.max(4, Math.floor(layerCount * 0.4));
  const bandHeight = h / thickBands;
  const step = 5;
  for (let i = 0; i < thickBands; i++) {
    const topY = (i / thickBands) * h;
    const botY = ((i + 1) / thickBands) * h;
    const t = (i % 2) === 0 ? (1 - contrast) * 0.5 : 0.5 + contrast * 0.5;
    ctx.fillStyle = gray(t);
    ctx.beginPath();
    ctx.moveTo(0, topY);
    for (let x = 0; x <= w; x += step) {
      const n =
        (noise2D(rng, x * 0.0015 + seedNum, topY * 0.001, 2) - 0.5) *
        bandHeight *
        roughness *
        0.6;
      ctx.lineTo(x, topY + n);
    }
    ctx.lineTo(w, botY);
    for (let x = w; x >= 0; x -= step) {
      const n =
        (noise2D(rng, x * 0.0015 + seedNum + 1, botY * 0.001, 2) - 0.5) *
        bandHeight *
        roughness *
        0.6;
      ctx.lineTo(x, botY + n);
    }
    ctx.closePath();
    ctx.fill();
    const microBands = 12 + Math.floor(rng.next() * 8);
    const microH = bandHeight / microBands;
    for (let k = 1; k < microBands; k++) {
      const my =
        topY +
        k * microH +
        (noise2D(rng, seedNum + k * 3, topY * 0.01, 1) - 0.5) *
          microH *
          roughness;
      ctx.strokeStyle = gray(t + (k % 2 === 0 ? 0.06 : -0.06));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, my);
      for (let x = 4; x < w; x += 4) {
        const ny =
          (noise2D(rng, x * 0.015 + seedNum, my * 0.01, 2) - 0.5) * 2;
        ctx.lineTo(x, my + ny);
      }
      ctx.stroke();
    }
  }
}

/**
 * Draw a full rock striation texture into the given 2D context.
 * Uses seed and patternType for deterministic output; optional params for tuning.
 */
export function drawRockStriationToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: string,
  patternType: RockStriationPatternType,
  options: RockStriationOptions = {}
): void {
  const layerCount = options.layerCount ?? DEFAULT_LAYER_COUNT;
  const roughness = options.roughness ?? DEFAULT_ROUGHNESS;
  const contrast = options.contrast ?? DEFAULT_CONTRAST;
  const warpAmount = options.warpAmount ?? DEFAULT_WARP;
  const grainAmount = options.grainAmount ?? DEFAULT_GRAIN;

  const w = width;
  const h = height;
  const seedNum = hashStringToNumber(seed);

  ctx.fillStyle = gray(0);
  ctx.fillRect(0, 0, w, h);

  switch (patternType) {
    case 'horizontal':
      drawHorizontal(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
      break;
    case 'diagonal':
      drawDiagonal(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
      break;
    case 'wavy':
      drawWavy(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
      break;
    case 'foliation':
      drawFoliation(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
      break;
    case 'crossBed':
      drawCrossBed(ctx, w, h, seed, layerCount, roughness, contrast);
      break;
    case 'vein':
      drawVein(ctx, w, h, seed, layerCount, roughness, contrast);
      break;
    case 'banded':
      drawBanded(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
      break;
    default:
      drawHorizontal(ctx, w, h, seed, seedNum, layerCount, roughness, contrast);
  }

  if (warpAmount > 0) applyDistortion(ctx, w, h, seed, warpAmount);
  if (grainAmount > 0) applyGrain(ctx, w, h, seed, grainAmount);
}
