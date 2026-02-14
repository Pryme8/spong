import { GRAVITY, GROUND_HEIGHT, CHARACTER, WATER } from './physicsConstants.js';
import { PLAYER_HITBOX_HALF, PLAYER_CAPSULE_RADIUS } from './types.js';
import type { VoxelGrid } from './levelgen/VoxelGrid.js';
import type { MultiTileVoxelGrid } from './levelgen/MultiTileVoxelGrid.js';

/** Terrain grid for collision - VoxelGrid or MultiTileVoxelGrid */
export type TerrainCollisionGrid = VoxelGrid | MultiTileVoxelGrid;
import { aabbVsVoxelGrid, capsuleVsTriangleMesh, capsuleVsTreeMesh } from './collision.js';
import type { RockColliderMesh, RockTransform } from './rockgen/index.js';
import type { TreeColliderMesh } from './treegen/TreeMesh.js';
import type { TreeTransform } from './treegen/TreeMeshTransform.js';

/**
 * Simple box collider for building blocks
 */
export interface BoxCollider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Water level provider interface (used by server for spawn validation).
 * Physics uses global WATER.LEVEL_Y for swimming/breath - no provider needed.
 */
export interface WaterLevelProvider {
  getWaterLevelAt(x: number, z: number): number;
}

// Character physics constants (from unified constants)
const MOVEMENT_ACCELERATION = CHARACTER.ACCELERATION;
const MOVEMENT_MAX_SPEED = CHARACTER.MAX_SPEED;
const MOVEMENT_FRICTION = CHARACTER.FRICTION;
const AIR_CONTROL = CHARACTER.AIR_CONTROL;
const JUMP_VELOCITY = CHARACTER.JUMP_VELOCITY;
const STEP_HEIGHT = CHARACTER.STEP_HEIGHT;

/**
 * Check if player AABB overlaps any block collider.
 */
function aabbVsBlocks(
  x: number, y: number, z: number,
  halfW: number, halfH: number,
  blocks: BoxCollider[]
): boolean {
  const minX = x - halfW;
  const maxX = x + halfW;
  const minY = y - halfH;
  const maxY = y + halfH;
  const minZ = z - halfW;
  const maxZ = z + halfW;
  
  for (const b of blocks) {
    if (maxX > b.minX && minX < b.maxX &&
        maxY > b.minY && minY < b.maxY &&
        maxZ > b.minZ && minZ < b.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Find the highest block top beneath the player's feet in a column.
 * Returns the Y the player should stand at, or -Infinity if no block below.
 */
// Unused helper function - commented out to avoid linter warnings
// function findBlockFloor(
//   x: number, y: number, z: number,
//   halfW: number, halfH: number,
//   blocks: BoxCollider[]
// ): number {
//   const minX = x - halfW;
//   const maxX = x + halfW;
//   const minZ = z - halfW;
//   const maxZ = z + halfW;
//   const feetY = y - halfH;
//   
//   let highestTop = -Infinity;
//   
//   for (const b of blocks) {
//     // Check horizontal overlap
//     if (maxX > b.minX && minX < b.maxX &&
//         maxZ > b.minZ && minZ < b.maxZ) {
//       // Block top must be below or at player feet (with small margin)
//       if (b.maxY <= feetY + 0.05 && b.maxY > highestTop) {
//         highestTop = b.maxY;
//       }
//     }
//   }
//   
//   if (highestTop === -Infinity) return -Infinity;
//   return highestTop + halfH; // Return posY that would place feet on block top
// }

/**
 * Mutable character state used by both client and server.
 * stepCharacter() mutates this in place each tick.
 */
export interface CharacterState {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  yaw: number;
  isGrounded: boolean;
  hasJumped: boolean;
  // Water state
  isInWater: boolean;           // Any part of body in water
  isHeadUnderwater: boolean;    // Head below water level (triggers breath drain)
  breathRemaining: number;      // Seconds of breath remaining (0-10)
  waterDepth: number;           // How deep player center is below water surface (0 = not in water)
  // Stamina state (needed for sinking mechanic)
  isExhausted: boolean;         // True when stamina depleted (causes sinking in water)
}

/**
 * Snapshot of player input for a single tick.
 */
export interface CharacterInput {
  forward: number;   // -1, 0, 1
  right: number;     // -1, 0, 1
  cameraYaw: number;   // radians (horizontal rotation)
  cameraPitch?: number; // radians (vertical rotation, optional for shooting)
  jump: boolean;
  sprint: boolean;   // True when holding shift to run
  dive?: boolean;    // True when holding Ctrl to swim down
}

/**
 * Create a default CharacterState at the origin.
 */
export function createCharacterState(): CharacterState {
  return {
    posX: 0, posY: 0, posZ: 0,
    velX: 0, velY: 0, velZ: 0,
    yaw: 0,
    isGrounded: true,
    hasJumped: false,
    isInWater: false,
    isHeadUnderwater: false,
    breathRemaining: 10.0,
    waterDepth: 0,
    isExhausted: false
  };
}

/**
 * Shared deterministic character controller.
 * Called at fixed timestep (60 Hz) by BOTH client and server.
 * Mutates `state` in place -- no allocations.
 *
 * Handles:
 *  - Camera-relative horizontal acceleration (land) or 3D movement (swimming)
 *  - Air control factor / water control
 *  - Max speed clamping (land vs swimming speeds)
 *  - Ground friction (tight on land) / water drag (smooth gliding)
 *  - Jump (single-fire via hasJumped guard) / vertical swim boost
 *  - Gravity (land) / buoyancy (swimming)
 *  - Position integration
 *  - Ground clamping (voxel terrain or flat ground)
 *  - Voxel collision resolution
 *  - Play-area boundary (100 unit box)
 *  - Rotation towards camera yaw
 *  - Water detection and state updates (shallow vs deep water)
 * 
 * @param voxelGrid Optional voxel grid for terrain collision
 * @param treeColliders Optional array of tree collision cylinders
 * @param rockColliderMeshes Optional array of rock collision meshes with transforms
 * @param blockColliders Optional array of box colliders for building blocks
 */
export function stepCharacter(
  state: CharacterState,
  input: CharacterInput,
  dt: number,
  voxelGrid?: TerrainCollisionGrid,
  treeColliderMeshes?: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>,
  rockColliderMeshes?: Array<{ mesh: RockColliderMesh; transform: RockTransform }>,
  blockColliders?: BoxCollider[]
): void {
  // ── Determine swimming state ───────────────────────────────
  // Deep water = swimming (3D movement), shallow water = walk normally
  const DEEP_WATER_THRESHOLD = 0.5; // When water depth > 0.5, activate swimming
  const isSwimming = state.waterDepth > DEEP_WATER_THRESHOLD;

  // ── Camera-relative movement direction ──────────────────────
  const camForwardX = Math.sin(input.cameraYaw);
  const camForwardZ = Math.cos(input.cameraYaw);
  const camRightX = -Math.cos(input.cameraYaw);
  const camRightZ = Math.sin(input.cameraYaw);

  // ── Swimming: 3D camera-relative movement ───────────────────
  if (isSwimming) {
    // 3D movement direction (includes vertical based on camera pitch)
    const cameraPitch = input.cameraPitch || 0;
    const camForwardY = -Math.sin(cameraPitch); // Negative because pitch down = positive Y
    
    // Horizontal plane already normalized, scale by vertical component
    const horizontalScale = Math.cos(cameraPitch);
    
    const moveX = (camForwardX * horizontalScale) * input.forward + camRightX * input.right;
    const moveY = camForwardY * input.forward; // Only forward/back affects Y
    const moveZ = (camForwardZ * horizontalScale) * input.forward + camRightZ * input.right;
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY + moveZ * moveZ);

    if (moveLen > 0.01) {
      const normX = moveX / moveLen;
      const normY = moveY / moveLen;
      const normZ = moveZ / moveLen;

      // Apply water acceleration (reduced, floaty feel)
      state.velX += normX * WATER.ACCELERATION * dt * WATER.CONTROL;
      state.velY += normY * WATER.ACCELERATION * dt * WATER.CONTROL;
      state.velZ += normZ * WATER.ACCELERATION * dt * WATER.CONTROL;

      // Clamp to max swim speed (base = 2/3 sprint, sprint = 4/3 sprint)
      const maxSwimSpeed = input.sprint ? WATER.MAX_SPEED_SPRINT : WATER.MAX_SPEED;
      const speed = Math.sqrt(state.velX * state.velX + state.velY * state.velY + state.velZ * state.velZ);
      if (speed > maxSwimSpeed) {
        const scale = maxSwimSpeed / speed;
        state.velX *= scale;
        state.velY *= scale;
        state.velZ *= scale;
      }
    }
    // Ctrl = swim directly down
    if (input.dive) {
      state.velY -= WATER.ACCELERATION * dt * WATER.CONTROL;
    }
    if (moveLen <= 0.01) {
      // Water friction (smooth gliding when no input)
      const speed = Math.sqrt(state.velX * state.velX + state.velY * state.velY + state.velZ * state.velZ);
      if (speed > 0.01) {
        const newSpeed = Math.max(0, speed - WATER.FRICTION * dt);
        const scale = newSpeed / speed;
        state.velX *= scale;
        state.velY *= scale;
        state.velZ *= scale;
      } else {
        state.velX = 0;
        state.velY = 0;
        state.velZ = 0;
      }
    }
  } else {
    // ── Land/Shallow Water: Normal horizontal movement ─────────
    const moveX = camForwardX * input.forward + camRightX * input.right;
    const moveZ = camForwardZ * input.forward + camRightZ * input.right;
    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);

    if (moveLen > 0.01) {
      const normX = moveX / moveLen;
      const normZ = moveZ / moveLen;
      const controlFactor = state.isGrounded ? 1.0 : AIR_CONTROL;

      state.velX += normX * MOVEMENT_ACCELERATION * dt * controlFactor;
      state.velZ += normZ * MOVEMENT_ACCELERATION * dt * controlFactor;

      // Determine max speed based on wading state
      let maxSpeed = input.sprint ? MOVEMENT_MAX_SPEED * 1.5 : MOVEMENT_MAX_SPEED;
      
      // Wading in water (body center underwater but grounded): half speed
      if (state.waterDepth > 0 && state.isGrounded) {
        maxSpeed *= 0.5; // Half speed when wading
      }
      
      const speed = Math.sqrt(state.velX * state.velX + state.velZ * state.velZ);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        state.velX *= scale;
        state.velZ *= scale;
      }
    } else if (state.isGrounded) {
      // Friction only when grounded and no input (TIGHTER on land)
      const speed = Math.sqrt(state.velX * state.velX + state.velZ * state.velZ);
      if (speed > 0.01) {
        const newSpeed = Math.max(0, speed - MOVEMENT_FRICTION * dt);
        const scale = newSpeed / speed;
        state.velX *= scale;
        state.velZ *= scale;
      } else {
        state.velX = 0;
        state.velZ = 0;
      }
    }
  }

  // ── Jump / Surface Boost ───────────────────────────────────
  if (!input.jump && state.hasJumped) {
    state.hasJumped = false;
  }
  
  if (isSwimming) {
    // Swimming: Jump = swim up (strong impulse to surface)
    if (input.jump && !state.hasJumped) {
      state.velY += WATER.SWIM_UP_IMPULSE;
      state.hasJumped = true;
    }
  } else {
    // Land: Normal jump when grounded
    if (input.jump && state.isGrounded && !state.hasJumped) {
      state.velY = JUMP_VELOCITY;
      state.hasJumped = true;
      state.isGrounded = false;
    }
  }

  // ── Gravity / Buoyancy / Sinking ───────────────────────────
  if (isSwimming) {
    if (state.isExhausted) {
      // Exhausted while swimming: SINK! (no buoyancy, strong downward force)
      state.velY += GRAVITY * dt * 1.5; // 1.5x gravity for sinking
    } else {
      // Normal swimming: Apply buoyancy (natural float to surface)
      state.velY += WATER.BUOYANCY * dt;
    }
    
    // Cancel grounded state when swimming
    state.isGrounded = false;
  } else if (!state.isGrounded) {
    // Land/Air: Normal gravity
    state.velY += GRAVITY * dt;
  }

  // ── Integrate position with collision resolution ──────────
  if (voxelGrid) {
    // Voxel collision: separate X, Y, Z movement
    const newX = state.posX + state.velX * dt;
    const newY = state.posY + state.velY * dt;
    const newZ = state.posZ + state.velZ * dt;

    // Try X movement with step-up (terrain only)
    if (!aabbVsVoxelGrid(voxelGrid, newX, state.posY, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)) {
      state.posX = newX;
    } else if (state.isGrounded) {
      // Blocked - try stepping up
      const stepUpY = state.posY + STEP_HEIGHT;
      if (!aabbVsVoxelGrid(voxelGrid, newX, stepUpY, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)) {
        // Step-up successful
        state.posX = newX;
        state.posY = stepUpY;
      } else {
        // Can't step up, block movement
        state.velX = 0;
      }
    } else {
      state.velX = 0;
    }

    // Try Y movement (vertical - terrain only)
    if (!aabbVsVoxelGrid(voxelGrid, state.posX, newY, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)) {
      state.posY = newY;
    } else {
      // Collision on Y axis
      if (state.velY < 0) {
        // Hit ground
        state.isGrounded = true;
        state.velY = 0;
      } else {
        // Hit ceiling
        state.velY = 0;
      }
    }

    // Try Z movement with step-up (terrain only)
    if (!aabbVsVoxelGrid(voxelGrid, state.posX, state.posY, newZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)) {
      state.posZ = newZ;
    } else if (state.isGrounded) {
      // Blocked - try stepping up
      const stepUpY = state.posY + STEP_HEIGHT;
      if (!aabbVsVoxelGrid(voxelGrid, state.posX, stepUpY, newZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)) {
        // Step-up successful
        state.posZ = newZ;
        state.posY = stepUpY;
      } else {
        // Can't step up, block movement
        state.velZ = 0;
      }
    } else {
      state.velZ = 0;
    }

    // Ground check for next frame (terrain + blocks - just a probe, no snapping)
    const groundCheckY = state.posY - 0.05;
    state.isGrounded = aabbVsVoxelGrid(voxelGrid, state.posX, groundCheckY, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF)
      || (blockColliders !== undefined && blockColliders.length > 0 && aabbVsBlocks(state.posX, groundCheckY, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, blockColliders));
  } else {
    // No voxel grid: simple flat ground collision
    state.posX += state.velX * dt;
    state.posY += state.velY * dt;
    state.posZ += state.velZ * dt;

    if (state.posY <= GROUND_HEIGHT) {
      state.posY = GROUND_HEIGHT;
      state.velY = 0;
      state.isGrounded = true;
    }
    // Note: isGrounded will be re-checked after block collision below
  }

  // ── Play-area boundary (9-tile world: ±270) ─────────────────
  const maxBoundary = 270;
  if (state.posX > maxBoundary) {
    state.posX = maxBoundary;
    state.velX = 0;
  } else if (state.posX < -maxBoundary) {
    state.posX = -maxBoundary;
    state.velX = 0;
  }
  if (state.posZ > maxBoundary) {
    state.posZ = maxBoundary;
    state.velZ = 0;
  } else if (state.posZ < -maxBoundary) {
    state.posZ = -maxBoundary;
    state.velZ = 0;
  }

  // ── Tree collision (triangle mesh obstacles) ────────────────
  // Trees use voxel grid coordinates with specific offsets (matching visual rendering)
  if (treeColliderMeshes && treeColliderMeshes.length > 0) {
    for (const treeData of treeColliderMeshes) {
      const result = capsuleVsTreeMesh(
        state.posX,
        state.posY,
        state.posZ,
        PLAYER_CAPSULE_RADIUS,
        PLAYER_HITBOX_HALF * 2,
        treeData.mesh,
        treeData.transform
      );
      
      if (result.colliding) {
        // Push player out
        state.posX += result.pushX;
        state.posY += result.pushY;
        state.posZ += result.pushZ;
        
        // Check if push is mostly upward (standing on tree)
        const pushLen = Math.sqrt(result.pushX * result.pushX + result.pushY * result.pushY + result.pushZ * result.pushZ);
        if (pushLen > 1e-6) {
          const pushDirX = result.pushX / pushLen;
          const pushDirY = result.pushY / pushLen;
          const pushDirZ = result.pushZ / pushLen;
          
          // If push is mostly upward (Y > 0.7), player is standing on tree
          if (pushDirY > 0.7 && state.velY <= 0) {
            state.isGrounded = true;
            state.velY = 0;
          }
          
          const velDot = state.velX * pushDirX + state.velY * pushDirY + state.velZ * pushDirZ;
          if (velDot < 0) {
            state.velX -= pushDirX * velDot;
            state.velY -= pushDirY * velDot;
            state.velZ -= pushDirZ * velDot;
          }
        }
      }
    }
  }

  // ── Rock collision (triangle mesh obstacles) ─────────────────
  if (rockColliderMeshes && rockColliderMeshes.length > 0) {
    for (const rockData of rockColliderMeshes) {
      const result = capsuleVsTriangleMesh(
        state.posX,
        state.posY,
        state.posZ,
        PLAYER_CAPSULE_RADIUS,
        PLAYER_HITBOX_HALF * 2,
        rockData.mesh,
        rockData.transform
      );
      
      if (result.colliding) {
        // Push player out
        state.posX += result.pushX;
        state.posY += result.pushY;
        state.posZ += result.pushZ;
        
        // Check if push is mostly upward (standing on top of rock)
        const pushLen = Math.sqrt(result.pushX * result.pushX + result.pushY * result.pushY + result.pushZ * result.pushZ);
        if (pushLen > 1e-6) {
          const pushDirX = result.pushX / pushLen;
          const pushDirY = result.pushY / pushLen;
          const pushDirZ = result.pushZ / pushLen;
          
          // If push is mostly upward (Y > 0.7), player is standing on rock
          if (pushDirY > 0.7 && state.velY <= 0) {
            state.isGrounded = true;
            state.velY = 0;
          }
          
          const velDot = state.velX * pushDirX + state.velY * pushDirY + state.velZ * pushDirZ;
          if (velDot < 0) {
            state.velX -= pushDirX * velDot;
            state.velY -= pushDirY * velDot;
            state.velZ -= pushDirZ * velDot;
          }
        }
      }
    }
  }

  // ── Building block collision (with step-up) ─────────────────────────
  // IMPORTANT: This section resolves overlaps ONLY. Ground detection is
  // handled separately by the ground check probe (line 271-274 above).
  // Do NOT set isGrounded = true here except for step-ups, which place
  // the player directly on top of a block.
  if (blockColliders && blockColliders.length > 0) {
    const hw = PLAYER_HITBOX_HALF; // half width
    const hh = PLAYER_HITBOX_HALF; // half height
    
    // Multiple iterations to resolve stacking overlaps
    for (let iter = 0; iter < 3; iter++) {
      let resolved = true;
      
      for (const block of blockColliders) {
        const pMinX = state.posX - hw;
        const pMaxX = state.posX + hw;
        const pMinY = state.posY - hh;
        const pMaxY = state.posY + hh;
        const pMinZ = state.posZ - hw;
        const pMaxZ = state.posZ + hw;

        if (pMaxX <= block.minX || pMinX >= block.maxX ||
            pMaxY <= block.minY || pMinY >= block.maxY ||
            pMaxZ <= block.minZ || pMinZ >= block.maxZ) {
          continue; // No overlap
        }

        // Calculate overlaps
        const overlapX = Math.min(pMaxX - block.minX, block.maxX - pMinX);
        const overlapY = Math.min(pMaxY - block.minY, block.maxY - pMinY);
        const overlapZ = Math.min(pMaxZ - block.minZ, block.maxZ - pMinZ);

        // Try step-up: if overlap in Y is small enough (block top near feet)
        // and player is grounded, step up instead of pushing out
        const blockTop = block.maxY;
        const feetY = state.posY - hh;
        const stepNeeded = blockTop - feetY;
        
        if (state.isGrounded && stepNeeded > 0 && stepNeeded <= STEP_HEIGHT) {
          // Check if there's room above at the stepped-up position
          const steppedY = blockTop + hh;
          if (!aabbVsBlocks(state.posX, steppedY, state.posZ, hw, hh, blockColliders)) {
            // Step up onto block - this is the ONE place we set grounded
            state.posY = steppedY;
            state.velY = 0;
            state.isGrounded = true;
            resolved = false;
            continue;
          }
        }

        // Normal push-out along shortest axis
        if (overlapX < overlapY && overlapX < overlapZ) {
          // Push out on X axis
          if (state.posX < (block.minX + block.maxX) * 0.5) {
            state.posX -= overlapX;
          } else {
            state.posX += overlapX;
          }
          state.velX = 0;
        } else if (overlapY < overlapZ) {
          // Push out on Y axis
          if (state.posY < (block.minY + block.maxY) * 0.5) {
            // Player is BELOW block center - push DOWN (hit head on block)
            state.posY -= overlapY;
            if (state.velY > 0) state.velY = 0;
          } else {
            // Player is ABOVE block center - push UP (landed on block)
            state.posY += overlapY;
            // Let the ground check probe handle grounded state
            state.velY = 0;
          }
        } else {
          // Push out on Z axis
          if (state.posZ < (block.minZ + block.maxZ) * 0.5) {
            state.posZ -= overlapZ;
          } else {
            state.posZ += overlapZ;
          }
          state.velZ = 0;
        }
        resolved = false;
      }
      
      if (resolved) break;
    }

    // Re-run ground check AFTER block collision resolution
    // This ensures isGrounded is accurate after push-outs moved the player
    const groundCheckY2 = state.posY - 0.05;
    const groundedOnVoxel = voxelGrid ? aabbVsVoxelGrid(voxelGrid, state.posX, groundCheckY2, state.posZ, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF, PLAYER_HITBOX_HALF) : false;
    const groundedOnBlock = aabbVsBlocks(state.posX, groundCheckY2, state.posZ, hw, hh, blockColliders);
    const groundedOnFlat = !voxelGrid && state.posY <= GROUND_HEIGHT + 0.05;
    state.isGrounded = groundedOnVoxel || groundedOnBlock || groundedOnFlat;
  }

  // ── Water detection: global Y level only (no voxel sampling) ──
  const waterY = WATER.LEVEL_Y;
  const feetY = state.posY - PLAYER_HITBOX_HALF;
  const headY = state.posY + PLAYER_HITBOX_HALF;
  state.isInWater = feetY < waterY;
  state.isHeadUnderwater = headY < waterY;
  state.waterDepth = state.posY < waterY ? waterY - state.posY : 0;

  // ── Breath management ──────────────────────────────────────
  if (state.isHeadUnderwater) {
    // Drain breath when head is underwater
    state.breathRemaining -= dt;
    if (state.breathRemaining < 0) {
      state.breathRemaining = 0;
    }
  } else {
    // Instant breath recovery when head surfaces
    state.breathRemaining = WATER.MAX_BREATH;
  }

  // ── Instant rotation to camera yaw ─────────────────────────
  // Player cube instantly faces camera direction (no smooth rotation)
  state.yaw = input.cameraYaw;
}
