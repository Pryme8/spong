import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COMP_PLAYER, COMP_STAMINA, COMP_ACTIVE_BUFFS, COMP_AMMO, Opcode } from '@spong/shared';
import { PlayerStateSystem } from './PlayerStateSystem.js';
import { createTestWorld, createTestPlayerEntity } from '../test/helpers.js';

describe('PlayerStateSystem', () => {
  let world: ReturnType<typeof createTestWorld>;
  let broadcast: ReturnType<typeof vi.fn>;
  let system: PlayerStateSystem;

  beforeEach(() => {
    world = createTestWorld();
    broadcast = vi.fn();
    system = new PlayerStateSystem({ broadcast });
  });

  describe('tickBuffs', () => {
    it('expires buffs past duration and broadcasts BuffExpired', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      const buffs = entity.get(COMP_ACTIVE_BUFFS);
      expect(buffs).toBeDefined();
      buffs!.buffs = [
        { type: 'infinite_stamina', startTime: 0, duration: 1 },
      ];
      system.tickBuffs([entity], 2);
      expect(broadcast).toHaveBeenCalledWith(Opcode.BuffExpired, {
        entityId: entity.id,
        buffType: 'infinite_stamina',
      });
      expect(buffs!.buffs).toHaveLength(0);
    });

    it('does not broadcast when no buffs expired', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      const buffs = entity.get(COMP_ACTIVE_BUFFS);
      buffs!.buffs = [
        { type: 'infinite_stamina', startTime: 5, duration: 10 },
      ];
      system.tickBuffs([entity], 6);
      expect(broadcast).not.toHaveBeenCalled();
      expect(buffs!.buffs).toHaveLength(1);
    });
  });

  describe('tickStamina', () => {
    it('drains stamina when sprinting on ground', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      const pc = entity.get(COMP_PLAYER)!;
      const stamina = entity.get(COMP_STAMINA)!;
      pc.input.forward = 1;
      pc.input.sprint = true;
      pc.state.isGrounded = true;
      stamina.current = 50;
      system.tickStamina([entity], 0);
      expect(stamina.current).toBeLessThan(50);
    });

    it('sets isExhausted when stamina reaches zero from sprint', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      const pc = entity.get(COMP_PLAYER)!;
      const stamina = entity.get(COMP_STAMINA)!;
      pc.input.forward = 1;
      pc.input.sprint = true;
      pc.state.isGrounded = true;
      stamina.current = 0.1;
      system.tickStamina([entity], 1);
      expect(stamina.isExhausted).toBe(true);
      expect(pc.input.sprint).toBe(false);
    });
  });

  describe('syncInputAndStamina', () => {
    it('dequeues one input and applies to player component', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      const pc = entity.get(COMP_PLAYER)!;
      pc.inputQueue!.push({
        sequence: 42,
        forward: 1,
        right: 0,
        cameraYaw: 1.5,
        cameraPitch: 0.2,
        jump: true,
        sprint: true,
        dive: false
      });
      system.syncInputAndStamina([entity]);
      expect(pc.input.forward).toBe(1);
      expect(pc.input.jump).toBe(true);
      expect(pc.lastProcessedInput).toBe(42);
      expect(pc.inputQueue).toHaveLength(0);
    });
  });

  describe('tickReload', () => {
    it('completes reload when elapsed >= reloadTime', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      entity.add(COMP_AMMO, {
        current: 5,
        capacity: 30,
        reloadTime: 2,
        isReloading: true,
        reloadStartTime: 0,
        infinite: false,
      });
      const ammo = entity.get(COMP_AMMO)!;
      system.tickReload([entity], 2.5);
      expect(ammo.current).toBe(30);
      expect(ammo.isReloading).toBe(false);
    });

    it('does not complete reload before reloadTime', () => {
      const entity = createTestPlayerEntity(world, 'conn1');
      entity.add(COMP_AMMO, {
        current: 5,
        capacity: 30,
        reloadTime: 2,
        isReloading: true,
        reloadStartTime: 0,
        infinite: false,
      });
      const ammo = entity.get(COMP_AMMO)!;
      system.tickReload([entity], 0.5);
      expect(ammo.current).toBe(5);
      expect(ammo.isReloading).toBe(true);
    });
  });
});
