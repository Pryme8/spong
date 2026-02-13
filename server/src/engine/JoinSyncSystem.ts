/**
 * Sends full initial state to a newly joined connection: items, level (trees/rocks/bushes),
 * dummy spawns, existing players' armor/helmet/materials, building state.
 * Room calls sendInitialState(conn) from addPlayer (inside setTimeout).
 */

import type { Entity } from '@spong/shared';
import {
  Opcode,
  COMP_ARMOR,
  COMP_HELMET,
  COMP_MATERIALS,
  type ArmorComponent,
  type HelmetComponent,
  type MaterialsComponent,
  type ArmorUpdateMessage,
  type HelmetUpdateMessage,
  type MaterialsUpdateMessage,
} from '@spong/shared';

export interface JoinSyncSystemOptions {
  sendToConn: (conn: unknown, opcode: number, msg: unknown) => void;
  getItemInitialMessages: () => unknown[];
  getTreeSpawnMessage: () => unknown | null;
  getRockSpawnMessage: () => unknown | null;
  getBushSpawnMessage: () => unknown | null;
  sendDummySpawns: (conn: unknown) => void;
  getPlayerEntities: () => Entity[];
  getBuildingInitialMessages: () => unknown[];
}

export class JoinSyncSystem {
  private readonly sendToConn: (conn: unknown, opcode: number, msg: unknown) => void;
  private readonly getItemInitialMessages: () => unknown[];
  private readonly getTreeSpawnMessage: () => unknown | null;
  private readonly getRockSpawnMessage: () => unknown | null;
  private readonly getBushSpawnMessage: () => unknown | null;
  private readonly sendDummySpawns: (conn: unknown) => void;
  private readonly getPlayerEntities: () => Entity[];
  private readonly getBuildingInitialMessages: () => unknown[];

  constructor(options: JoinSyncSystemOptions) {
    this.sendToConn = options.sendToConn;
    this.getItemInitialMessages = options.getItemInitialMessages;
    this.getTreeSpawnMessage = options.getTreeSpawnMessage;
    this.getRockSpawnMessage = options.getRockSpawnMessage;
    this.getBushSpawnMessage = options.getBushSpawnMessage;
    this.sendDummySpawns = options.sendDummySpawns;
    this.getPlayerEntities = options.getPlayerEntities;
    this.getBuildingInitialMessages = options.getBuildingInitialMessages;
  }

  sendInitialState(conn: unknown, _connIdForLog?: string): void {
    const itemMessages = this.getItemInitialMessages();
    for (const msg of itemMessages) {
      this.sendToConn(conn, Opcode.ItemSpawn, msg);
    }
    const treeMsg = this.getTreeSpawnMessage();
    if (treeMsg) this.sendToConn(conn, Opcode.TreeSpawn, treeMsg);
    const rockMsg = this.getRockSpawnMessage();
    if (rockMsg) this.sendToConn(conn, Opcode.RockSpawn, rockMsg);
    const bushMsg = this.getBushSpawnMessage();
    if (bushMsg) this.sendToConn(conn, Opcode.BushSpawn, bushMsg);

    this.sendDummySpawns(conn);

    const playerEntities = this.getPlayerEntities();
    for (const playerEntity of playerEntities) {
      const armor = playerEntity.get<ArmorComponent>(COMP_ARMOR);
      if (armor && armor.current > 0) {
        this.sendToConn(conn, Opcode.ArmorUpdate, { entityId: playerEntity.id, armor: armor.current } satisfies ArmorUpdateMessage);
      }
      const helmet = playerEntity.get<HelmetComponent>(COMP_HELMET);
      if (helmet?.hasHelmet) {
        this.sendToConn(conn, Opcode.HelmetUpdate, {
          entityId: playerEntity.id,
          hasHelmet: helmet.hasHelmet,
          helmetHealth: helmet.helmetHealth
        } satisfies HelmetUpdateMessage);
      }
      const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
      if (materials) {
        this.sendToConn(conn, Opcode.MaterialsUpdate, { entityId: playerEntity.id, materials: materials.current } satisfies MaterialsUpdateMessage);
      }
    }

    const buildingMessages = this.getBuildingInitialMessages();
    for (const buildingMsg of buildingMessages) {
      this.sendToConn(conn, Opcode.BuildingInitialState, buildingMsg);
    }
  }
}
