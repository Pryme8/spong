/**
 * Material-aware greedy meshing for tree voxels.
 * Based on the standard greedy meshing algorithm but tracks material types.
 * Only merges quads with the same material.
 */

import type { TreeVoxelGrid } from './TreeVoxelGrid.js';
import { TREE_VOXEL_SIZE, MATERIAL_EMPTY } from './TreeVoxelGrid.js';

export interface TreeQuad {
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
  // Material type (1=wood, 2=leaf)
  material: number;
}

/**
 * Material-aware greedy mesher for tree voxels.
 */
export class TreeGreedyMesher {
  private grid: TreeVoxelGrid;

  constructor(grid: TreeVoxelGrid) {
    this.grid = grid;
  }

  /**
   * Generate optimized mesh quads for all three axes.
   */
  generateMesh(): TreeQuad[] {
    const quads: TreeQuad[] = [];

    // Mesh each axis separately
    quads.push(...this.meshAxis('x'));
    quads.push(...this.meshAxis('y'));
    quads.push(...this.meshAxis('z'));

    return quads;
  }

  /**
   * Mesh a single axis by sweeping perpendicular slices.
   */
  private meshAxis(axis: 'x' | 'y' | 'z'): TreeQuad[] {
    const quads: TreeQuad[] = [];

    // Determine dimensions based on axis
    const dims = this.getAxisDimensions(axis);
    const [u, v, w] = [dims.width, dims.height, dims.depth];

    // Mask for tracking faces in current slice
    // Positive values = positive face with material N
    // Negative values = negative face with material abs(N)
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

          const mat1 = this.grid.getVoxel(pos1.x, pos1.y, pos1.z);
          const mat2 = this.grid.getVoxel(pos2.x, pos2.y, pos2.z);

          // Face exists if materials differ
          if (mat1 !== mat2) {
            if (mat1 !== MATERIAL_EMPTY) {
              // Positive face (facing +axis direction) with material mat1
              mask[i + j * u] = mat1;
            } else {
              // Negative face (facing -axis direction) with material mat2
              mask[i + j * u] = -mat2;
            }
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

          // Compute width (expand right while material matches)
          let width = 1;
          while (i + width < u && mask[i + width + j * u] === m) {
            width++;
          }

          // Compute height (expand down while material matches)
          let height = 1;
          let done = false;
          while (j + height < v) {
            // Check if full row matches (both existence AND material)
            for (let k = 0; k < width; k++) {
              if (mask[i + k + (j + height) * u] !== m) {
                done = true;
                break;
              }
            }
            if (done) break;
            height++;
          }

          // Create quad with material info
          const material = Math.abs(m);
          const positive = m > 0;
          const quad = this.createQuad(i, j, d, width, height, positive, axis, material);
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
    axis: 'x' | 'y' | 'z',
    material: number
  ): TreeQuad {
    // Face plane at boundary is at d+1
    const coords = this.mapCoords(i, j, d + 1, axis);

    // Convert voxel coords to world space
    // Trees use uniform voxel size for all axes
    return {
      x: coords.x * TREE_VOXEL_SIZE,
      y: coords.y * TREE_VOXEL_SIZE,
      z: coords.z * TREE_VOXEL_SIZE,
      width,
      height,
      axis,
      positive,
      material,
    };
  }
}
