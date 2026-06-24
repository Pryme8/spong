import type { Entity } from '@spong/shared';
import { COMP_PLAYER, COMP_PHYSICS, type PlayerComponent, type PhysicsComponent } from '@spong/shared';
import {
  FIXED_TIMESTEP,
  stepCharacter,
  stepCollectable,
  capsuleVsCapsule,
  PLAYER_CAPSULE_RADIUS,
  type BoxCollider,
} from '@spong/shared';
import type { TerrainCollisionGrid, TreeColliderMesh, TreeTransform, RockColliderMesh, RockTransform } from '@spong/shared';

export interface PhysicsCollisionContext {
  voxelGrid?: TerrainCollisionGrid;
  treeColliderMeshes: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  rockColliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
  blockColliders?: BoxCollider[];
  /** When set, used per-player for spatial culling (overrides blockColliders for character step). */
  getBlockCollidersNear?: (x: number, y: number, z: number, radius: number) => BoxCollider[] | undefined;
  octree?: {
    queryPoint(x: number, y: number, z: number, radius: number): Array<{ type: string; data: unknown }>;
  };
  /** Wall-clock time (ms) of this tick, used to refill the catch-up budget by real elapsed time. Defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Server-side physics system. Runs character stepping and player-vs-player
 * collision resolution. Room passes collision data and receives updated
 * character states (mutated in place on PlayerComponent.state).
 */
type TreeEntry = { mesh: TreeColliderMesh; transform: TreeTransform };
type RockEntry = { mesh: RockColliderMesh; transform: RockTransform };

export class PhysicsSystem {
  /**
   * Cap of the catch-up budget bank (also the max steps in a single tick). Bounds
   * per-tick work after a stall. Anti-cheat itself comes from the wall-clock refill
   * (you only ever earn budget as real time passes), not from this cap.
   */
  private static readonly MaxStepsPerTick = 5;
  /** Milliseconds per fixed physics step. */
  private static readonly FixedStepMs = FIXED_TIMESTEP * 1000;

  private readonly scratchTrees: TreeEntry[] = [];
  private readonly scratchRocks: RockEntry[] = [];
  /** Wall-clock time of the previous tick, for budget refill. 0 = uninitialized. */
  private lastTickMs = 0;

  /**
   * Tick character physics for all active players, then resolve PvP overlaps.
   *
   * For each player we run one stepCharacter per buffered input, draining the
   * queue but limited by a per-player catch-up budget (see below). This keeps the
   * server's step count aligned with the client's: a balanced connection steps
   * once per tick, a backed-up queue catches up within budget, and a starved
   * queue simply doesn't advance that tick (it catches up when the inputs
   * arrive). That correspondence is what eliminates the prediction drift that
   * caused rubber-banding on stop, while the budget prevents speedhacking.
   *
   * Caller must have synced isExhausted onto state (see PlayerStateSystem).
   */
  tick(activePlayers: Entity[], ctx: PhysicsCollisionContext): void {
    // Anti-speedhack budget refill, by REAL elapsed time (not tick count). The
    // server's setInterval is jittery — often slower than 60Hz on some platforms —
    // so crediting one step per tick would throttle a client that sends at a true
    // 60Hz below its real rate, growing the input queue and spiking latency.
    // Crediting elapsedMs/FixedStepMs lets the server drain exactly as much as
    // real time allows: it keeps up with a real-time client and absorbs timer
    // jitter, while a flooding client still can't earn budget faster than time passes.
    const nowMs = ctx.nowMs ?? Date.now();
    const elapsedMs = this.lastTickMs === 0
      ? PhysicsSystem.FixedStepMs
      : Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    const refill = elapsedMs / PhysicsSystem.FixedStepMs;

    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;

      const budget = pc.stepBudget ?? PhysicsSystem.MaxStepsPerTick;
      pc.stepBudget = Math.min(PhysicsSystem.MaxStepsPerTick, budget + refill);

      const queue = pc.inputQueue;
      let stepCount = 0;
      if (queue && queue.length > 0) {
        const affordable = Math.floor(pc.stepBudget);
        // Anti-bloat: never hold more than we can process this tick plus a 1-input
        // jitter slot. Inputs beyond that exceed the real-time budget (the client is
        // ahead of real time — a hitch burst or flooding), so we DROP the oldest
        // rather than let a standing backlog accumulate and inflate latency. This
        // keeps the queue shallow (low ping) while the budget still caps the
        // sustained processing rate to real time (anti-speedhack).
        const maxKeep = affordable + 1;
        if (queue.length > maxKeep) {
          queue.splice(0, queue.length - maxKeep);
        }
        stepCount = Math.min(queue.length, affordable);
      }

      for (let s = 0; s < stepCount; s++) {
        const nextInput = queue!.shift()!;
        pc.stepBudget--;
        pc.input.forward = nextInput.forward;
        pc.input.right = nextInput.right;
        pc.input.cameraYaw = nextInput.cameraYaw;
        pc.input.cameraPitch = nextInput.cameraPitch;
        pc.input.jump = nextInput.jump;
        pc.input.sprint = nextInput.sprint;
        pc.input.dive = nextInput.dive;
        pc.headPitch = nextInput.cameraPitch || 0;
        pc.lastProcessedInput = nextInput.sequence;
        if (pc.state.isExhausted) pc.input.sprint = false;

        this.stepPlayer(pc, ctx);
      }
      // stepCount === 0: queue starved this tick — hold position and catch up
      // next tick when the delayed inputs arrive. This matches the client, which
      // also only advanced on the inputs it actually produced.
    }

    this.resolvePlayerVsPlayer(activePlayers);
  }

  /** Run one character physics step for a player, querying nearby colliders at its current position. */
  private stepPlayer(pc: PlayerComponent, ctx: PhysicsCollisionContext): void {
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
      blockColliders
    );
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
