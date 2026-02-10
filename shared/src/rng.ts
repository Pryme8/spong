/**
 * Deterministic seeded random number generator using Mulberry32.
 * Fast, high-quality distribution, 32-bit state.
 */

/**
 * FNV-1a hash function to convert string seeds to 32-bit integers.
 * Produces consistent hash values for the same string.
 */
function hashString(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // Convert to unsigned 32-bit
}

/**
 * Create a seeded RNG function.
 * Returns a function that produces deterministic [0, 1) floats.
 * Same seed always produces the same sequence.
 * 
 * @param seed String seed (converted to 32-bit hash)
 * @returns Function that returns [0, 1) float on each call
 */
export function createRNG(seed: string): () => number {
  let h = hashString(seed);
  
  return () => {
    h |= 0;
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG with additional utility methods.
 */
export class SeededRandom {
  private rng: () => number;

  constructor(seed: string) {
    this.rng = createRNG(seed);
  }

  /** Get next random float in [0, 1) */
  next(): number {
    return this.rng();
  }

  /** Get random float in [min, max) */
  range(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  /** Get random integer in [min, max] (inclusive) */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Get random boolean */
  bool(): boolean {
    return this.rng() < 0.5;
  }

  /** Pick random element from array */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.rng() * array.length)];
  }
}
