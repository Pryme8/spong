/**
 * Voxel-based terrain grid for procedural level generation.
 * Each voxel is a half-height cube (0.5 units tall).
 */

import { Noise2D } from '../noise.js';

// Level constants
export const GRID_WIDTH = 100;
export const GRID_DEPTH = 100;
export const MAX_HEIGHT = 50; // Units in world space

// Voxel dimensions (2x0.5x2 units per voxel)
export const VOXEL_WIDTH = 2.0;
export const VOXEL_HEIGHT = 0.5;
export const VOXEL_DEPTH = 2.0;
export const HALF_CUBE_HEIGHT = VOXEL_HEIGHT; // Alias for backward compatibility

export const MAX_VOXEL_HEIGHT = Math.floor(MAX_HEIGHT / VOXEL_HEIGHT); // 100 voxels max per column

// Level positioning (offset to center the grid)
export const LEVEL_OFFSET_X = -(GRID_WIDTH * VOXEL_WIDTH) * 0.5;
export const LEVEL_OFFSET_Y = -25; // Move down 25 units
export const LEVEL_OFFSET_Z = -(GRID_DEPTH * VOXEL_DEPTH) * 0.5;

export class VoxelGrid {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  private voxels: Uint8Array;

  constructor(width: number = GRID_WIDTH, depth: number = GRID_DEPTH, height: number = MAX_VOXEL_HEIGHT) {
    this.width = width;
    this.depth = depth;
    this.height = height;
    this.voxels = new Uint8Array(width * depth * height);
  }

  /**
   * Generate terrain from seeded noise with multi-layer terracing.
   * 
   * @param seed String seed for deterministic generation
   * @param scale Noise scale (smaller = smoother terrain)
   * @param octaves Number of FBM octaves for detail
   * @param flatHeight Optional fixed height for flat terrain (in voxels). When provided, generates flat terrain at this height instead of using noise.
   */
  generateFromNoise(
    seed: string,
    scale: number = 0.02,
    octaves: number = 3,
    flatHeight?: number
  ): void {
    // If flatHeight is specified, generate flat terrain
    if (flatHeight !== undefined) {
      const height = Math.floor(flatHeight);
      for (let x = 0; x < this.width; x++) {
        for (let z = 0; z < this.depth; z++) {
          for (let y = 0; y < height; y++) {
            this.setVoxel(x, y, z, true);
          }
        }
      }
      return;
    }

    const heightNoise = new Noise2D(seed);
    const primaryMaskNoise = new Noise2D(seed + '_mask1');
    const secondaryMaskNoise = new Noise2D(seed + '_mask2');
    const blendNoise = new Noise2D(seed + '_blend');

    // Terracing parameters
    const primarySteps = 6;
    const secondarySteps = 3;
    const primaryScale = 0.01;
    const secondaryScale = 0.015;
    const blendScale = 0.008;

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.depth; z++) {
        // Sample primary height noise [0, 1]
        const baseHeight = heightNoise.fbm(x * scale, z * scale, octaves);

        // ── Primary terracing pass (aggressive, 6 steps) ──────────
        const primaryMask = primaryMaskNoise.fbm(x * primaryScale, z * primaryScale, 2);
        let primaryHeight = baseHeight;
        
        // Softer blending using smoothstep
        const primaryStrength = this.smoothstep(0.3, 0.7, primaryMask);
        if (primaryStrength > 0.01) {
          const terraced = Math.floor(baseHeight * primarySteps) / primarySteps;
          primaryHeight = this.lerp(baseHeight, terraced, primaryStrength);
        }

        // ── Secondary terracing pass (subtle, 3 steps) ────────────
        const secondaryMask = secondaryMaskNoise.fbm(x * secondaryScale, z * secondaryScale, 2);
        let secondaryHeight = baseHeight;
        
        const secondaryStrength = this.smoothstep(0.4, 0.8, secondaryMask);
        if (secondaryStrength > 0.01) {
          const terraced = Math.floor(baseHeight * secondarySteps) / secondarySteps;
          secondaryHeight = this.lerp(baseHeight, terraced, secondaryStrength);
        }

        // ── Final blend between primary and secondary ─────────────
        const blendMask = blendNoise.fbm(x * blendScale, z * blendScale, 2);
        const finalHeight = this.lerp(primaryHeight, secondaryHeight, blendMask);

        // Convert to column height (number of half-cubes)
        // Reduce max height to 60% for gentler terrain
        const columnHeight = Math.floor(finalHeight * this.height * 0.6);

        // Fill column from bottom to columnHeight
        for (let y = 0; y < columnHeight; y++) {
          this.setVoxel(x, y, z, true);
        }
      }
    }
  }

  /**
   * Smoothstep interpolation for smooth transitions.
   * Maps [edge0, edge1] to [0, 1] with smooth curve.
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Linear interpolation between two values.
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /** Get voxel at (x, y, z). Returns false if out of bounds. */
  getVoxel(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return false;
    }
    const index = x + z * this.width + y * this.width * this.depth;
    return this.voxels[index] === 1;
  }

  /** Set voxel at (x, y, z). */
  setVoxel(x: number, y: number, z: number, solid: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return;
    }
    const index = x + z * this.width + y * this.width * this.depth;
    this.voxels[index] = solid ? 1 : 0;
  }

  /** Get the height of the tallest voxel in a column. Returns 0 if column is empty. */
  getColumnHeight(x: number, z: number): number {
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.getVoxel(x, y, z)) {
        return y + 1;
      }
    }
    return 0;
  }

  /** Get world Y coordinate for a voxel Y index. */
  voxelToWorldY(voxelY: number): number {
    return voxelY * VOXEL_HEIGHT;
  }

  /** Get voxel Y index from world Y coordinate. */
  worldToVoxelY(worldY: number): number {
    return Math.floor(worldY / VOXEL_HEIGHT);
  }

  /**
   * Convert world X to voxel grid X index.
   * Returns -1 if out of bounds.
   */
  worldToVoxelX(worldX: number): number {
    const vx = Math.floor((worldX - LEVEL_OFFSET_X) / VOXEL_WIDTH);
    if (vx < 0 || vx >= this.width) return -1;
    return vx;
  }

  /**
   * Convert world Z to voxel grid Z index.
   * Returns -1 if out of bounds.
   */
  worldToVoxelZ(worldZ: number): number {
    const vz = Math.floor((worldZ - LEVEL_OFFSET_Z) / VOXEL_DEPTH);
    if (vz < 0 || vz >= this.depth) return -1;
    return vz;
  }

  /**
   * Get the world-space surface Y at a given world XZ position.
   * Returns the top of the highest solid voxel, accounting for LEVEL_OFFSET_Y.
   * Returns LEVEL_OFFSET_Y if the column is empty or position is out of bounds.
   */
  getWorldSurfaceY(worldX: number, worldZ: number): number {
    const vx = this.worldToVoxelX(worldX);
    const vz = this.worldToVoxelZ(worldZ);
    if (vx < 0 || vz < 0) return LEVEL_OFFSET_Y;
    const colHeight = this.getColumnHeight(vx, vz);
    return colHeight * VOXEL_HEIGHT + LEVEL_OFFSET_Y;
  }

  /** Total number of solid voxels (for debugging). */
  getSolidCount(): number {
    let count = 0;
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] === 1) count++;
    }
    return count;
  }
}
