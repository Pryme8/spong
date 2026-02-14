/**
 * Server-side transform and state broadcast. Builds TransformUpdate binary per player,
 * broadcasts to all connections. Delta-based stamina/armor/helmet updates.
 */

import type { Entity } from '@spong/shared';
import {
  Opcode,
  encodeTransform,
  COMP_PLAYER,
  COMP_STAMINA,
  COMP_ARMOR,
  COMP_HELMET,
  type TransformData,
  type PlayerComponent,
  type StaminaComponent,
  type ArmorComponent,
  type HelmetComponent,
  type StaminaUpdateMessage,
  type ArmorUpdateMessage,
  type HelmetUpdateMessage,
} from '@spong/shared';

export interface TransformBroadcastSystemOptions {
  getPlayerEntities: () => Entity[];
  getConnections: () => unknown[];
  broadcastBuffer: (connections: unknown[], buffer: ArrayBuffer) => void;
  sendLow: (opcode: number, msg: unknown) => void;
}

export class TransformBroadcastSystem {
  private readonly getPlayerEntities: () => Entity[];
  private readonly getConnections: () => unknown[];
  private readonly broadcastBuffer: (connections: unknown[], buffer: ArrayBuffer) => void;
  private readonly sendLow: (opcode: number, msg: unknown) => void;
  private readonly cache = new Map<number, {
    stamina?: number;
    isExhausted?: boolean;
    armor?: number;
    hasHelmet?: boolean;
    helmetHealth?: number;
  }>();

  constructor(options: TransformBroadcastSystemOptions) {
    this.getPlayerEntities = options.getPlayerEntities;
    this.getConnections = options.getConnections;
    this.broadcastBuffer = options.broadcastBuffer;
    this.sendLow = options.sendLow;
  }

  broadcast(): void {
    const connections = this.getConnections();
    if (connections.length === 0) return;

    const playerEntities = this.getPlayerEntities();
    for (const entity of playerEntities) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;

      const halfYaw = pc.state.yaw * 0.5;
      const transformData: TransformData = {
        entityId: entity.id,
        position: { x: pc.state.posX, y: pc.state.posY, z: pc.state.posZ },
        rotation: { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) },
        velocity: { x: pc.state.velX, y: pc.state.velY, z: pc.state.velZ },
        headPitch: pc.headPitch,
        lastProcessedInput: pc.lastProcessedInput,
        isInWater: pc.state.isInWater,
        isHeadUnderwater: pc.state.isHeadUnderwater,
        breathRemaining: pc.state.breathRemaining,
        waterDepth: pc.state.waterDepth
      };

      const buffer = encodeTransform(Opcode.TransformUpdate, transformData);
      this.broadcastBuffer(connections, buffer);

      let cache = this.cache.get(entity.id);
      if (!cache) {
        cache = {};
        this.cache.set(entity.id, cache);
      }

      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      if (stamina && (cache.stamina !== stamina.current || cache.isExhausted !== stamina.isExhausted)) {
        cache.stamina = stamina.current;
        cache.isExhausted = stamina.isExhausted;
        const staminaMsg: StaminaUpdateMessage = {
          entityId: entity.id,
          stamina: stamina.current,
          isExhausted: stamina.isExhausted
        };
        this.sendLow(Opcode.StaminaUpdate, staminaMsg);
      }

      const armor = entity.get<ArmorComponent>(COMP_ARMOR);
      if (armor && cache.armor !== armor.current) {
        cache.armor = armor.current;
        const armorMsg: ArmorUpdateMessage = { entityId: entity.id, armor: armor.current };
        this.sendLow(Opcode.ArmorUpdate, armorMsg);
      }

      const helmet = entity.get<HelmetComponent>(COMP_HELMET);
      if (helmet && (cache.hasHelmet !== helmet.hasHelmet || cache.helmetHealth !== helmet.helmetHealth)) {
        cache.hasHelmet = helmet.hasHelmet;
        cache.helmetHealth = helmet.helmetHealth;
        const helmetMsg: HelmetUpdateMessage = {
          entityId: entity.id,
          hasHelmet: helmet.hasHelmet,
          helmetHealth: helmet.helmetHealth
        };
        this.sendLow(Opcode.HelmetUpdate, helmetMsg);
      }
    }
  }

  clearCacheForEntity(entityId: number): void {
    this.cache.delete(entityId);
  }
}
