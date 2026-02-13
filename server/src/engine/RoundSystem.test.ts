import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COMP_PLAYER, COMP_HEALTH, COMP_STATS, COMP_COLLECTED, COMP_WEAPON_TYPE, Opcode } from '@spong/shared';
import { RoundSystem } from './RoundSystem.js';
import { createTestWorld, createTestPlayerEntity } from '../test/helpers.js';

describe('RoundSystem', () => {
  let world: ReturnType<typeof createTestWorld>;
  let broadcast: ReturnType<typeof vi.fn>;
  let getActivePlayerEntities: () => ReturnType<typeof createTestPlayerEntity>[];
  let getPlayerColor: (entityId: number) => string | undefined;
  let system: RoundSystem;

  beforeEach(() => {
    world = createTestWorld();
    const players: ReturnType<typeof createTestPlayerEntity>[] = [];
    getActivePlayerEntities = () => players;
    getPlayerColor = (entityId: number) => (entityId === 1 ? '#ff0000' : '#00ff00');
    broadcast = vi.fn();
    system = new RoundSystem({
      world,
      broadcast,
      getActivePlayerEntities,
      getPlayerColor,
    });
  });

  describe('checkRoundStart', () => {
    it('does not start countdown when phase is not waiting', () => {
      system.phase = 'active';
      const e1 = createTestPlayerEntity(world, 'c1');
      const e2 = createTestPlayerEntity(world, 'c2');
      getActivePlayerEntities().push(e1, e2);
      system.config.minPlayers = 2;
      system.checkRoundStart();
      expect(system.phase).toBe('active');
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('starts countdown when enough players and phase is waiting', () => {
      const e1 = createTestPlayerEntity(world, 'c1');
      const e2 = createTestPlayerEntity(world, 'c2');
      getActivePlayerEntities().push(e1, e2);
      system.config.minPlayers = 2;
      system.checkRoundStart();
      expect(system.phase).toBe('countdown');
      expect(system.countdownSeconds).toBe(5);
      expect(broadcast).toHaveBeenCalledWith(Opcode.RoundState, expect.any(Object));
    });
  });

  describe('handleKill', () => {
    it('updates killer and victim stats and scores', () => {
      const killer = createTestPlayerEntity(world, 'k');
      const victim = createTestPlayerEntity(world, 'v');
      getActivePlayerEntities().push(killer, victim);
      system.phase = 'active';
      system.startRound();
      const killerStats = killer.get(COMP_STATS);
      const victimStats = victim.get(COMP_STATS);
      expect(killerStats).toBeDefined();
      expect(victimStats).toBeDefined();
      system.handleKill(killer.id, victim.id, 'pistol', false);
      expect(killerStats!.kills).toBe(1);
      expect(victimStats!.deaths).toBe(1);
      expect(broadcast).toHaveBeenCalledWith(Opcode.KillFeed, expect.objectContaining({
        killerEntityId: killer.id,
        victimEntityId: victim.id,
        weaponType: 'pistol',
        isHeadshot: false,
      }));
      expect(broadcast).toHaveBeenCalledWith(Opcode.ScoreUpdate, expect.objectContaining({
        entityId: killer.id,
        kills: 1,
        deaths: 0,
      }));
      expect(broadcast).toHaveBeenCalledWith(Opcode.ScoreUpdate, expect.objectContaining({
        entityId: victim.id,
        kills: 0,
        deaths: 1,
      }));
    });
  });

  describe('checkWinCondition', () => {
    it('ends round when scoreLimit reached', () => {
      const e1 = createTestPlayerEntity(world, 'c1');
      const e2 = createTestPlayerEntity(world, 'c2');
      getActivePlayerEntities().push(e1, e2);
      system.phase = 'active';
      system.startRound();
      system.config.scoreLimit = 2;
      system.handleKill(e1.id, e2.id);
      system.handleKill(e1.id, e2.id);
      system.checkWinCondition();
      expect(system.phase).toBe('ended');
    });
  });

  describe('cancelCountdown', () => {
    it('resets phase to waiting and clears timer', () => {
      const e1 = createTestPlayerEntity(world, 'c1');
      const e2 = createTestPlayerEntity(world, 'c2');
      getActivePlayerEntities().push(e1, e2);
      system.checkRoundStart();
      expect(system.phase).toBe('countdown');
      system.cancelCountdown();
      expect(system.phase).toBe('waiting');
      expect(system.countdownTimer).toBeUndefined();
    });
  });
});
