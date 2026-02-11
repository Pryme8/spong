/**
 * Collision voxel grid for per-object collision detection.
 * 
 * Stores a trimmed boolean voxel grid with only the filled region,
 * tight world-space bounds, and serialization for network transfer.
 */

import type { TreeVoxelGrid } from './treegen/TreeVoxelGrid.js';
import type { RockVoxelGrid } from './rockgen/RockVoxelGrid.js';
import type { BushVoxelGrid } from './bushgen/BushVoxelGrid.js';
import { TREE_VOXEL_SIZE, TREE_GRID_W, TREE_GRID_H, TREE_GRID_D } from './treegen/TreeVoxelGrid.js';
import { ROCK_VOXEL_SIZE } from './rockgen/RockVoxelGrid.js';
import { BUSH_VOXEL_SIZE, BUSH_GRID_W, BUSH_GRID_H, BUSH_GRID_D } from './bushgen/BushVoxelGrid.js';

// Collider flags (can be combined with bitwise OR)
export const COLLIDER_SOLID   = 1;  // Blocks movement
export const COLLIDER_TRIGGER = 2;  // Fires events (volume OR collision trigger)

/**
 * Trimmed collision voxel grid with tight bounds.
 * Only stores the sub-region containing solid voxels.
 */
export interface CollisionVoxelGrid {
  // Trimmed grid dimensions (filled region only)
  width: number;
  height: number;
  depth: number;
  voxelSize: number;       // world units per voxel (before transform scale)

  // Offset from object origin to the trimmed region's corner (in local pre-scale space)
  // Accounts for both grid centering AND trim offset.
  offsetX: number;
  offsetY: number;
  offsetZ: number;

  // Tight world-space half-extents (computed from filled cells, not full grid)
  // Used by SpatialHashGrid for broad-phase and by ObjectCollider
  // These are in LOCAL space (before scale applied)
  tightHalfX: number;
  tightHalfY: number;
  tightHalfZ: number;

  voxels: Uint8Array;      // 0=empty, 1=solid (trimmed region only)
}

/**
 * Object transform for collision.
 */
export interface ObjectTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;  // Y-axis rotation in radians
  scale: number;
}

/**
 * Object collider with voxel grid and world-space bounds.
 */
export interface ObjectCollider {
  id: number;                     // unique instance ID
  variationId: number;            // which variation's grid to use
  type: 'tree' | 'rock' | 'bush' | 'building';
  flags: number;                  // COLLIDER_SOLID, COLLIDER_TRIGGER, or both
  grid: CollisionVoxelGrid;       // shared reference to variation's grid
  transform: ObjectTransform;     // posX, posY, posZ, rotY, scale

  // World-space AABB from tight bounds (pre-computed at insert time)
  // Accounts for rotation expansion
  worldMinX: number;
  worldMinY: number;
  worldMinZ: number;
  worldMaxX: number;
  worldMaxY: number;
  worldMaxZ: number;
}

/**
 * Get voxel at (x, y, z) in trimmed grid space.
 * Returns false if out of bounds.
 */
export function getVoxel(grid: CollisionVoxelGrid, x: number, y: number, z: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height || z < 0 || z >= grid.depth) {
    return false;
  }
  const index = x + z * grid.width + y * grid.width * grid.depth;
  return grid.voxels[index] === 1;
}

/**
 * Create CollisionVoxelGrid from TreeVoxelGrid.
 * Material > 0 (wood or leaf) = solid.
 */
export function fromTreeVoxelGrid(grid: TreeVoxelGrid): CollisionVoxelGrid {
  const fullW = TREE_GRID_W;
  const fullH = TREE_GRID_H;
  const fullD = TREE_GRID_D;
  
  // Find actual filled bounds
  let filledMinX = fullW;
  let filledMinY = fullH;
  let filledMinZ = fullD;
  let filledMaxX = 0;
  let filledMaxY = 0;
  let filledMaxZ = 0;
  
  for (let y = 0; y < fullH; y++) {
    for (let z = 0; z < fullD; z++) {
      for (let x = 0; x < fullW; x++) {
        if (grid.getVoxel(x, y, z) > 0) {  // 1=wood, 2=leaf
          filledMinX = Math.min(filledMinX, x);
          filledMaxX = Math.max(filledMaxX, x + 1);
          filledMinY = Math.min(filledMinY, y);
          filledMaxY = Math.max(filledMaxY, y + 1);
          filledMinZ = Math.min(filledMinZ, z);
          filledMaxZ = Math.max(filledMaxZ, z + 1);
        }
      }
    }
  }
  
  // Handle empty grid
  if (filledMinX >= fullW) {
    return {
      width: 1, height: 1, depth: 1,
      voxelSize: TREE_VOXEL_SIZE,
      offsetX: 0, offsetY: 0, offsetZ: 0,
      tightHalfX: 0, tightHalfY: 0, tightHalfZ: 0,
      voxels: new Uint8Array(1)
    };
  }
  
  // Trimmed dimensions
  const trimW = filledMaxX - filledMinX;
  const trimH = filledMaxY - filledMinY;
  const trimD = filledMaxZ - filledMinZ;
  
  // Copy filled sub-region
  const trimmedVoxels = new Uint8Array(trimW * trimH * trimD);
  for (let y = 0; y < trimH; y++) {
    for (let z = 0; z < trimD; z++) {
      for (let x = 0; x < trimW; x++) {
        const srcX = x + filledMinX;
        const srcY = y + filledMinY;
        const srcZ = z + filledMinZ;
        if (grid.getVoxel(srcX, srcY, srcZ) > 0) {
          const dstIndex = x + z * trimW + y * trimW * trimD;
          trimmedVoxels[dstIndex] = 1;
        }
      }
    }
  }
  
  // Compute offset: where does voxel (0,0,0) of the trimmed grid sit in local space
  // Original grid centered: -fullSize * voxelSize * 0.5
  // Trim shifts it: + filledMin * voxelSize
  const halfGridW = fullW * TREE_VOXEL_SIZE * 0.5;
  const halfGridH = fullH * TREE_VOXEL_SIZE * 0.5;
  const halfGridD = fullD * TREE_VOXEL_SIZE * 0.5;
  const offsetX = -halfGridW + filledMinX * TREE_VOXEL_SIZE;
  const offsetY = -halfGridH + filledMinY * TREE_VOXEL_SIZE;
  const offsetZ = -halfGridD + filledMinZ * TREE_VOXEL_SIZE;
  
  // Tight half-extents in local space
  const tightHalfX = trimW * TREE_VOXEL_SIZE * 0.5;
  const tightHalfY = trimH * TREE_VOXEL_SIZE * 0.5;
  const tightHalfZ = trimD * TREE_VOXEL_SIZE * 0.5;
  
  return {
    width: trimW,
    height: trimH,
    depth: trimD,
    voxelSize: TREE_VOXEL_SIZE,
    offsetX,
    offsetY,
    offsetZ,
    tightHalfX,
    tightHalfY,
    tightHalfZ,
    voxels: trimmedVoxels
  };
}

/**
 * Create CollisionVoxelGrid from RockVoxelGrid.
 * Density > 0 = solid.
 */
export function fromRockVoxelGrid(grid: RockVoxelGrid): CollisionVoxelGrid {
  const fullSize = grid.size;
  
  // Find actual filled bounds
  let filledMinX = fullSize;
  let filledMinY = fullSize;
  let filledMinZ = fullSize;
  let filledMaxX = 0;
  let filledMaxY = 0;
  let filledMaxZ = 0;
  
  for (let y = 0; y < fullSize; y++) {
    for (let z = 0; z < fullSize; z++) {
      for (let x = 0; x < fullSize; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          filledMinX = Math.min(filledMinX, x);
          filledMaxX = Math.max(filledMaxX, x + 1);
          filledMinY = Math.min(filledMinY, y);
          filledMaxY = Math.max(filledMaxY, y + 1);
          filledMinZ = Math.min(filledMinZ, z);
          filledMaxZ = Math.max(filledMaxZ, z + 1);
        }
      }
    }
  }
  
  // Handle empty grid
  if (filledMinX >= fullSize) {
    return {
      width: 1, height: 1, depth: 1,
      voxelSize: ROCK_VOXEL_SIZE,
      offsetX: 0, offsetY: 0, offsetZ: 0,
      tightHalfX: 0, tightHalfY: 0, tightHalfZ: 0,
      voxels: new Uint8Array(1)
    };
  }
  
  // Trimmed dimensions
  const trimW = filledMaxX - filledMinX;
  const trimH = filledMaxY - filledMinY;
  const trimD = filledMaxZ - filledMinZ;
  
  // Copy filled sub-region
  const trimmedVoxels = new Uint8Array(trimW * trimH * trimD);
  for (let y = 0; y < trimH; y++) {
    for (let z = 0; z < trimD; z++) {
      for (let x = 0; x < trimW; x++) {
        const srcX = x + filledMinX;
        const srcY = y + filledMinY;
        const srcZ = z + filledMinZ;
        if (grid.getDensity(srcX, srcY, srcZ) > 0) {
          const dstIndex = x + z * trimW + y * trimW * trimD;
          trimmedVoxels[dstIndex] = 1;
        }
      }
    }
  }
  
  // Compute offset (rock grids are centered at origin)
  const halfGridSize = fullSize * ROCK_VOXEL_SIZE * 0.5;
  const offsetX = -halfGridSize + filledMinX * ROCK_VOXEL_SIZE;
  const offsetY = -halfGridSize + filledMinY * ROCK_VOXEL_SIZE;
  const offsetZ = -halfGridSize + filledMinZ * ROCK_VOXEL_SIZE;
  
  // Tight half-extents in local space
  const tightHalfX = trimW * ROCK_VOXEL_SIZE * 0.5;
  const tightHalfY = trimH * ROCK_VOXEL_SIZE * 0.5;
  const tightHalfZ = trimD * ROCK_VOXEL_SIZE * 0.5;
  
  return {
    width: trimW,
    height: trimH,
    depth: trimD,
    voxelSize: ROCK_VOXEL_SIZE,
    offsetX,
    offsetY,
    offsetZ,
    tightHalfX,
    tightHalfY,
    tightHalfZ,
    voxels: trimmedVoxels
  };
}

/**
 * Create CollisionVoxelGrid from BushVoxelGrid.
 * Density > 0 = solid.
 */
export function fromBushVoxelGrid(grid: BushVoxelGrid): CollisionVoxelGrid {
  const fullW = BUSH_GRID_W;
  const fullH = BUSH_GRID_H;
  const fullD = BUSH_GRID_D;
  
  // Find actual filled bounds
  let filledMinX = fullW;
  let filledMinY = fullH;
  let filledMinZ = fullD;
  let filledMaxX = 0;
  let filledMaxY = 0;
  let filledMaxZ = 0;
  
  for (let y = 0; y < fullH; y++) {
    for (let z = 0; z < fullD; z++) {
      for (let x = 0; x < fullW; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          filledMinX = Math.min(filledMinX, x);
          filledMaxX = Math.max(filledMaxX, x + 1);
          filledMinY = Math.min(filledMinY, y);
          filledMaxY = Math.max(filledMaxY, y + 1);
          filledMinZ = Math.min(filledMinZ, z);
          filledMaxZ = Math.max(filledMaxZ, z + 1);
        }
      }
    }
  }
  
  // Handle empty grid
  if (filledMinX >= fullW) {
    return {
      width: 1, height: 1, depth: 1,
      voxelSize: BUSH_VOXEL_SIZE,
      offsetX: 0, offsetY: 0, offsetZ: 0,
      tightHalfX: 0, tightHalfY: 0, tightHalfZ: 0,
      voxels: new Uint8Array(1)
    };
  }
  
  // Trimmed dimensions
  const trimW = filledMaxX - filledMinX;
  const trimH = filledMaxY - filledMinY;
  const trimD = filledMaxZ - filledMinZ;
  
  // Copy filled sub-region
  const trimmedVoxels = new Uint8Array(trimW * trimH * trimD);
  for (let y = 0; y < trimH; y++) {
    for (let z = 0; z < trimD; z++) {
      for (let x = 0; x < trimW; x++) {
        const srcX = x + filledMinX;
        const srcY = y + filledMinY;
        const srcZ = z + filledMinZ;
        if (grid.getDensity(srcX, srcY, srcZ) > 0) {
          const dstIndex = x + z * trimW + y * trimW * trimD;
          trimmedVoxels[dstIndex] = 1;
        }
      }
    }
  }
  
  // Compute offset (bush grids are centered at origin)
  const halfGridW = fullW * BUSH_VOXEL_SIZE * 0.5;
  const halfGridH = fullH * BUSH_VOXEL_SIZE * 0.5;
  const halfGridD = fullD * BUSH_VOXEL_SIZE * 0.5;
  const offsetX = -halfGridW + filledMinX * BUSH_VOXEL_SIZE;
  const offsetY = -halfGridH + filledMinY * BUSH_VOXEL_SIZE;
  const offsetZ = -halfGridD + filledMinZ * BUSH_VOXEL_SIZE;
  
  // Tight half-extents in local space
  const tightHalfX = trimW * BUSH_VOXEL_SIZE * 0.5;
  const tightHalfY = trimH * BUSH_VOXEL_SIZE * 0.5;
  const tightHalfZ = trimD * BUSH_VOXEL_SIZE * 0.5;
  
  return {
    width: trimW,
    height: trimH,
    depth: trimD,
    voxelSize: BUSH_VOXEL_SIZE,
    offsetX,
    offsetY,
    offsetZ,
    tightHalfX,
    tightHalfY,
    tightHalfZ,
    voxels: trimmedVoxels
  };
}

/**
 * Serialize CollisionVoxelGrid for network transfer.
 * Format: header (40 bytes) + bit-packed voxels
 * Header: 10 floats = width, height, depth, voxelSize, offsetX/Y/Z, tightHalfX/Y/Z
 */
export function serialize(grid: CollisionVoxelGrid): Uint8Array {
  const bitCount = grid.width * grid.height * grid.depth;
  const byteCount = Math.ceil(bitCount * 0.125);
  const buffer = new Uint8Array(40 + byteCount);
  const view = new DataView(buffer.buffer);
  
  // Header (10 floats = 40 bytes)
  view.setFloat32(0, grid.width, true);
  view.setFloat32(4, grid.height, true);
  view.setFloat32(8, grid.depth, true);
  view.setFloat32(12, grid.voxelSize, true);
  view.setFloat32(16, grid.offsetX, true);
  view.setFloat32(20, grid.offsetY, true);
  view.setFloat32(24, grid.offsetZ, true);
  view.setFloat32(28, grid.tightHalfX, true);
  view.setFloat32(32, grid.tightHalfY, true);
  view.setFloat32(36, grid.tightHalfZ, true);
  
  // Bit-pack voxels
  for (let i = 0; i < grid.voxels.length; i++) {
    if (grid.voxels[i] === 1) {
      const byteIndex = Math.floor(i * 0.125);
      const bitIndex = i % 8;
      buffer[40 + byteIndex] |= (1 << bitIndex);
    }
  }
  
  return buffer;
}

/**
 * Deserialize CollisionVoxelGrid from network data.
 */
export function deserialize(data: Uint8Array): CollisionVoxelGrid {
  const view = new DataView(data.buffer, data.byteOffset);
  
  // Header
  const width = view.getFloat32(0, true);
  const height = view.getFloat32(4, true);
  const depth = view.getFloat32(8, true);
  const voxelSize = view.getFloat32(12, true);
  const offsetX = view.getFloat32(16, true);
  const offsetY = view.getFloat32(20, true);
  const offsetZ = view.getFloat32(24, true);
  const tightHalfX = view.getFloat32(28, true);
  const tightHalfY = view.getFloat32(32, true);
  const tightHalfZ = view.getFloat32(36, true);
  
  // Unpack voxels
  const voxelCount = width * height * depth;
  const voxels = new Uint8Array(voxelCount);
  
  for (let i = 0; i < voxelCount; i++) {
    const byteIndex = Math.floor(i * 0.125);
    const bitIndex = i % 8;
    const byte = data[40 + byteIndex];
    voxels[i] = (byte & (1 << bitIndex)) ? 1 : 0;
  }
  
  return {
    width,
    height,
    depth,
    voxelSize,
    offsetX,
    offsetY,
    offsetZ,
    tightHalfX,
    tightHalfY,
    tightHalfZ,
    voxels
  };
}
