/**
 * Generate simplified AABB block colliders for rocks using an octree approach.
 * Recursively subdivides the volume, keeping solid regions as colliders.
 * Adapts to rock shape: large boxes in solid interiors, fine boxes at surfaces.
 */

import type { RockVoxelGrid } from './RockVoxelGrid.js';
import { ROCK_VOXEL_SIZE } from './RockVoxelGrid.js';

export interface RockCollider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Octree node for hierarchical collider generation.
 */
interface OctreeNode {
  minX: number;
  minY: number;
  minZ: number;
  size: number;
  fillRatio: number;
  children?: OctreeNode[];
}

// Store bounds globally for access in helper functions
let globalBounds: {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} | null = null;

/**
 * Generate coarse AABB colliders from a rock voxel grid using octree subdivision.
 * Uses a two-pass approach: deep subdivision followed by bottom-up merging.
 * First calculates tight bounds around solid voxels to skip empty space.
 * 
 * @param grid The voxel grid to generate colliders from
 * @param maxDepth Maximum octree depth (default 3 = 8x8x8 leaf nodes)
 * @param fillThreshold Ratio above which a node is kept whole (default 0.4 = 40%)
 * @returns Array of axis-aligned bounding boxes in local space
 */
export function generateRockColliders(
  grid: RockVoxelGrid,
  maxDepth: number = 3,
  fillThreshold: number = 0.4
): RockCollider[] {
  // Phase 0: Calculate tight bounds around solid voxels
  const bounds = calculateSolidBounds(grid);
  if (!bounds) {
    // No solid voxels - return empty
    return [];
  }
  
  // Store bounds for helper functions to clamp against
  globalBounds = bounds;
  
  // Round up size to nearest power of 2 for clean octree subdivision
  const maxExtent = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ
  );
  const octreeSize = Math.pow(2, Math.ceil(Math.log2(maxExtent)));
  
  // Phase 1: Build octree only within the tight bounds
  const root = buildOctree(
    grid,
    bounds.minX,
    bounds.minY,
    bounds.minZ,
    octreeSize,
    0,
    maxDepth,
    fillThreshold
  );
  
  // Phase 2: Bottom-up merge of fully-solid sibling groups
  mergeOctree(root, fillThreshold);
  
  // Phase 3: Extract colliders from merged tree, clamped to tight bounds
  const colliders: RockCollider[] = [];
  extractColliders(root, colliders);
  
  // Clear global bounds
  globalBounds = null;
  
  return colliders;
}

/**
 * Calculate tight AABB around all solid voxels.
 */
function calculateSolidBounds(grid: RockVoxelGrid): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} | null {
  let minX = grid.size, minY = grid.size, minZ = grid.size;
  let maxX = 0, maxY = 0, maxZ = 0;
  let foundAny = false;
  
  for (let y = 0; y < grid.size; y++) {
    for (let z = 0; z < grid.size; z++) {
      for (let x = 0; x < grid.size; x++) {
        if (grid.isSolid(x, y, z)) {
          foundAny = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
          maxX = Math.max(maxX, x + 1);
          maxY = Math.max(maxY, y + 1);
          maxZ = Math.max(maxZ, z + 1);
        }
      }
    }
  }
  
  return foundAny ? { minX, minY, minZ, maxX, maxY, maxZ } : null;
}

/**
 * Build octree structure recursively (Phase 1).
 */
function buildOctree(
  grid: RockVoxelGrid,
  minX: number,
  minY: number,
  minZ: number,
  size: number,
  depth: number,
  maxDepth: number,
  fillThreshold: number
): OctreeNode | null {
  const { solidCount, totalCount } = countSolidsInRegion(grid, minX, minY, minZ, size);
  const fillRatio = solidCount / totalCount;
  
  // Empty - prune
  if (fillRatio === 0) {
    return null;
  }
  
  const node: OctreeNode = { minX, minY, minZ, size, fillRatio };
  
  // Solid enough OR max depth - leaf node
  if (fillRatio >= fillThreshold || depth >= maxDepth) {
    return node;
  }
  
  // Mixed - subdivide
  const halfSize = size / 2;
  const children: OctreeNode[] = [];
  
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const child = buildOctree(
          grid,
          minX + dx * halfSize,
          minY + dy * halfSize,
          minZ + dz * halfSize,
          halfSize,
          depth + 1,
          maxDepth,
          fillThreshold
        );
        if (child) {
          children.push(child);
        }
      }
    }
  }
  
  if (children.length > 0) {
    node.children = children;
  }
  
  return node;
}

/**
 * Merge fully-solid adjacent children bottom-up (Phase 2).
 * If all 8 children exist and all are solid leaves, merge them.
 */
function mergeOctree(node: OctreeNode | null, fillThreshold: number): void {
  if (!node || !node.children) return;
  
  // Recursively merge children first (bottom-up)
  for (const child of node.children) {
    mergeOctree(child, fillThreshold);
  }
  
  // Check if all children are solid leaves (no grandchildren)
  if (node.children.length === 8) {
    const allSolidLeaves = node.children.every(
      child => !child.children && child.fillRatio >= fillThreshold
    );
    
    if (allSolidLeaves) {
      // Merge: remove children, make this node a leaf
      delete node.children;
    }
  }
}

/**
 * Extract colliders from merged octree (Phase 3).
 * Clamps collider bounds to tight bounds to prevent extending outside rock.
 */
function extractColliders(node: OctreeNode | null, colliders: RockCollider[]): void {
  if (!node) return;
  
  // Leaf node - emit collider
  if (!node.children) {
    let minX = node.minX;
    let minY = node.minY;
    let minZ = node.minZ;
    let maxX = node.minX + node.size;
    let maxY = node.minY + node.size;
    let maxZ = node.minZ + node.size;
    
    // Clamp to tight bounds if available
    if (globalBounds) {
      minX = Math.max(minX, globalBounds.minX);
      minY = Math.max(minY, globalBounds.minY);
      minZ = Math.max(minZ, globalBounds.minZ);
      maxX = Math.min(maxX, globalBounds.maxX);
      maxY = Math.min(maxY, globalBounds.maxY);
      maxZ = Math.min(maxZ, globalBounds.maxZ);
    }
    
    // Only emit if bounds are valid after clamping
    if (minX < maxX && minY < maxY && minZ < maxZ) {
      colliders.push({
        minX: minX * ROCK_VOXEL_SIZE,
        minY: minY * ROCK_VOXEL_SIZE,
        minZ: minZ * ROCK_VOXEL_SIZE,
        maxX: maxX * ROCK_VOXEL_SIZE,
        maxY: maxY * ROCK_VOXEL_SIZE,
        maxZ: maxZ * ROCK_VOXEL_SIZE
      });
    }
    return;
  }
  
  // Interior node - recurse to children
  for (const child of node.children) {
    extractColliders(child, colliders);
  }
}

/**
 * Count surface-adjacent solid voxels in a cubic region.
 * Only counts voxels that have at least one empty neighbor (visible geometry).
 * Clamps to global tight bounds to prevent octree from extending outside rock.
 */
function countSolidsInRegion(
  grid: RockVoxelGrid,
  minX: number,
  minY: number,
  minZ: number,
  size: number
): { solidCount: number; totalCount: number } {
  let solidCount = 0;
  let totalCount = 0;
  
  // Clamp to grid size
  let maxX = Math.min(minX + size, grid.size);
  let maxY = Math.min(minY + size, grid.size);
  let maxZ = Math.min(minZ + size, grid.size);
  
  // Clamp to tight bounds if available (prevents octree from extending outside rock)
  if (globalBounds) {
    minX = Math.max(minX, globalBounds.minX);
    minY = Math.max(minY, globalBounds.minY);
    minZ = Math.max(minZ, globalBounds.minZ);
    maxX = Math.min(maxX, globalBounds.maxX);
    maxY = Math.min(maxY, globalBounds.maxY);
    maxZ = Math.min(maxZ, globalBounds.maxZ);
  }
  
  // If clamping resulted in inverted bounds, region is outside - return empty
  if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
    return { solidCount: 0, totalCount: 1 }; // totalCount > 0 to avoid divide-by-zero
  }
  
  for (let y = minY; y < maxY; y++) {
    for (let z = minZ; z < maxZ; z++) {
      for (let x = minX; x < maxX; x++) {
        totalCount++;
        if (grid.isSolid(x, y, z) && isSurfaceVoxel(grid, x, y, z)) {
          solidCount++;
        }
      }
    }
  }
  
  return { solidCount, totalCount };
}

/**
 * Check if a solid voxel is on the surface (has at least one empty neighbor).
 */
function isSurfaceVoxel(grid: RockVoxelGrid, x: number, y: number, z: number): boolean {
  // Check 6 neighbors
  return !grid.isSolid(x - 1, y, z) ||
         !grid.isSolid(x + 1, y, z) ||
         !grid.isSolid(x, y - 1, z) ||
         !grid.isSolid(x, y + 1, z) ||
         !grid.isSolid(x, y, z - 1) ||
         !grid.isSolid(x, y, z + 1);
}

/**
 * Transform local-space colliders to world-space given instance transform.
 * Centers colliders using bounds, applies ROCK_VOXEL_SIZE, then instance scale, rotation, and translation.
 * Matches the client transform chain: mesh centered by bounds -> parent with scale*ROCK_SCALE, rotation, position.
 */
export function transformRockColliders(
  localColliders: RockCollider[],
  worldX: number,
  worldY: number,
  worldZ: number,
  rotationY: number,
  scale: number,
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
): RockCollider[] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  // Combined scale: ROCK_VOXEL_SIZE (1.0) * instance scale * ROCK_RENDER_SCALE (0.5)
  const totalScale = ROCK_VOXEL_SIZE * scale * 0.5;
  // Center offset from actual bounds
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  
  return localColliders.map(col => {
    // Transform all 8 corners of the AABB
    const corners = [
      { x: col.minX, y: col.minY, z: col.minZ },
      { x: col.maxX, y: col.minY, z: col.minZ },
      { x: col.minX, y: col.maxY, z: col.minZ },
      { x: col.maxX, y: col.maxY, z: col.minZ },
      { x: col.minX, y: col.minY, z: col.maxZ },
      { x: col.maxX, y: col.minY, z: col.maxZ },
      { x: col.minX, y: col.maxY, z: col.maxZ },
      { x: col.maxX, y: col.maxY, z: col.maxZ }
    ];
    
    // Center, scale, rotate, translate each corner
    const transformed = corners.map(c => {
      // 1. Center using actual bounds (matching mesh instance position)
      const cx = (c.x - centerX) * totalScale;
      const cy = (c.y - centerY) * totalScale;
      const cz = (c.z - centerZ) * totalScale;
      
      // 2. Rotate around Y axis
      const rx = cx * cos - cz * sin;
      const rz = cx * sin + cz * cos;
      
      // 3. Translate to world position
      return {
        x: rx + worldX,
        y: cy + worldY,
        z: rz + worldZ
      };
    });
    
    // Find axis-aligned bounds of transformed corners
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (const t of transformed) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      minZ = Math.min(minZ, t.z);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
      maxZ = Math.max(maxZ, t.z);
    }
    
    return { minX, minY, minZ, maxX, maxY, maxZ };
  });
}
