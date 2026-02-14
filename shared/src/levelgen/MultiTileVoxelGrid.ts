/**
 * Wrapper over 9 VoxelGrid tiles (3×3) for expanded world.
 * Implements VoxelGrid-like interface for collision and surface queries.
 * Global world space: -300 to 300 in X and Z.
 */

import { VoxelGrid } from './VoxelGrid.js';
import { GRID_WIDTH, GRID_DEPTH, MAX_VOXEL_HEIGHT, VOXEL_WIDTH } from './VoxelGrid.js';

const TILE_WORLD_SIZE = GRID_WIDTH * VOXEL_WIDTH; // 200
const HALF_WORLD = (3 * TILE_WORLD_SIZE) * 0.5; // 300

/** Global voxel grid: 300×300 in XZ, 100 in Y */
export const MULTI_TILE_VOXEL_WIDTH = 300;
export const MULTI_TILE_VOXEL_DEPTH = 300;
export const MULTI_TILE_VOXEL_HEIGHT = MAX_VOXEL_HEIGHT;

/** World bounds for 9-tile layout */
export const WORLD_MIN_X = -HALF_WORLD;
export const WORLD_MAX_X = HALF_WORLD;
export const WORLD_MIN_Z = -HALF_WORLD;
export const WORLD_MAX_Z = HALF_WORLD;

/** Offset for collision: world-to-voxel uses (worldX - offsetX) / VOXEL_WIDTH */
export const MULTI_TILE_OFFSET_X = -HALF_WORLD;
export const MULTI_TILE_OFFSET_Z = -HALF_WORLD;

export interface MultiTileVoxelGrid {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  getVoxel(x: number, y: number, z: number): boolean;
  getColumnHeight(x: number, z: number): number;
  getWorldSurfaceY(worldX: number, worldZ: number): number;
  getTiles(): VoxelGrid[][];
  getOffset(): { offsetX: number; offsetZ: number };
}

function worldToTileIndex(worldCoord: number): number {
  const halfTile = TILE_WORLD_SIZE * 0.5; // 100
  if (worldCoord < -halfTile) return 0;
  if (worldCoord < halfTile) return 1;
  return 2;
}

export function generateMultiTileTerrain(
  seed: string,
  scale: number = 0.02,
  octaves: number = 3
): MultiTileVoxelGrid {
  const tiles: VoxelGrid[][] = [];
  for (let tx = 0; tx < 3; tx++) {
    const row: VoxelGrid[] = [];
    for (let tz = 0; tz < 3; tz++) {
      const worldOffsetX = -HALF_WORLD + tx * TILE_WORLD_SIZE;
      const worldOffsetZ = -HALF_WORLD + tz * TILE_WORLD_SIZE;
      const grid = new VoxelGrid();
      grid.generateFromNoise(seed, scale, octaves, undefined, worldOffsetX, worldOffsetZ);
      row.push(grid);
    }
    tiles.push(row);
  }
  return createMultiTileVoxelGrid(tiles);
}

export function createMultiTileVoxelGrid(tiles: VoxelGrid[][]): MultiTileVoxelGrid {
  if (tiles.length !== 3 || tiles[0].length !== 3) {
    throw new Error('MultiTileVoxelGrid requires 3×3 tiles');
  }

  return {
    width: MULTI_TILE_VOXEL_WIDTH,
    depth: MULTI_TILE_VOXEL_DEPTH,
    height: MULTI_TILE_VOXEL_HEIGHT,

    getVoxel(globalX: number, globalY: number, globalZ: number): boolean {
      if (globalX < 0 || globalX >= MULTI_TILE_VOXEL_WIDTH ||
          globalY < 0 || globalY >= MULTI_TILE_VOXEL_HEIGHT ||
          globalZ < 0 || globalZ >= MULTI_TILE_VOXEL_DEPTH) {
        return false;
      }
      const tx = Math.floor(globalX / GRID_WIDTH);
      const tz = Math.floor(globalZ / GRID_DEPTH);
      const lx = globalX % GRID_WIDTH;
      const lz = globalZ % GRID_DEPTH;
      return tiles[tx][tz].getVoxel(lx, globalY, lz);
    },

    getColumnHeight(globalX: number, globalZ: number): number {
    for (let y = MULTI_TILE_VOXEL_HEIGHT - 1; y >= 0; y--) {
      if (this.getVoxel(globalX, y, globalZ)) return y + 1;
    }
    return 0;
  },

  getWorldSurfaceY(worldX: number, worldZ: number): number {
      const tx = worldToTileIndex(worldX);
      const tz = worldToTileIndex(worldZ);
      const tileCenterX = (tx - 1) * TILE_WORLD_SIZE;
      const tileCenterZ = (tz - 1) * TILE_WORLD_SIZE;
      const localWorldX = worldX - tileCenterX;
      const localWorldZ = worldZ - tileCenterZ;
      return tiles[tx][tz].getWorldSurfaceY(localWorldX, localWorldZ);
    },

    getTiles(): VoxelGrid[][] {
      return tiles;
    },

    getOffset(): { offsetX: number; offsetZ: number } {
      return { offsetX: MULTI_TILE_OFFSET_X, offsetZ: MULTI_TILE_OFFSET_Z };
    },
  };
}
