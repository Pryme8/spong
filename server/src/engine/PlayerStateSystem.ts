/**
 * Server-side player state: buff expiry, stamina consumption/regeneration, input dequeue.
 * Uses shared WATER and STAMINA constants. Called each physics tick before character stepping.
 */

import type { Entity } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_STAMINA,
  COMP_ACTIVE_BUFFS,
  COMP_SHOOTABLE,
  COMP_WEAPON_TYPE,
  COMP_AMMO,
  FIXED_TIMESTEP,
  Opcode,
  STAMINA,
  WATER,
  WEAPON_STATS,
  applyBloomDecay,
  type PlayerComponent,
  type StaminaComponent,
  type ActiveBuffsComponent,
  type ActiveBuff,
  type ShootableComponent,
  type WeaponTypeComponent,
  type AmmoComponent,
  type WeaponType,
} from '@spong/shared';

export interface PlayerStateSystemOptions {
  broadcast: (opcode: number, msg: unknown) => void;
}

export class PlayerStateSystem {
  private readonly broadcast: (opcode: number, msg: unknown) => void;

  constructor(options: PlayerStateSystemOptions) {
    this.broadcast = options.broadcast;
  }

  /** Expire buffs and broadcast BuffExpired for each. */
  tickBuffs(activePlayers: Entity[], now: number): void {
    for (const entity of activePlayers) {
      const buffs = entity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (!buffs) continue;
      const expiredBuffs: ActiveBuff[] = [];
      buffs.buffs = buffs.buffs.filter(buff => {
        const elapsed = now - buff.startTime;
        if (elapsed >= buff.duration) {
          expiredBuffs.push(buff);
          return false;
        }
        return true;
      });
      for (const expiredBuff of expiredBuffs) {
        this.broadcast(Opcode.BuffExpired, {
          entityId: entity.id,
          buffType: expiredBuff.type
        });
      }
    }
  }

  /** Update stamina: exhaustion recovery, swimming drain, sprint, jump, regen. */
  tickStamina(activePlayers: Entity[], now: number): void {
    const DEEP_WATER_THRESHOLD = 0.5;
    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      const buffs = entity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (!pc || !stamina) continue;

      const hasInfiniteStamina = buffs?.buffs.some(b => b.type === 'infinite_stamina') || false;
      const isMoving = pc.input.forward !== 0 || pc.input.right !== 0;
      const isTryingToSprint = pc.input.sprint && isMoving && pc.state.isGrounded;
      const didJump = pc.input.jump && pc.state.isGrounded && !pc.state.hasJumped;
      const isSwimming = pc.state.waterDepth > DEEP_WATER_THRESHOLD && !pc.state.isGrounded;

      if (stamina.isExhausted) {
        if (pc.state.isGrounded) {
          stamina.current = Math.min(stamina.max, stamina.current + STAMINA.EXHAUSTED_REGEN_RATE * FIXED_TIMESTEP);
          if (stamina.current >= stamina.max) {
            stamina.isExhausted = false;
            stamina.exhaustedAt = 0;
          }
        }
        if (pc.input.sprint) pc.input.sprint = false;
        if (pc.input.jump) pc.input.jump = false;
      } else {
        if (hasInfiniteStamina) {
          stamina.current = stamina.max;
        } else if (isSwimming) {
          let swimmingDrain: number = WATER.SWIM_STAMINA_DRAIN;
          if (pc.input.sprint && isMoving) swimmingDrain = WATER.SWIM_SPRINT_STAMINA_DRAIN;
          else if (!isMoving) swimmingDrain = 0;
          if (swimmingDrain > 0) {
            stamina.current = Math.max(0, stamina.current - swimmingDrain * FIXED_TIMESTEP);
            if (stamina.current <= 0) {
              stamina.isExhausted = true;
              stamina.exhaustedAt = now;
              pc.input.sprint = false;
            }
          }
        } else if (isTryingToSprint) {
          stamina.current = Math.max(0, stamina.current - STAMINA.SPRINT_DRAIN * FIXED_TIMESTEP);
          if (stamina.current <= 0) {
            stamina.isExhausted = true;
            stamina.exhaustedAt = now;
            pc.input.sprint = false;
          }
        } else if (didJump) {
          stamina.current = Math.max(0, stamina.current - STAMINA.JUMP_COST);
          if (stamina.current <= 0) {
            stamina.isExhausted = true;
            stamina.exhaustedAt = now;
            pc.input.jump = false;
          }
        } else if (pc.state.isGrounded) {
          stamina.current = Math.min(stamina.max, stamina.current + STAMINA.REGEN_RATE * FIXED_TIMESTEP);
        }
      }
    }
  }

  /** Dequeue one input per entity and sync isExhausted to state. */
  syncInputAndStamina(activePlayers: Entity[]): void {
    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      if (!pc) continue;

      const queue = pc.inputQueue!;
      if (queue.length > 0) {
        const nextInput = queue.shift()!;
        pc.input.forward = nextInput.forward;
        pc.input.right = nextInput.right;
        pc.input.cameraYaw = nextInput.cameraYaw;
        pc.input.cameraPitch = nextInput.cameraPitch;
        pc.input.jump = nextInput.jump;
        pc.input.sprint = nextInput.sprint;
        pc.headPitch = nextInput.cameraPitch || 0;
        pc.lastProcessedInput = nextInput.sequence;
      }

      if (stamina) {
        pc.state.isExhausted = stamina.isExhausted;
        if (stamina.isExhausted) pc.input.sprint = false;
      }
    }
  }

  /** Post-physics: bloom decay and exhaustion speed clamp. */
  tickBloomAndExhaustion(activePlayers: Entity[]): void {
    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER)!;
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      const shootable = entity.get<ShootableComponent>(COMP_SHOOTABLE);
      const weaponTypeComp = entity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      if (shootable && weaponTypeComp && shootable.currentBloom > 0 && weaponTypeComp.type in WEAPON_STATS) {
        shootable.currentBloom = applyBloomDecay(shootable.currentBloom, weaponTypeComp.type as WeaponType, FIXED_TIMESTEP);
      }
      if (stamina?.isExhausted) {
        pc.state.velX *= 0.5;
        pc.state.velZ *= 0.5;
      }
    }
  }

  /** Advance reload timers and complete reloads. */
  tickReload(activePlayers: Entity[], now: number): void {
    for (const entity of activePlayers) {
      const ammo = entity.get<AmmoComponent>(COMP_AMMO);
      if (!ammo || !ammo.isReloading) continue;
      const elapsed = now - ammo.reloadStartTime;
      if (elapsed >= ammo.reloadTime) {
        ammo.current = ammo.capacity;
        ammo.isReloading = false;
        ammo.reloadStartTime = 0;
      }
    }
  }
}
