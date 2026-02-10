/**
 * Voxel grid for rock generation with floating-point density values.
 * Grid stores density: 0 = empty, > 0 = solid rock.
 * Uses Float32Array for smooth density operations and clipping.
 */

// Default rock grid dimensions (used as fallback, actual size selected per-rock based on seed)
export const ROCK_GRID_SIZE = 24; // Medium size default
export const ROCK_VOXEL_SIZE = 1.0;

export class RockVoxelGrid {
  readonly size: number;
  private density: Float32Array;

  constructor(size: number = ROCK_GRID_SIZE) {
    this.size = size;
    this.density = new Float32Array(size * size * size);
  }

  private index(x: number, y: number, z: number): number {
    return x + z * this.size + y * this.size * this.size;
  }

  /** Get density at (x, y, z). Returns 0 if out of bounds. */
  getDensity(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) {
      return 0;
    }
    return this.density[this.index(x, y, z)];
  }

  /** Set density at (x, y, z). */
  setDensity(x: number, y: number, z: number, value: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) {
      return;
    }
    this.density[this.index(x, y, z)] = value;
  }

  /** Add to existing density at (x, y, z). */
  addDensity(x: number, y: number, z: number, value: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || z < 0 || z >= this.size) {
      return;
    }
    this.density[this.index(x, y, z)] += value;
  }

  /** Check if voxel is solid (density > 0). Used by the greedy mesher. */
  isSolid(x: number, y: number, z: number): boolean {
    return this.getDensity(x, y, z) > 0;
  }

  /** Count total solid voxels (for debugging). */
  getSolidCount(): number {
    let count = 0;
    for (let i = 0; i < this.density.length; i++) {
      if (this.density[i] > 0) count++;
    }
    return count;
  }

  /** Create a copy of this grid's density array. */
  cloneDensity(): Float32Array {
    return new Float32Array(this.density);
  }

  /** Replace this grid's density with the provided array. */
  replaceDensity(newDensity: Float32Array): void {
    if (newDensity.length !== this.density.length) {
      throw new Error('Density array size mismatch');
    }
    this.density = newDensity;
  }
}
