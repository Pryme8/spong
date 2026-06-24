import { describe, it, expect, beforeEach } from 'vitest';
import { COMP_PLAYER, FIXED_TIMESTEP } from '@spong/shared';
import { PhysicsSystem, type PhysicsCollisionContext } from './PhysicsSystem.js';
import { createTestWorld, createTestPlayerEntity } from '../test/helpers.js';

function queueInput(pc: any, sequence: number, forward = 1) {
  pc.inputQueue.push({
    sequence,
    forward,
    right: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    jump: false,
    sprint: false,
    dive: false
  });
}

// Match PhysicsSystem's internal step ms exactly so refill is exactly 1.0/step.
const FIXED_STEP_MS = FIXED_TIMESTEP * 1000;

describe('PhysicsSystem.tick — step-per-input drain', () => {
  let world: ReturnType<typeof createTestWorld>;
  let system: PhysicsSystem;
  let clock = 0;

  // Flat-ground context: no terrain/tree/rock/block colliders.
  function tick(entities: any[], elapsedMs = FIXED_STEP_MS) {
    clock += elapsedMs;
    const ctx: PhysicsCollisionContext = {
      voxelGrid: undefined,
      treeColliderMeshes: [],
      rockColliderMeshes: [],
      blockColliders: [],
      nowMs: clock
    };
    system.tick(entities, ctx);
  }

  beforeEach(() => {
    world = createTestWorld();
    system = new PhysicsSystem();
    clock = 0; // start near zero to avoid float precision loss in elapsed subtraction
  });

  it('consumes exactly one queued input per tick when balanced', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    queueInput(pc, 1);
    tick([entity]);
    expect(pc.inputQueue).toHaveLength(0);
    expect(pc.lastProcessedInput).toBe(1);
  });

  it('catches up by draining multiple buffered inputs in one tick', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    queueInput(pc, 1);
    queueInput(pc, 2);
    queueInput(pc, 3);
    tick([entity]);
    expect(pc.inputQueue).toHaveLength(0);
    expect(pc.lastProcessedInput).toBe(3);
  });

  it('drains a small burst within the budget bank without dropping', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    for (let i = 1; i <= 5; i++) queueInput(pc, i); // 5 == full budget bank
    tick([entity]);
    expect(pc.inputQueue).toHaveLength(0);
    expect(pc.lastProcessedInput).toBe(5);
  });

  it('keeps the queue shallow under flooding (anti-bloat — bounds latency)', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    let seq = 0;
    // Every tick the client floods the queue far past the cap; the queue must
    // stay shallow (it used to bloat toward 32 = ~500ms of latency).
    for (let t = 0; t < 30; t++) {
      while (pc.inputQueue.length < 50) queueInput(pc, ++seq);
      tick([entity]);
      expect(pc.inputQueue.length).toBeLessThanOrEqual(6);
    }
  });

  it('does not advance when the queue is starved (empty)', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    const startY = pc.state.posY;
    pc.lastProcessedInput = 7;
    tick([entity]);
    expect(pc.lastProcessedInput).toBe(7);
    expect(pc.state.posY).toBe(startY);
  });

  it('caps a flooding client to real-time movement (anti-speedhack)', () => {
    // A flooding client and an honest real-time client run side by side for the
    // same real time. The flooder must not travel meaningfully farther.
    const flooder = createTestPlayerEntity(world, 'flood');
    const honest = createTestPlayerEntity(world, 'honest');
    const fp = flooder.get(COMP_PLAYER)! as any;
    const hp = honest.get(COMP_PLAYER)! as any;
    let fseq = 0;
    let hseq = 0;
    const TICKS = 120;
    for (let t = 0; t < TICKS; t++) {
      while (fp.inputQueue.length < 20) queueInput(fp, ++fseq, 1); // flood
      queueInput(hp, ++hseq, 1); // honest: exactly one input per real-time tick
      tick([flooder, honest]);
    }
    const flooderDist = Math.hypot(fp.state.posX, fp.state.posZ);
    const honestDist = Math.hypot(hp.state.posX, hp.state.posZ);
    // If the speedhack worked the flooder would be ~5x farther; allow only a tiny
    // margin for the one-time 5-step budget bank.
    expect(flooderDist).toBeLessThanOrEqual(honestDist + 1.5);
  });

  it('keeps up with a real-time client even when the server tick runs slow (timer jitter)', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    // Client produces inputs at a true 60Hz (1 per 16.67ms of REAL time), while the
    // server tick runs 20% slow (20ms gaps). Because the budget refills by real
    // elapsed time, the server must stay caught up — the queue must NOT grow toward
    // the cap (which is what the old +1-per-tick logic did, spiking latency).
    const SLOW_TICK_MS = 20;
    let seq = 0;
    let produced = 0;
    for (let t = 0; t < 120; t++) {
      const realMs = (t + 1) * SLOW_TICK_MS;
      const shouldHaveProduced = Math.floor(realMs / FIXED_STEP_MS); // true 60Hz client
      while (produced < shouldHaveProduced) { queueInput(pc, ++seq); produced++; }
      tick([entity], SLOW_TICK_MS);
    }
    expect(pc.inputQueue.length).toBeLessThanOrEqual(3);
  });

  it('banks budget while starved so a brief stall recovers in one catch-up burst', () => {
    const entity = createTestPlayerEntity(world, 'conn1');
    const pc = entity.get(COMP_PLAYER)! as any;
    for (let i = 0; i < 5; i++) tick([entity]); // starved ticks keep bank at cap (5)
    for (let i = 1; i <= 5; i++) queueInput(pc, i);
    const before = pc.lastProcessedInput;
    tick([entity]);
    expect(pc.lastProcessedInput - before).toBe(5); // full bank drains the burst at once
  });
});
