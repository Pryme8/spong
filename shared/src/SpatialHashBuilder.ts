/**
 * Shared spatial hash builder for level collision.
 * Both server and client call this with the same variations + instances
 * to build identical SpatialHashGrid instances.
 * Variations may optionally provide collisionGrid (voxel grid); when absent, instances are skipped.
 */

import { SpatialHashGrid } from './SpatialHashGrid.js';
import { COLLIDER_SOLID, COLLIDER_TRIGGER, type ObjectCollider, type CollisionVoxelGrid } from './CollisionVoxelGrid.js';
import type { TreeVariation, TreeInstance } from './levelgen/LevelTreeGenerator.js';
import type { RockVariation, RockInstance } from './levelgen/LevelRockGenerator.js';
import type { BushVariation } from './bushgen/BushVariationGenerator.js';
import type { BushInstance } from './bushgen/BushPlacement.js';

type VariationWithOptionalGrid = { collisionGrid?: CollisionVoxelGrid };

/**
 * Build a spatial hash grid from level object data.
 * This is the single source of truth for how colliders are created from instances.
 * 
 * Called by both server (Room.ts) and client (useGameSession.ts) with identical inputs.
 * 
 * @param treeVariations Tree variations with collision grids
 * @param treeInstances Tree instance positions
 * @param rockVariations Rock variations with collision grids
 * @param rockInstances Rock instance positions
 * @param bushVariations Bush variations with collision grids
 * @param bushInstances Bush instance positions
 * @returns SpatialHashGrid ready for collision queries
 */
export function buildLevelSpatialHash(
  treeVariations: TreeVariation[],
  treeInstances: TreeInstance[],
  rockVariations: RockVariation[],
  rockInstances: RockInstance[],
  bushVariations: BushVariation[],
  bushInstances: BushInstance[]
): SpatialHashGrid {
  const hash = new SpatialHashGrid(10); // 10 unit cell size
  let nextId = 0;
  
  // Insert tree instances (SOLID | TRIGGER)
  // Trees block movement and fire collision triggers when touched
  const TREE_SCALE = 0.4;
  for (const instance of treeInstances) {
    const variation = treeVariations[instance.variationId] as TreeVariation & VariationWithOptionalGrid;
    const grid = variation.collisionGrid;
    if (!grid) continue;
    const collider: ObjectCollider = {
      id: nextId++,
      variationId: instance.variationId,
      type: 'tree',
      flags: COLLIDER_SOLID | COLLIDER_TRIGGER,
      grid,
      transform: {
        posX: instance.worldX,
        posY: instance.worldY + 0.4,  // Match rendering offset
        posZ: instance.worldZ,
        rotY: instance.rotationY,
        scale: TREE_SCALE
      },
      worldMinX: 0, worldMinY: 0, worldMinZ: 0,
      worldMaxX: 0, worldMaxY: 0, worldMaxZ: 0
    };
    hash.insert(collider);
  }
  
  // Insert rock instances (SOLID only)
  // Rocks block movement but don't trigger events
  const ROCK_SCALE = 0.5;
  for (const instance of rockInstances) {
    const variation = rockVariations[instance.variationId] as RockVariation & VariationWithOptionalGrid;
    const grid = variation.collisionGrid;
    if (!grid) continue;
    const collider: ObjectCollider = {
      id: nextId++,
      variationId: instance.variationId,
      type: 'rock',
      flags: COLLIDER_SOLID,
      grid,
      transform: {
        posX: instance.worldX,
        posY: instance.worldY,
        posZ: instance.worldZ,
        rotY: instance.rotationY,
        scale: instance.scale * ROCK_SCALE
      },
      worldMinX: 0, worldMinY: 0, worldMinZ: 0,
      worldMaxX: 0, worldMaxY: 0, worldMaxZ: 0
    };
    hash.insert(collider);
  }
  
  // Insert bush instances (TRIGGER only)
  // Bushes are walk-through volume triggers
  const BUSH_SCALE = 0.25;
  for (const instance of bushInstances) {
    const variation = bushVariations[instance.variationId] as BushVariation & VariationWithOptionalGrid;
    const grid = variation.collisionGrid;
    if (!grid) continue;
    const collider: ObjectCollider = {
      id: nextId++,
      variationId: instance.variationId,
      type: 'bush',
      flags: COLLIDER_TRIGGER,
      grid,
      transform: {
        posX: instance.worldX,
        posY: instance.worldY,
        posZ: instance.worldZ,
        rotY: 0,  // Bushes don't rotate
        scale: BUSH_SCALE
      },
      worldMinX: 0, worldMinY: 0, worldMinZ: 0,
      worldMaxX: 0, worldMaxY: 0, worldMaxZ: 0
    };
    hash.insert(collider);
  }
  
  return hash;
}
