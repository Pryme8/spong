/**
 * Greedy meshing for rock voxels.
 * Merges coplanar solid faces into larger quads to minimize polygon count.
 */

import type { RockVoxelGrid } from './RockVoxelGrid.js';
import { ROCK_VOXEL_SIZE } from './RockVoxelGrid.js';

export interface RockQuad {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  axis: 'x' | 'y' | 'z';
  positive: boolean;
}

export class RockGreedyMesher {
  private grid: RockVoxelGrid;

  constructor(grid: RockVoxelGrid) {
    this.grid = grid;
  }

  generateMesh(): RockQuad[] {
    const quads: RockQuad[] = [];

    quads.push(...this.meshAxis('x'));
    quads.push(...this.meshAxis('y'));
    quads.push(...this.meshAxis('z'));

    return quads;
  }

  private meshAxis(axis: 'x' | 'y' | 'z'): RockQuad[] {
    const quads: RockQuad[] = [];

    const dims = this.getAxisDimensions(axis);
    const [u, v, w] = [dims.width, dims.height, dims.depth];

    const mask = new Int8Array(u * v);

    for (let d = -1; d < w; d++) {
      mask.fill(0);

      // Build mask for this slice
      for (let j = 0; j < v; j++) {
        for (let i = 0; i < u; i++) {
          const pos1 = this.mapCoords(i, j, d, axis);
          const pos2 = this.mapCoords(i, j, d + 1, axis);

          const solid1 = this.grid.isSolid(pos1.x, pos1.y, pos1.z);
          const solid2 = this.grid.isSolid(pos2.x, pos2.y, pos2.z);

          if (solid1 !== solid2) {
            mask[i + j * u] = solid1 ? 1 : -1;
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

          // Expand width
          let width = 1;
          while (i + width < u && mask[i + width + j * u] === m) {
            width++;
          }

          // Expand height
          let height = 1;
          let done = false;
          while (j + height < v) {
            for (let k = 0; k < width; k++) {
              if (mask[i + k + (j + height) * u] !== m) {
                done = true;
                break;
              }
            }
            if (done) break;
            height++;
          }

          const positive = m > 0;
          const quad = this.createQuad(i, j, d, width, height, positive, axis);
          quads.push(quad);

          // Clear mask
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

  private getAxisDimensions(axis: 'x' | 'y' | 'z'): { width: number; height: number; depth: number } {
    switch (axis) {
      case 'x':
        return { width: this.grid.size, height: this.grid.size, depth: this.grid.size };
      case 'y':
        return { width: this.grid.size, height: this.grid.size, depth: this.grid.size };
      case 'z':
        return { width: this.grid.size, height: this.grid.size, depth: this.grid.size };
    }
  }

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

  private createQuad(
    i: number,
    j: number,
    d: number,
    width: number,
    height: number,
    positive: boolean,
    axis: 'x' | 'y' | 'z'
  ): RockQuad {
    const coords = this.mapCoords(i, j, d + 1, axis);

    return {
      x: coords.x * ROCK_VOXEL_SIZE,
      y: coords.y * ROCK_VOXEL_SIZE,
      z: coords.z * ROCK_VOXEL_SIZE,
      width,
      height,
      axis,
      positive,
    };
  }
}
