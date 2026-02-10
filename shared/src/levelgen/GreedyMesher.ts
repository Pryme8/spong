/**
 * Greedy meshing algorithm for voxel terrain optimization.
 * Based on Mikola Lysenko's algorithm: https://0fps.net/2012/06/30/meshing-minecraft-part-2/
 * 
 * Combines adjacent coplanar faces into larger quads to minimize polygon count.
 */

import type { VoxelGrid } from './VoxelGrid.js';
import { HALF_CUBE_HEIGHT } from './VoxelGrid.js';

export interface Quad {
  // Bottom-left corner position (world space)
  x: number;
  y: number;
  z: number;
  // Quad dimensions (in voxel units)
  width: number;
  height: number;
  // Which axis this quad is perpendicular to
  axis: 'x' | 'y' | 'z';
  // Direction along that axis (positive or negative)
  positive: boolean;
}

/**
 * Greedy meshing: convert voxel grid into optimized quads.
 */
export class GreedyMesher {
  private grid: VoxelGrid;

  constructor(grid: VoxelGrid) {
    this.grid = grid;
  }

  /**
   * Generate optimized mesh quads for all three axes.
   */
  generateMesh(): Quad[] {
    const quads: Quad[] = [];

    // Mesh each axis separately
    quads.push(...this.meshAxis('x'));
    quads.push(...this.meshAxis('y'));
    quads.push(...this.meshAxis('z'));

    return quads;
  }

  /**
   * Mesh a single axis by sweeping perpendicular slices.
   */
  private meshAxis(axis: 'x' | 'y' | 'z'): Quad[] {
    const quads: Quad[] = [];

    // Determine dimensions based on axis
    const dims = this.getAxisDimensions(axis);
    const [u, v, w] = [dims.width, dims.height, dims.depth];

    // Mask for tracking processed faces in current slice
    const mask = new Int32Array(u * v);

    // Sweep through depth (perpendicular to face normal)
    for (let d = -1; d < w; d++) {
      // Reset mask
      mask.fill(0);

      // Build mask for this slice
      for (let j = 0; j < v; j++) {
        for (let i = 0; i < u; i++) {
          const pos1 = this.mapCoords(i, j, d, axis);
          const pos2 = this.mapCoords(i, j, d + 1, axis);

          const voxel1 = this.grid.getVoxel(pos1.x, pos1.y, pos1.z);
          const voxel2 = this.grid.getVoxel(pos2.x, pos2.y, pos2.z);

          // Face exists if there's a solid-air boundary
          if (voxel1 !== voxel2) {
            mask[i + j * u] = voxel1 ? 1 : -1;
          }
        }
      }

      // Greedily build quads from mask
      for (let j = 0; j < v; j++) {
        for (let i = 0; i < u; ) {
          const m = mask[i + j * u];

          if (m === 0) {
            i++;
            continue;
          }

          // Compute width (expand right)
          let width = 1;
          while (i + width < u && mask[i + width + j * u] === m) {
            width++;
          }

          // Compute height (expand down)
          let height = 1;
          let done = false;
          while (j + height < v) {
            // Check if full row matches
            for (let k = 0; k < width; k++) {
              if (mask[i + k + (j + height) * u] !== m) {
                done = true;
                break;
              }
            }
            if (done) break;
            height++;
          }

          // Create quad
          const quad = this.createQuad(i, j, d, width, height, m > 0, axis);
          quads.push(quad);

          // Clear mask for processed area
          for (let l = 0; l < height; l++) {
            for (let k = 0; k < width; k++) {
              mask[i + k + (j + l) * u] = 0;
            }
          }

          i += width;
        }
      }
    }

    return quads;
  }

  /**
   * Get grid dimensions for a given axis orientation.
   */
  private getAxisDimensions(axis: 'x' | 'y' | 'z'): { width: number; height: number; depth: number } {
    switch (axis) {
      case 'x':
        return { width: this.grid.depth, height: this.grid.height, depth: this.grid.width };
      case 'y':
        return { width: this.grid.width, height: this.grid.depth, depth: this.grid.height };
      case 'z':
        return { width: this.grid.width, height: this.grid.height, depth: this.grid.depth };
    }
  }

  /**
   * Map 2D slice coordinates to 3D voxel coordinates.
   */
  private mapCoords(i: number, j: number, d: number, axis: 'x' | 'y' | 'z'): { x: number; y: number; z: number } {
    switch (axis) {
      case 'x':
        return { x: d, y: j, z: i };
      case 'y':
        return { x: i, y: d, z: j };
      case 'z':
        return { x: i, y: j, z: d };
    }
  }

  /**
   * Create a quad from slice coordinates.
   */
  private createQuad(
    i: number,
    j: number,
    d: number,
    width: number,
    height: number,
    positive: boolean,
    axis: 'x' | 'y' | 'z'
  ): Quad {
    // Both positive and negative faces at boundary (d, d+1) sit at coordinate d+1.
    // Voxel N occupies [N, N+1], so the face plane is always at d+1.
    const coords = this.mapCoords(i, j, d + 1, axis);

    // Convert voxel coords to world space
    // Y axis uses half-height scaling
    return {
      x: coords.x,
      y: coords.y * HALF_CUBE_HEIGHT,
      z: coords.z,
      width,
      height,
      axis,
      positive,
    };
  }
}
