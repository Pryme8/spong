/**
 * Voxel grid for bush generation with floating-point density values.
 * Grid stores density: 0 = empty, > 0 = solid bush.
 * Uses Float32Array for smooth inflation/diffusion operations.
 *
 * Bushes are smaller than clouds — compact hemispheric volumes
 * that sit on the ground plane (Y=0).
 */

// Bush grid dimensions — compact hemispheric volumes
export const BUSH_GRID_W = 16;
export const BUSH_GRID_H = 12;
export const BUSH_GRID_D = 16;
export const BUSH_VOXEL_SIZE = 1.0;

// Floor cutoff — everything below this Y is emptied after sphere placement
export const BUSH_FLOOR_Y = 1;

export class BushVoxelGrid {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  private density: Float32Array;

  constructor(
    width: number = BUSH_GRID_W,
    height: number = BUSH_GRID_H,
    depth: number = BUSH_GRID_D
  ) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.density = new Float32Array(width * height * depth);
  }

  private index(x: number, y: number, z: number): number {
    return x + z * this.width + y * this.width * this.depth;
  }

  /** Get density at (x, y, z). Returns 0 if out of bounds. */
  getDensity(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return 0;
    }
    return this.density[this.index(x, y, z)];
  }

  /** Set density at (x, y, z). */
  setDensity(x: number, y: number, z: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return;
    }
    this.density[this.index(x, y, z)] = value;
  }

  /** Add to existing density at (x, y, z). */
  addDensity(x: number, y: number, z: number, value: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return;
    }
    this.density[this.index(x, y, z)] += value;
  }

  /** Check if voxel is solid (density > 0). Used by the greedy mesher. */
  isSolid(x: number, y: number, z: number): boolean {
    return this.getDensity(x, y, z) > 0;
  }

  /** Clear all density below a given Y level. */
  clearBelowY(cutoffY: number): void {
    for (let y = 0; y < cutoffY && y < this.height; y++) {
      for (let z = 0; z < this.depth; z++) {
        for (let x = 0; x < this.width; x++) {
          this.density[this.index(x, y, z)] = 0;
        }
      }
    }
  }

  /** Count total solid voxels. */
  getSolidCount(): number {
    let count = 0;
    for (let i = 0; i < this.density.length; i++) {
      if (this.density[i] > 0) count++;
    }
    return count;
  }
}
