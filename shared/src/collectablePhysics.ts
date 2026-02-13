/**
 * Physics for collectable items (gravity + collision detection).
 * Now supports voxel terrain, trees, rocks, and building blocks.
 */

import { PhysicsComponent } from './components/index.js';
import { GRAVITY, COLLECTABLE, GROUND_HEIGHT } from './physicsConstants.js';
import type { VoxelGrid } from './levelgen/VoxelGrid.js';
import type { TreeColliderMesh } from './treegen/TreeMesh.js';
import type { TreeTransform } from './treegen/TreeMeshTransform.js';
import type { RockColliderMesh, RockTransform } from './rockgen/index.js';
import type { BoxCollider } from './physics.js';
import { aabbVsVoxelGrid, capsuleVsTriangleMesh, capsuleVsTreeMesh } from './collision.js';

const BOUNCE_DAMPING = COLLECTABLE.BOUNCE_DAMPING;
const ITEM_RADIUS = 0.3; // Items use sphere collision

/**
 * Update physics for a collectable item.
 * Returns true if the item just settled (transitioned to onGround with no velocity).
 */
export function stepCollectable(
  physics: PhysicsComponent,
  dt: number,
  voxelGrid?: VoxelGrid,
  treeColliderMeshes?: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>,
  rockColliderMeshes?: Array<{ mesh: RockColliderMesh; transform: RockTransform }>,
  blockColliders?: BoxCollider[]
): boolean {
  // Already settled - nothing to do
  if (physics.onGround) {
    return false;
  }

  // Apply gravity
  physics.velY += GRAVITY * dt;

  // Integrate velocity
  const newX = physics.posX + physics.velX * dt;
  const newY = physics.posY + physics.velY * dt;
  const newZ = physics.posZ + physics.velZ * dt;

  // Try to move, checking collisions
  physics.posX = newX;
  physics.posY = newY;
  physics.posZ = newZ;

  let groundContact = false;

  // ── Voxel terrain collision ────────────────────────────────────
  if (voxelGrid) {
    // Use AABB collision (approximate sphere as box)
    if (aabbVsVoxelGrid(voxelGrid, physics.posX, physics.posY, physics.posZ, ITEM_RADIUS, ITEM_RADIUS, ITEM_RADIUS)) {
      // Collision detected - push item up/out to nearest free space
      // Try moving up slightly
      const testY = physics.posY + 0.1;
      if (!aabbVsVoxelGrid(voxelGrid, physics.posX, testY, physics.posZ, ITEM_RADIUS, ITEM_RADIUS, ITEM_RADIUS)) {
        physics.posY = testY;
        groundContact = true;
        physics.velY = 0;
      } else {
        // Can't move up - stop falling at current position
        groundContact = true;
        physics.velY = 0;
      }
    }
  }

  // ── Tree collision (use tree-specific collision with voxel grid coordinates) ─────────────
  if (treeColliderMeshes) {
    for (const treeData of treeColliderMeshes) {
      const result = capsuleVsTreeMesh(
        physics.posX, physics.posY, physics.posZ,
        ITEM_RADIUS, ITEM_RADIUS * 2, // Capsule approximating sphere
        treeData.mesh, treeData.transform
      );
      if (result.colliding) {
        physics.posX += result.pushX;
        physics.posY += result.pushY;
        physics.posZ += result.pushZ;

        // If push is mostly upward, item is resting on tree
        if (result.pushY > 0.01) {
          groundContact = true;
          physics.velY = 0;
        }
      }
    }
  }

  // ── Rock collision (use capsule with minimal height) ─────────────
  if (rockColliderMeshes) {
    for (const rockData of rockColliderMeshes) {
      const result = capsuleVsTriangleMesh(
        physics.posX, physics.posY, physics.posZ,
        ITEM_RADIUS, ITEM_RADIUS * 2, // Capsule approximating sphere
        rockData.mesh, rockData.transform
      );
      if (result.colliding) {
        physics.posX += result.pushX;
        physics.posY += result.pushY;
        physics.posZ += result.pushZ;

        // If push is mostly upward, item is resting on rock
        if (result.pushY > 0.01) {
          groundContact = true;
          physics.velY = 0;
        }
      }
    }
  }

  // ── Building block collision (sphere vs boxes) ──────────────────
  if (blockColliders && blockColliders.length > 0) {
    for (const block of blockColliders) {
      // Simple sphere-box collision using closest point
      const closestX = Math.max(block.minX, Math.min(physics.posX, block.maxX));
      const closestY = Math.max(block.minY, Math.min(physics.posY, block.maxY));
      const closestZ = Math.max(block.minZ, Math.min(physics.posZ, block.maxZ));

      const dx = physics.posX - closestX;
      const dy = physics.posY - closestY;
      const dz = physics.posZ - closestZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < ITEM_RADIUS * ITEM_RADIUS) {
        // Collision - push item out
        const dist = Math.sqrt(distSq);
        if (dist > 1e-6) {
          const pushDist = ITEM_RADIUS - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          physics.posX += nx * pushDist;
          physics.posY += ny * pushDist;
          physics.posZ += nz * pushDist;

          // If push is upward, item is on top of block
          if (ny > 0.7) {
            groundContact = true;
            physics.velY = 0;
          }
        }
      }
    }
  }

  // ── Flat ground fallback ────────────────────────────────────────
  if (!voxelGrid && physics.posY < GROUND_HEIGHT) {
    physics.posY = GROUND_HEIGHT;
    groundContact = true;
    physics.velY = 0;
  }

  // ── Settling logic ──────────────────────────────────────────────
  if (groundContact) {
    if (Math.abs(physics.velY) < COLLECTABLE.SETTLE_THRESHOLD && 
        Math.abs(physics.velX) < 0.1 && 
        Math.abs(physics.velZ) < 0.1) {
      // Fully settled
      physics.velX = 0;
      physics.velY = 0;
      physics.velZ = 0;
      physics.onGround = true;
      return true; // Just settled
    } else {
      // Still bouncing/sliding - apply damping
      physics.velX *= 0.8;
      physics.velZ *= 0.8;
      if (Math.abs(physics.velY) > COLLECTABLE.SETTLE_THRESHOLD) {
        physics.velY = -physics.velY * BOUNCE_DAMPING;
      }
    }
  }

  return false;
}
