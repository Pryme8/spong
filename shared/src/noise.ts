/**
 * Seeded 2D noise using value noise with gradient interpolation.
 * Deterministic: same seed produces same terrain.
 */

import { SeededRandom } from './rng.js';

/**
 * 2D noise generator with seeded permutation table.
 */
export class Noise2D {
  private perm: Uint8Array;
  private readonly TABLE_SIZE = 256;

  constructor(seed: string) {
    this.perm = new Uint8Array(this.TABLE_SIZE * 2);
    const rng = new SeededRandom(seed);

    // Fisher-Yates shuffle with seeded RNG
    const p = new Uint8Array(this.TABLE_SIZE);
    for (let i = 0; i < this.TABLE_SIZE; i++) {
      p[i] = i;
    }
    for (let i = this.TABLE_SIZE - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const temp = p[i];
      p[i] = p[j];
      p[j] = temp;
    }

    // Duplicate for wrapping
    for (let i = 0; i < this.TABLE_SIZE; i++) {
      this.perm[i] = p[i];
      this.perm[i + this.TABLE_SIZE] = p[i];
    }
  }

  /**
   * Sample 2D noise at (x, z).
   * Returns value in [0, 1].
   */
  noise(x: number, z: number): number {
    // Grid cell coordinates
    const X = Math.floor(x) & 255;
    const Z = Math.floor(z) & 255;

    // Local coordinates within cell [0, 1)
    const xf = x - Math.floor(x);
    const zf = z - Math.floor(z);

    // Fade curves for smooth interpolation
    const u = fade(xf);
    const v = fade(zf);

    // Hash coordinates of 4 cube corners
    const aa = this.perm[this.perm[X] + Z];
    const ab = this.perm[this.perm[X] + Z + 1];
    const ba = this.perm[this.perm[X + 1] + Z];
    const bb = this.perm[this.perm[X + 1] + Z + 1];

    // Interpolate gradients
    const x1 = lerp(grad2(aa, xf, zf), grad2(ba, xf - 1, zf), u);
    const x2 = lerp(grad2(ab, xf, zf - 1), grad2(bb, xf - 1, zf - 1), u);

    // Map from [-1, 1] to [0, 1]
    return (lerp(x1, x2, v) + 1) * 0.5;
  }

  /**
   * Fractal Brownian Motion: layered noise for natural terrain.
   * 
   * @param x X coordinate
   * @param z Z coordinate
   * @param octaves Number of noise layers (default 4)
   * @param lacunarity Frequency multiplier per octave (default 2.0)
   * @param persistence Amplitude multiplier per octave (default 0.5)
   * @returns Noise value in [0, 1]
   */
  fbm(
    x: number,
    z: number,
    octaves: number = 4,
    lacunarity: number = 2.0,
    persistence: number = 0.5
  ): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }
}

// Fade function: 6t^5 - 15t^4 + 10t^3
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// 2D gradient function
function grad2(hash: number, x: number, z: number): number {
  const h = hash & 7; // 8 gradient directions
  const u = h < 4 ? x : z;
  const v = h < 4 ? z : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
}
