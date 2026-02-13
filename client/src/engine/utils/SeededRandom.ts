/**
 * Seeded random number generator for deterministic results.
 * Extracted from effects for reuse across the engine.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  random(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random(min, max + 1));
  }
}
