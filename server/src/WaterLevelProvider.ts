/**
 * Server-side water level provider for physics water detection.
 * 
 * The server doesn't have the visual water texture, but it can use the voxel grid
 * to determine if water exists at a given position. Water exists where the terrain
 * height is below the water level.
 */

import { VoxelGrid } from '@spong/shared';
import type { WaterLevelProvider } from '@spong/shared';

const WATER_LEVEL_Y = -14;

export class ServerWaterLevelProvider implements WaterLevelProvider {
  private voxelGrid: VoxelGrid | undefined;

  constructor(voxelGrid?: VoxelGrid) {
    this.voxelGrid = voxelGrid;
  }

  /**
   * Get water level at given XZ position.
   * @returns Water surface Y coordinate, or -Infinity if no water at this position
   */
  getWaterLevelAt(x: number, z: number): number {
    if (!this.voxelGrid) {
      return -Infinity;
    }

    // Get terrain height at this position
    const terrainY = this.voxelGrid.getWorldSurfaceY(x, z);

    // If terrain is below water level, there's water here
    if (terrainY < WATER_LEVEL_Y) {
      return WATER_LEVEL_Y;
    }

    return -Infinity;
  }

  /**
   * Check if a spawn position is valid (not underwater).
   */
  isValidSpawnPosition(x: number, y: number, z: number): boolean {
    const waterY = this.getWaterLevelAt(x, z);
    
    // Position is valid if there's no water, or if Y is above water level
    return waterY === -Infinity || y >= waterY;
  }
}
