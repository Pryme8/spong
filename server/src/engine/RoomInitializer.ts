/**
 * One-time room setup: level terrain, shooting range, builder room, editor rooms.
 * Uses shared VoxelGrid / MultiTileVoxelGrid. Room passes setters and LevelSystem so initializer stays decoupled.
 */

import { VoxelGrid, type TerrainCollisionGrid } from '@spong/shared';
import { ServerWaterLevelProvider } from '../WaterLevelProvider.js';
import type { LevelSystem } from './LevelSystem.js';

export type LobbyConfig = {
  seed?: string;
  pistolCount?: number;
  headshotDmg?: number;
  normalDmg?: number;
  disableSpawns?: string[];
};

export interface RoomInitializerOptions {
  getRoomId: () => string;
  getLobbyConfig: () => LobbyConfig;
  setVoxelGrid: (v: TerrainCollisionGrid | undefined) => void;
  setWaterLevelProvider: (p: ServerWaterLevelProvider | undefined) => void;
  getLevelSystem: () => LevelSystem;
  spawnWeaponAtPosition: (type: string, x: number, y: number, z: number) => void;
  spawnPickupAtPosition: (type: string, x: number, y: number, z: number) => void;
  spawnDummyOnSurface: (x: number, z: number, color?: string) => void;
}

export class RoomInitializer {
  private readonly options: RoomInitializerOptions;

  constructor(options: RoomInitializerOptions) {
    this.options = options;
  }

  initialize(): void {
    const roomId = this.options.getRoomId();
    const lobbyConfig = this.options.getLobbyConfig();
    const levelSystem = this.options.getLevelSystem();
    if (roomId.startsWith('level_')) {
      const seed = roomId.substring(6);
      const voxelGrid = new VoxelGrid();
      voxelGrid.generateFromNoise(seed);
      this.options.setVoxelGrid(voxelGrid);
      const waterLevelProvider = new ServerWaterLevelProvider(voxelGrid);
      this.options.setWaterLevelProvider(waterLevelProvider);

      const occupiedCells = new Set<string>();
      levelSystem.generateLevel({
        seed,
        voxelGrid,
        waterLevelProvider,
        occupiedCells,
        lobbyConfig
      });
    } else {
      if (roomId.startsWith('shooting_range_') ||
          roomId.startsWith('builder_room_') ||
          roomId.startsWith('rock_editor_') ||
          roomId.startsWith('tree_editor_')) {
        const voxelGrid = new VoxelGrid();
        voxelGrid.generateFromNoise(roomId, 0.02, 3, 50);
        this.options.setVoxelGrid(voxelGrid);
      }
    }

    if (roomId.startsWith('shooting_range_')) {
      const weaponSpacing = 2;
      const baseZ = 5;
      const oppositeZ = -5;
      const baseY = 0.5;

      this.options.spawnWeaponAtPosition('pistol', -6, baseY, baseZ);
      this.options.spawnWeaponAtPosition('smg', -4.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('assault', -3 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('dmr', -1 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('lmg', 1 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('shotgun', 3 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('doublebarrel', -6, baseY, oppositeZ);
      this.options.spawnWeaponAtPosition('sniper', 5 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('rocket', 7 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('medic_pack', 9 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('large_medic_pack', 11 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('apple', 13 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('pill_bottle', 15 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('kevlar', 17 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnPickupAtPosition('helmet', 19 * weaponSpacing * 0.5, baseY, baseZ);
      this.options.spawnWeaponAtPosition('hammer', 21 * weaponSpacing * 0.5, baseY, baseZ);

      const dummyPositions = [
        { x: 0, z: 20 },
        { x: -2, z: 35 },
        { x: 2, z: 50 }
      ];
      for (const pos of dummyPositions) {
        this.options.spawnDummyOnSurface(pos.x, pos.z, '#ff6b3d');
      }
    }

    if (roomId.startsWith('builder_room_')) {
      this.options.spawnWeaponAtPosition('hammer', 0, 0.5, 5);
      levelSystem.addBuilderRoomTreeAndRock(roomId);
    }

    if (roomId.startsWith('rock_editor_')) {
    }

    if (roomId.startsWith('tree_editor_')) {
    }
  }
}
