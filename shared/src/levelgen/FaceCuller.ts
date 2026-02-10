/**
 * Face culling: determine which voxel faces are visible.
 * Only render faces adjacent to air or out-of-bounds.
 */

import type { VoxelGrid } from './VoxelGrid.js';

export enum FaceDirection {
  PosX = 0, // +X (right)
  NegX = 1, // -X (left)
  PosY = 2, // +Y (up)
  NegY = 3, // -Y (down)
  PosZ = 4, // +Z (forward)
  NegZ = 5, // -Z (back)
}

export interface VoxelFace {
  x: number;
  y: number;
  z: number;
  direction: FaceDirection;
}

/**
 * Cull hidden faces from a voxel grid.
 * Returns only faces that are visible (adjacent to air or boundary).
 */
export class FaceCuller {
  private grid: VoxelGrid;

  constructor(grid: VoxelGrid) {
    this.grid = grid;
  }

  /**
   * Generate list of all visible faces.
   */
  cullFaces(): VoxelFace[] {
    const faces: VoxelFace[] = [];

    for (let x = 0; x < this.grid.width; x++) {
      for (let y = 0; y < this.grid.height; y++) {
        for (let z = 0; z < this.grid.depth; z++) {
          if (!this.grid.getVoxel(x, y, z)) continue; // Skip air

          // Check all 6 neighbors
          if (!this.grid.getVoxel(x + 1, y, z)) {
            faces.push({ x, y, z, direction: FaceDirection.PosX });
          }
          if (!this.grid.getVoxel(x - 1, y, z)) {
            faces.push({ x, y, z, direction: FaceDirection.NegX });
          }
          if (!this.grid.getVoxel(x, y + 1, z)) {
            faces.push({ x, y, z, direction: FaceDirection.PosY });
          }
          if (!this.grid.getVoxel(x, y - 1, z)) {
            faces.push({ x, y, z, direction: FaceDirection.NegY });
          }
          if (!this.grid.getVoxel(x, y, z + 1)) {
            faces.push({ x, y, z, direction: FaceDirection.PosZ });
          }
          if (!this.grid.getVoxel(x, y, z - 1)) {
            faces.push({ x, y, z, direction: FaceDirection.NegZ });
          }
        }
      }
    }

    return faces;
  }

  /**
   * Check if a specific face is visible.
   */
  isFaceVisible(x: number, y: number, z: number, direction: FaceDirection): boolean {
    if (!this.grid.getVoxel(x, y, z)) return false;

    switch (direction) {
      case FaceDirection.PosX:
        return !this.grid.getVoxel(x + 1, y, z);
      case FaceDirection.NegX:
        return !this.grid.getVoxel(x - 1, y, z);
      case FaceDirection.PosY:
        return !this.grid.getVoxel(x, y + 1, z);
      case FaceDirection.NegY:
        return !this.grid.getVoxel(x, y - 1, z);
      case FaceDirection.PosZ:
        return !this.grid.getVoxel(x, y, z + 1);
      case FaceDirection.NegZ:
        return !this.grid.getVoxel(x, y, z - 1);
    }
  }
}
