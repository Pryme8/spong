import type { Entity } from '@spong/shared';
import { COMP_PLAYER, COMP_PHYSICS, type PlayerComponent, type PhysicsComponent } from '@spong/shared';
import {
  FIXED_TIMESTEP,
  stepCharacter,
  stepCollectable,
  capsuleVsCapsule,
  PLAYER_CAPSULE_RADIUS,
  type BoxCollider,
  type WaterLevelProvider,
} from '@spong/shared';
import type { VoxelGrid, TreeColliderMesh, TreeTransform, RockColliderMesh, RockTransform } from '@spong/shared';

export interface PhysicsCollisionContext {
  voxelGrid?: VoxelGrid;
  treeColliderMeshes: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  rockColliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
  blockColliders?: BoxCollider[];
  /** When set, used per-player for spatial culling (overrides blockColliders for character step). */
  getBlockCollidersNear?: (x: number, y: number, z: number, radius: number) => BoxCollider[] | undefined;
  waterLevelProvider?: WaterLevelProvider;
  octree?: {
    queryPoint(x: number, y: number, z: number, radius: number): Array<{ type: string; data: unknown }>;
  };
}

/**
 * Server-side physics system. Runs character stepping and player-vs-player
 * collision resolution. Room passes collision data and receives updated
 * character states (mutated in place on PlayerComponent.state).
 */
type TreeEntry = { mesh: TreeColliderMesh; transform: TreeTransform };
type RockEntry = { mesh: RockColliderMesh; transform: RockTransform };

export class PhysicsSystem {
  private readonly scratchTrees: TreeEntry[] = [];
  private readonly scratchRocks: RockEntry[] = [];

  /**
   * Tick character physics for all active players, then resolve PvP overlaps.
   * Caller must have already dequeued one input per player and synced stamina/isExhausted.
   */
  tick(activePlayers: Entity[], ctx: PhysicsCollisionContext): void {
    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;

      let filteredTrees: TreeEntry[] = ctx.treeColliderMeshes;
      let filteredRocks: RockEntry[] = ctx.rockColliderMeshes;
      if (ctx.octree) {
        this.scratchTrees.length = 0;
        this.scratchRocks.length = 0;
        const nearby = ctx.octree.queryPoint(pc.state.posX, pc.state.posY, pc.state.posZ, 8);
        for (const e of nearby) {
          if (e.type === 'tree') this.scratchTrees.push(e.data as TreeEntry);
          else if (e.type === 'rock') this.scratchRocks.push(e.data as RockEntry);
        }
        filteredTrees = this.scratchTrees;
        filteredRocks = this.scratchRocks;
      }

      const blockColliders = ctx.getBlockCollidersNear
        ? ctx.getBlockCollidersNear(pc.state.posX, pc.state.posY, pc.state.posZ, 8)
        : ctx.blockColliders;

      stepCharacter(
        pc.state,
        pc.input,
        FIXED_TIMESTEP,
        ctx.voxelGrid,
        filteredTrees,
        filteredRocks,
        blockColliders,
        ctx.waterLevelProvider
      );
    }

    this.resolvePlayerVsPlayer(activePlayers);
  }

  /**
   * Tick collectable item physics (gravity + ground collision).
   * Mutates PhysicsComponent in place. Returns entity ids that just settled for broadcast.
   */
  tickCollectables(entities: Entity[], ctx: PhysicsCollisionContext): { justSettledIds: Set<number> } {
    const justSettledIds = new Set<number>();
    for (const entity of entities) {
      const physics = entity.get<PhysicsComponent>(COMP_PHYSICS);
      if (!physics) continue;
      const justSettled = stepCollectable(
        physics,
        FIXED_TIMESTEP,
        ctx.voxelGrid,
        ctx.treeColliderMeshes,
        ctx.rockColliderMeshes,
        ctx.blockColliders
      );
      if (justSettled) justSettledIds.add(entity.id);
    }
    return { justSettledIds };
  }

  private resolvePlayerVsPlayer(playerArray: Entity[]): void {
    for (let i = 0; i < playerArray.length; i++) {
      const entity1 = playerArray[i];
      const pc1 = entity1.get<PlayerComponent>(COMP_PLAYER);
      if (!pc1) continue;

      for (let j = i + 1; j < playerArray.length; j++) {
        const entity2 = playerArray[j];
        const pc2 = entity2.get<PlayerComponent>(COMP_PLAYER);
        if (!pc2) continue;

        const result = capsuleVsCapsule(
          pc1.state.posX,
          pc1.state.posZ,
          pc2.state.posX,
          pc2.state.posZ,
          PLAYER_CAPSULE_RADIUS,
          PLAYER_CAPSULE_RADIUS
        );

        if (result.colliding) {
          pc1.state.posX += result.pushX;
          pc1.state.posZ += result.pushZ;
          pc2.state.posX -= result.pushX;
          pc2.state.posZ -= result.pushZ;

          const dx = pc2.state.posX - pc1.state.posX;
          const dz = pc2.state.posZ - pc1.state.posZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0.001) {
            const nx = dx / dist;
            const nz = dz / dist;
            const vel1Dot = pc1.state.velX * nx + pc1.state.velZ * nz;
            const vel2Dot = pc2.state.velX * nx + pc2.state.velZ * nz;
            if (vel1Dot > 0) {
              pc1.state.velX -= nx * vel1Dot;
              pc1.state.velZ -= nz * vel1Dot;
            }
            if (vel2Dot < 0) {
              pc2.state.velX -= nx * vel2Dot;
              pc2.state.velZ -= nz * vel2Dot;
            }
          }
        }
      }
    }
  }
}
