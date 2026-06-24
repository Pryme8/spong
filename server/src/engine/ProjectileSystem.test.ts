import { describe, it, expect, beforeEach } from 'vitest';
import { COMP_PLAYER } from '@spong/shared';
import { ProjectileSystem, type ProjectileCollisionContext } from './ProjectileSystem.js';
import { createTestWorld, createTestPlayerEntity } from '../test/helpers.js';

/**
 * Lag-compensation contract: ProjectileSystem.tick must evaluate target hitboxes
 * at the rewound position supplied by ctx.getRewindPosition / ctx.rewindTimeMs
 * (model a — spawn-time rewind). Here the target's CURRENT position is far away
 * (out of range), but its REWOUND position sits directly in the projectile's path.
 */
describe('ProjectileSystem.tick — lag-compensated hit detection', () => {
  let world: ReturnType<typeof createTestWorld>;
  let system: ProjectileSystem;

  beforeEach(() => {
    world = createTestWorld();
    system = new ProjectileSystem();
  });

  function setup() {
    // Target's live position is far off the projectile's path.
    const target = createTestPlayerEntity(world, 'victim');
    const tpc = target.get(COMP_PLAYER)! as any;
    tpc.state.posX = 1000;
    tpc.state.posY = 0;
    tpc.state.posZ = 0;

    // Projectile travels +X through the origin; no gravity during the test.
    const spawn = system.spawn(world, {
      ownerId: 999, // not the target
      weaponType: 'pistol',
      posX: -2, posY: 0, posZ: 0,
      baseDirX: 1, baseDirY: 0, baseDirZ: 0,
      pelletCount: 1,
      currentAccuracy: 0,
      projectileSpeed: 25,
      damage: 10,
      gravityStartDistance: 1000
    });
    const projEntity = world.getEntity(Array.isArray(spawn) ? spawn[0].entityId : spawn.entityId)!;
    return { target, projEntity };
  }

  it('hits the target at its rewound position even though its live position is out of range', () => {
    const { target, projEntity } = setup();

    const ctx: ProjectileCollisionContext = {
      voxelGrid: undefined,
      rockColliderMeshes: [],
      groundY: 0,
      getRewindPosition: (id) => (id === target.id ? { x: 0, y: 0, z: 0 } : null),
      rewindTimeMs: 1000
    };

    let hitTarget = false;
    for (let i = 0; i < 8 && !hitTarget; i++) {
      const result = system.tick([projEntity], [target], ctx);
      if (result.hits.some(h => h.kind === 'entity' && h.targetEntityId === target.id)) {
        hitTarget = true;
      }
    }
    expect(hitTarget).toBe(true);
  });

  it('does NOT hit when no rewind is supplied (live position is out of range)', () => {
    const { target, projEntity } = setup();

    const ctx: ProjectileCollisionContext = {
      voxelGrid: undefined,
      rockColliderMeshes: [],
      groundY: 0
    };

    let hitTarget = false;
    for (let i = 0; i < 8; i++) {
      const result = system.tick([projEntity], [target], ctx);
      if (result.hits.some(h => h.kind === 'entity' && h.targetEntityId === target.id)) {
        hitTarget = true;
      }
    }
    expect(hitTarget).toBe(false);
  });
});

describe('ProjectileSystem.tick — head vs body hitbox', () => {
  let world: ReturnType<typeof createTestWorld>;
  let system: ProjectileSystem;
  const liveCtx: ProjectileCollisionContext = {
    voxelGrid: undefined,
    rockColliderMeshes: [],
    groundY: -100 // keep ground out of the way for elevated shots
  };

  beforeEach(() => {
    world = createTestWorld();
    system = new ProjectileSystem();
  });

  // Fire a horizontal projectile at height y straight through the origin where the target stands.
  function fireAtHeight(y: number): { isHeadshot: boolean | null; hit: boolean } {
    const target = createTestPlayerEntity(world, 'victim');
    const tpc = target.get(COMP_PLAYER)! as any;
    tpc.state.posX = 0; tpc.state.posY = 0; tpc.state.posZ = 0; // player anchored at body center

    const spawn = system.spawn(world, {
      ownerId: 999,
      weaponType: 'pistol',
      posX: -2, posY: y, posZ: 0,
      baseDirX: 1, baseDirY: 0, baseDirZ: 0,
      pelletCount: 1,
      currentAccuracy: 0,
      projectileSpeed: 25,
      damage: 10,
      gravityStartDistance: 1000
    });
    const projEntity = world.getEntity(Array.isArray(spawn) ? spawn[0].entityId : spawn.entityId)!;

    for (let i = 0; i < 8; i++) {
      const result = system.tick([projEntity], [target], liveCtx);
      const hit = result.hits.find(h => h.kind === 'entity' && h.targetEntityId === target.id);
      if (hit && hit.kind === 'entity') return { isHeadshot: hit.isHeadshot, hit: true };
    }
    return { isHeadshot: null, hit: false };
  }

  it('registers a body shot at body-center height', () => {
    const r = fireAtHeight(0); // body AABB centered at posY=0, half 0.5
    expect(r.hit).toBe(true);
    expect(r.isHeadshot).toBe(false);
  });

  it('registers a headshot at head height', () => {
    const r = fireAtHeight(0.8); // head center = bodyCenter(0) + PLAYER_HEAD_OFFSET_Y(0.8)
    expect(r.hit).toBe(true);
    expect(r.isHeadshot).toBe(true);
  });

  it('misses cleanly above the head', () => {
    const r = fireAtHeight(1.5); // above head AABB top (~1.1)
    expect(r.hit).toBe(false);
  });
});
