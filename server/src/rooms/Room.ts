import { Scene, NullEngine } from '@babylonjs/core';
import { createNullEngine, createScene } from '../engine/setupNullEngine.js';
import { PhysicsSystem } from '../engine/PhysicsSystem.js';
import { ProjectileSystem } from '../engine/ProjectileSystem.js';
import { BuildingSystem } from '../engine/BuildingSystem.js';
import { ItemSystem, type ItemType } from '../engine/ItemSystem.js';
import { RoundSystem } from '../engine/RoundSystem.js';
import { LadderSystem } from '../engine/LadderSystem.js';
import { LevelSystem } from '../engine/LevelSystem.js';
import { CombatSystem } from '../engine/CombatSystem.js';
import { GameStartSystem } from '../engine/GameStartSystem.js';
import { PlayerStateSystem } from '../engine/PlayerStateSystem.js';
import { TransformBroadcastSystem } from '../engine/TransformBroadcastSystem.js';
import { PlayerHistory } from '../engine/PlayerHistory.js';
import { JoinSyncSystem } from '../engine/JoinSyncSystem.js';
import { RoomInitializer } from '../engine/RoomInitializer.js';
import { ShootSystem } from '../engine/ShootSystem.js';
import { createPlayerEntity, createDummyEntity } from '../engine/PlayerEntityFactory.js';
import { hslToHex } from '../utils/color.js';
import { ConnectionState, ConnectionHandler } from '../network/ConnectionHandler.js';
import {
  Opcode,
  encodeProjectileDestroy,
  InputData,
  World,
  Entity,
  COMP_PLAYER,
  COMP_PROJECTILE,
  COMP_PHYSICS,
  COMP_STATS,
  TAG_KILLABLE,
  TAG_DUMMY,
  PlayerComponent,
  GROUND_HEIGHT,
  PlayerInfo,
  BlockPlaceMessage,
  BlockRemoveMessage,
  BuildingCreateMessage,
  BuildingTransformMessage,
  BuildingDestroyMessage,
  LadderPlaceMessage,
  LadderDestroyMessage,
  ProjectileSpawnData,
  FIXED_TIMESTEP,
  generateMultiTileTerrain,
  DummySpawnMessage,
  COMP_COLLECTED,
  CollectedComponent,
  StatsComponent,
} from '@spong/shared';
import { ServerWaterLevelProvider } from '../WaterLevelProvider.js';

export interface Player {
  id: string;
  connectionId: string;
  entityId: number;
  color: string;
}

// ============================================================================
// Entity Spawn System
// ============================================================================

export class Room {
  readonly id: string;
  private engine!: NullEngine;
  private scene!: Scene;
  private world = new World();
  private players = new Map<string, Player>();
  private connections = new Map<string, ConnectionState>();
  private cachedConnections: ConnectionState[] | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private connectionHandler: ConnectionHandler;
  private isInitialized = false;
  private voxelGrid?: import('@spong/shared').TerrainCollisionGrid;
  private waterLevelProvider?: ServerWaterLevelProvider;
  private itemSystem!: ItemSystem;
  private levelSystem!: LevelSystem;
  private combatSystem!: CombatSystem;
  private roundSystem!: RoundSystem;
  private ladderSystem!: LadderSystem;
  private dummyEntities: DummySpawnMessage[] = [];
  private ownerId: string | null = null;
  private lobbyConfig: { seed?: string; pistolCount?: number; headshotDmg?: number; normalDmg?: number; disableSpawns?: string[] } = {};
  private gameStartSystem!: GameStartSystem;
  private playerStateSystem!: PlayerStateSystem;
  private transformBroadcastSystem!: TransformBroadcastSystem;
  private joinSyncSystem!: JoinSyncSystem;
  private readonly playerHistory = new PlayerHistory(250);
  private readonly maxRewindMs = 150;

  private physicsRate = 60;
  private broadcastRate = 30;
  private readonly physicsSystem = new PhysicsSystem();
  private readonly projectileSystem = new ProjectileSystem();
  private buildingSystem!: BuildingSystem;
  private shootSystem!: ShootSystem;

  constructor(id: string, connectionHandler: ConnectionHandler) {
    this.id = id;
    this.connectionHandler = connectionHandler;
  }

  // ============================================================================
  // Generic Entity Spawn Functions
  // ============================================================================

  private spawnEntityAtPosition(itemType: ItemType, worldX: number, worldY: number, worldZ: number): void {
    this.itemSystem.spawnAtPosition(itemType, worldX, worldY, worldZ);
  }

  private spawnDummyAtPosition(worldX: number, worldY: number, worldZ: number, color: string = '#ff6b3d'): void {
    const { entity: _entity, spawnMsg } = createDummyEntity(this.world, worldX, worldY, worldZ, color);
    this.dummyEntities.push(spawnMsg);
    this.broadcastLow(Opcode.DummySpawn, spawnMsg);
  }

  private spawnDummyOnSurface(worldX: number, worldZ: number, color: string = '#ff6b3d'): void {
    const surfaceY = this.voxelGrid ? this.voxelGrid.getWorldSurfaceY(worldX, worldZ) : 0;
    this.spawnDummyAtPosition(worldX, surfaceY, worldZ, color);
  }

  private sendDummySpawns(conn: ConnectionState): void {
    if (this.dummyEntities.length === 0) return;
    for (const dummy of this.dummyEntities) {
      this.connectionHandler.sendLow(conn, Opcode.DummySpawn, dummy);
    }
  }

  private getActivePlayerEntities(): Entity[] {
    return this.world.query(COMP_PLAYER).filter(entity => !entity.hasTag(TAG_DUMMY));
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.engine = createNullEngine();
    this.scene = await createScene(this.engine);

    this.buildingSystem = new BuildingSystem({
      world: this.world,
      scene: this.scene,
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
    });

    this.itemSystem = new ItemSystem({
      world: this.world,
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
    });

    this.levelSystem = new LevelSystem({ itemSystem: this.itemSystem });

    this.roundSystem = new RoundSystem({
      world: this.world,
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
      getActivePlayerEntities: () => this.getActivePlayerEntities(),
      getPlayerColor: (entityId) => {
        const p = Array.from(this.players.values()).find((x) => x.entityId === entityId);
        return p?.color;
      },
    });

    this.ladderSystem = new LadderSystem({
      world: this.world,
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
    });

    this.combatSystem = new CombatSystem({
      world: this.world,
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
      getVoxelGrid: () => this.voxelGrid,
      getWaterLevelProvider: () => this.waterLevelProvider,
      getLevelSystem: () => this.levelSystem,
      roundSystem: this.roundSystem,
      dropWeaponAtPosition: (entity, x, y, z) => this.itemSystem.dropWeaponAtPosition(entity, x, y, z),
      lobbyConfig: this.lobbyConfig
    });

    this.gameStartSystem = new GameStartSystem({
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      },
      getPlayerCount: () => this.players.size,
      onCountdownComplete: () => this.onGameCountdownComplete()
    });

    this.playerStateSystem = new PlayerStateSystem({
      broadcast: (opcode, msg) => {
        this.connections.forEach(conn => this.connectionHandler.sendLow(conn, opcode, msg));
      }
    });

    this.transformBroadcastSystem = new TransformBroadcastSystem({
      getPlayerEntities: () => this.world.query(COMP_PLAYER),
      getConnections: () => this.getAllConnections(),
      broadcastBuffer: (conns, buffer) => this.connectionHandler.broadcast(conns as ConnectionState[], buffer),
      sendLow: (opcode, msg) => this.broadcastLow(opcode, msg)
    });

    this.joinSyncSystem = new JoinSyncSystem({
      sendToConn: (conn, opcode, msg) => this.connectionHandler.sendLow(conn as ConnectionState, opcode, msg),
      getItemInitialMessages: () => this.itemSystem.getInitialStateMessages(),
      getTreeSpawnMessage: () => this.levelSystem.getTreeSpawnMessage(),
      getRockSpawnMessage: () => this.levelSystem.getRockSpawnMessage(),
      getBushSpawnMessage: () => this.levelSystem.getBushSpawnMessage(),
      sendDummySpawns: (conn) => this.sendDummySpawns(conn as ConnectionState),
      getPlayerEntities: () => this.world.query(COMP_PLAYER),
      getBuildingInitialMessages: () => this.buildingSystem.getInitialStateMessages()
    });

    this.shootSystem = new ShootSystem({
      world: this.world,
      getPlayer: (id) => this.players.get(id),
      projectileSystem: this.projectileSystem,
      roundSystem: this.roundSystem,
      broadcast: (opcode, msg) => this.broadcastLow(opcode, msg)
    });

    const roomInitializer = new RoomInitializer({
      getRoomId: () => this.id,
      getLobbyConfig: () => this.lobbyConfig,
      setVoxelGrid: (v) => { this.voxelGrid = v; },
      setWaterLevelProvider: (p) => { this.waterLevelProvider = p; },
      getLevelSystem: () => this.levelSystem,
      spawnWeaponAtPosition: (type, x, y, z) => this.spawnWeaponAtPosition(type as Parameters<Room['spawnWeaponAtPosition']>[0], x, y, z),
      spawnPickupAtPosition: (type, x, y, z) => this.spawnPickupAtPosition(type as Parameters<Room['spawnPickupAtPosition']>[0], x, y, z),
      spawnDummyOnSurface: (x, z, color) => this.spawnDummyOnSurface(x, z, color)
    });
    roomInitializer.initialize();

    this.isInitialized = true;
  }

  addPlayer(conn: ConnectionState): Player {
    const entity = createPlayerEntity(this.world, conn.id);
    const isFirstPlayer = this.players.size === 0;
    const playerIndex = this.players.size;
    const hue = (playerIndex * 137.5) % 360;
    const saturation = 0.8 + Math.random() * 0.2;
    const lightness = 0.5 + Math.random() * 0.2;
    const color = hslToHex(hue, saturation, lightness);

    const player: Player = {
      id: conn.id,
      connectionId: conn.id,
      entityId: entity.id,
      color
    };

    this.players.set(conn.id, player);
    this.connections.set(conn.id, conn);
    this.cachedConnections = null;

    conn.roomId = this.id;
    conn.entityId = entity.id;

    // Set owner to first player
    if (isFirstPlayer) {
      this.ownerId = conn.id;
    }
    if (isFirstPlayer) {
      this.startTicking();
    }
    
    // If room is already in loading phase, send current ready update and register as ready
    if (this.gameStartSystem.phase === 'loading') {
      setTimeout(() => this.gameStartSystem.broadcastReadyUpdate(), 200);
    }
    if (this.gameStartSystem.phase === 'playing') {
      setTimeout(() => {
        this.connectionHandler.sendLow(conn, Opcode.GameBegin, {});
      }, 200);
    }

    setTimeout(() => {
      this.joinSyncSystem.sendInitialState(conn, conn.id);
    }, 100);

    // Send current round state to newly joined player
    setTimeout(() => {
      this.connectionHandler.sendLow(conn, Opcode.RoundState, this.roundSystem.getRoundStateMessage());
    }, 1100);

    // Check if we now have enough players to start a round
    this.roundSystem.checkRoundStart();

    return player;
  }

  /**
   * Find a valid spawn position (not underwater, on solid ground).
   * Tries origin first, then searches in expanding radius.
   * @returns {x, y, z} spawn position
   */
  findValidSpawnPosition(): { x: number; y: number; z: number } {
    return this.combatSystem.findValidSpawnPosition();
  }

  spawnWeaponAtPosition(weaponType: 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'doublebarrel' | 'sniper' | 'assault' | 'dmr' | 'rocket' | 'hammer', worldX: number, worldY: number, worldZ: number): void {
    this.spawnEntityAtPosition(weaponType, worldX, worldY, worldZ);
  }

  spawnPickupAtPosition(pickupType: 'medic_pack' | 'large_medic_pack' | 'apple' | 'pill_bottle' | 'kevlar' | 'helmet', worldX: number, worldY: number, worldZ: number): void {
    this.spawnEntityAtPosition(pickupType, worldX, worldY, worldZ);
  }

  removePlayer(connectionId: string): Player | undefined {
    const player = this.players.get(connectionId);
    if (player) {
      // Remove player's score
      this.roundSystem.scores.delete(player.entityId);
      
      this.transformBroadcastSystem.clearCacheForEntity(player.entityId);
      this.world.destroyEntity(player.entityId);
      this.players.delete(connectionId);
      this.connections.delete(connectionId);
      this.cachedConnections = null;
      // Check if round should end due to insufficient players
      const remainingPlayers = this.players.size;
      if (remainingPlayers < this.roundSystem.config.minPlayers && this.roundSystem.phase === 'active') {
        this.roundSystem.cancelCountdown();
      }

      if (this.players.size === 0) {
        this.stopTicking();
      }

      return player;
    }
    return undefined;
  }

  /** Apply an input packet to a player's ECS entity. */
  applyInput(connectionId: string, input: InputData): void {
    const player = this.players.get(connectionId);
    if (!player) return;

    const entity = this.world.getEntity(player.entityId);
    if (!entity) return;

    const comp = entity.get<PlayerComponent>(COMP_PLAYER);
    if (!comp || input.sequence <= comp.lastProcessedInput) return;

    // Queue the input for processing during the next physics tick(s).
    // This ensures each received input maps to exactly one physics step,
    // keeping client and server simulation in lockstep.
    const queue = comp.inputQueue!;
    queue.push({
      sequence: input.sequence,
      forward: input.forward,
      right: input.right,
      cameraYaw: input.cameraYaw,
      cameraPitch: input.cameraPitch,
      jump: input.jump,
      sprint: input.sprint || false,
      dive: input.dive || false
    });

    // Cap queue to prevent memory growth from clock drift or flooding
    if (queue.length > 8) {
      queue.splice(0, queue.length - 8);
    }

    // Update visual-only headPitch immediately (used for broadcast, not physics)
    comp.headPitch = input.cameraPitch || 0;
  }

  spawnProjectile(
    connectionId: string,
    aimDirX: number,
    aimDirY: number,
    aimDirZ: number,
    clientSpawnX: number,
    clientSpawnY: number,
    clientSpawnZ: number,
    shotServerTimeMs: number
  ): ProjectileSpawnData | ProjectileSpawnData[] | null {
    const result = this.shootSystem.handleShootRequest(connectionId, aimDirX, aimDirY, aimDirZ, clientSpawnX, clientSpawnY, clientSpawnZ);
    if (!result) return null;

    this.catchUpProjectiles(result, shotServerTimeMs);

    return result;
  }

  handleReloadRequest(connectionId: string): void {
    this.shootSystem.handleReloadRequest(connectionId);
  }

  /** Handle item drop request from player (Q key). */
  handleItemDrop(connectionId: string): void {
    const player = this.players.get(connectionId);
    if (!player) return;

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;

    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) {
      return; // No weapon to drop
    }

    // Player is initiating drop - client will animate and send ItemTossLand when done
    // For now, just mark that a drop is pending (client handles visual)
  }

  /** Handle explicit item pickup request from player. */
  handleItemPickupRequest(connectionId: string, itemId?: number | string): void {
    let resolvedId: number | null = null;
    if (typeof itemId === 'number') {
      resolvedId = itemId;
    } else if (typeof itemId === 'string') {
      const parsed = Number.parseInt(itemId, 10);
      if (!Number.isNaN(parsed)) resolvedId = parsed;
    }

    if (resolvedId === null) return;

    const player = this.players.get(connectionId);
    if (!player) return;

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;

    const now = Date.now() * 0.001;
    this.itemSystem.handlePickupRequest(playerEntity, resolvedId, now);
  }

  /** Handle item toss landing (called when client animation completes). */
  handleItemTossLand(connectionId: string, landX: number, landY: number, landZ: number): void {
    const player = this.players.get(connectionId);
    if (!player) return;
    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;
    this.itemSystem.handleItemTossLand(playerEntity, landX, landY, landZ);
  }

  /** Relay footstep from client to all others for spatial audio. */
  handleFootstepEvent(connectionId: string, data: { variant: number; posX: number; posY: number; posZ: number; volume: number }): void {
    const player = this.players.get(connectionId);
    if (!player) return;
    this.broadcastLow(Opcode.FootstepSound, {
      entityId: player.entityId,
      variant: data.variant,
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      volume: data.volume,
      excludeSender: true,
    });
  }

  getPlayer(connectionId: string): Player | undefined {
    return this.players.get(connectionId);
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  getPlayerInfo(entityId: number): PlayerInfo {
    const player = Array.from(this.players.values()).find(p => p.entityId === entityId);
    if (!player) {
      throw new Error(`Player with entity ID ${entityId} not found`);
    }
    const entity = this.world.getEntity(entityId);
    const stats = entity?.get<StatsComponent>(COMP_STATS);
    return {
      id: player.id,
      entityId: player.entityId,
      color: player.color,
      kills: stats?.kills || 0,
      deaths: stats?.deaths || 0
    };
  }

  getPlayerInfoList(): PlayerInfo[] {
    return this.getAllPlayers().map(p => {
      const entity = this.world.getEntity(p.entityId);
      const stats = entity?.get<StatsComponent>(COMP_STATS);
      return {
        id: p.id,
        entityId: p.entityId,
        color: p.color,
        kills: stats?.kills || 0,
        deaths: stats?.deaths || 0
      };
    });
  }

  handleBuildingCreate(playerEntityId: number, data: BuildingCreateMessage): void {
    this.buildingSystem.handleBuildingCreate(playerEntityId, data);
  }

  handleBlockPlace(playerEntityId: number, data: BlockPlaceMessage): void {
    this.buildingSystem.handleBlockPlace(playerEntityId, data);
  }

  handleBlockRemove(playerEntityId: number, data: BlockRemoveMessage): void {
    this.buildingSystem.handleBlockRemove(playerEntityId, data);
  }

  handleBuildingTransform(playerEntityId: number, data: BuildingTransformMessage): void {
    this.buildingSystem.handleBuildingTransform(playerEntityId, data);
  }

  handleBuildingDestroy(playerEntityId: number, data: BuildingDestroyMessage): void {
    this.buildingSystem.handleBuildingDestroy(playerEntityId, data);
  }

  handleLadderPlace(playerEntityId: number, data: LadderPlaceMessage): void {
    this.ladderSystem.handleLadderPlace(playerEntityId, data);
  }

  handleLadderDestroy(playerEntityId: number, data: LadderDestroyMessage): void {
    this.ladderSystem.handleLadderDestroy(playerEntityId, data);
  }

  getAllConnections(): ConnectionState[] {
    if (this.cachedConnections !== null) return this.cachedConnections;
    this.cachedConnections = Array.from(this.connections.values());
    return this.cachedConnections;
  }

  getOwnerId(): string | null {
    return this.ownerId;
  }

  getLobbyConfig(): { seed?: string; pistolCount?: number } {
    return this.lobbyConfig;
  }

  setLobbyConfig(config: { seed?: string; pistolCount?: number; headshotDmg?: number; normalDmg?: number }): void {
    this.lobbyConfig = config;
  }

  startGameCountdown(): void {
    this.gameStartSystem.startCountdown();
  }

  cancelGameCountdown(): void {
    this.gameStartSystem.cancelCountdown();
  }

  private onGameCountdownComplete(): void {
    const config = this.lobbyConfig;
    const seed = config.seed || Math.random().toString(36).substring(2, 15);
    const finalSeed = `${seed}_${this.ownerId}`;
    this.gameStartSystem.enterLoadingPhase(finalSeed);

    if (!this.voxelGrid) {
      this.voxelGrid = generateMultiTileTerrain(finalSeed);
      this.waterLevelProvider = new ServerWaterLevelProvider(this.voxelGrid);
      const occupiedCells = new Set<string>();
      this.levelSystem.generateLevel({
        seed: finalSeed,
        voxelGrid: this.voxelGrid,
        waterLevelProvider: this.waterLevelProvider,
        occupiedCells,
        lobbyConfig: config
      });
    }

    const connections = this.getAllConnections();
    connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.GameLoading, {
        seed: finalSeed,
        config: {
          seed: finalSeed,
          pistolCount: config.pistolCount,
          headshotDmg: config.headshotDmg,
          normalDmg: config.normalDmg
        }
      });
    });

    this.gameStartSystem.startLoadingTimer();
  }

  handleClientReady(playerId: string): void {
    this.gameStartSystem.markPlayerReady(playerId);
  }

  getPlayerCount(): number {
    return this.players.size;
  }
  
  isGameActive(): boolean {
    return this.gameStartSystem.isGameActive();
  }

  private startTicking() {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      this.physicsTick();
    }, 1000 / this.physicsRate);

    this.broadcastInterval = setInterval(() => {
      this.broadcastTransforms();
    }, 1000 / this.broadcastRate);
  }

  private stopTicking() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private physicsTick() {
    const now = Date.now() * 0.001;
    const nowMs = Date.now();
    const playerEntities = this.world.query(COMP_PLAYER);
    const activePlayers = playerEntities.filter(entity => !entity.hasTag(TAG_DUMMY));

    this.playerStateSystem.tickBuffs(activePlayers, now);
    this.playerStateSystem.tickStamina(activePlayers, now);
    this.playerStateSystem.syncInputAndStamina(activePlayers);

    // Character physics (stepping + PvP resolution)
    const blockColliders = this.buildingSystem.collectBlockColliders();
    this.physicsSystem.tick(activePlayers, {
      voxelGrid: this.voxelGrid,
      treeColliderMeshes: this.levelSystem.getTreeColliderMeshes(),
      rockColliderMeshes: this.levelSystem.getRockColliderMeshes(),
      blockColliders,
      getBlockCollidersNear: (x, y, z, r) => this.buildingSystem.collectBlockCollidersNear(x, y, z, r),
      octree: this.levelSystem.getOctree() ?? undefined,
    });

    this.playerStateSystem.tickBloomAndExhaustion(activePlayers);
    this.combatSystem.tickDrowning(activePlayers, now);
    this.playerStateSystem.tickReload(activePlayers, now);

    const killableEntities = this.world.queryTag(TAG_KILLABLE);
    this.playerHistory.record(killableEntities, nowMs);

    const projectileEntities = this.world.query(COMP_PROJECTILE);
    const projectileResult = this.projectileSystem.tick(projectileEntities, killableEntities, {
      voxelGrid: this.voxelGrid,
      rockColliderMeshes: this.levelSystem.getRockColliderMeshes(),
      octree: this.levelSystem.getOctree() ?? undefined,
      groundY: GROUND_HEIGHT
    });

    this.combatSystem.processProjectileHits(projectileResult.hits, killableEntities);
    for (const id of projectileResult.toDestroy) {
      const buffer = encodeProjectileDestroy(Opcode.ProjectileDestroy, { entityId: id });
      this.connectionHandler.broadcast(this.getAllConnections(), buffer);
      this.world.destroyEntity(id);
    }

    const collectableEntities = this.world.query(COMP_PHYSICS);
    const collectableCtx = {
      voxelGrid: this.voxelGrid,
      treeColliderMeshes: this.levelSystem.getTreeColliderMeshes(),
      rockColliderMeshes: this.levelSystem.getRockColliderMeshes(),
      blockColliders,
      octree: this.levelSystem.getOctree() ?? undefined,
    };
    const { justSettledIds } = this.physicsSystem.tickCollectables(collectableEntities, collectableCtx);
    this.itemSystem.broadcastPositionUpdates(collectableEntities, justSettledIds);

    // 5. Step Havok scene for future environment physics
    this.scene.render();
  }

  private catchUpProjectiles(
    spawnData: ProjectileSpawnData | ProjectileSpawnData[],
    shotServerTimeMs: number
  ): void {
    const nowMs = Date.now();
    const lagMs = Math.min(this.maxRewindMs, Math.max(0, nowMs - shotServerTimeMs));
    if (lagMs <= 0) return;

    const spawnArray = Array.isArray(spawnData) ? spawnData : [spawnData];
    const projectileEntities: Entity[] = [];
    for (const data of spawnArray) {
      const entity = this.world.getEntity(data.entityId);
      if (entity) projectileEntities.push(entity);
    }

    if (projectileEntities.length === 0) return;

    const killableEntities = this.world.queryTag(TAG_KILLABLE);
    const ctx = {
      voxelGrid: this.voxelGrid,
      rockColliderMeshes: this.levelSystem.getRockColliderMeshes(),
      octree: this.levelSystem.getOctree() ?? undefined,
      groundY: GROUND_HEIGHT,
      getRewindPosition: (entityId: number, timeMs: number) => this.playerHistory.getPosition(entityId, timeMs),
      rewindTimeMs: shotServerTimeMs
    };

    const stepMs = FIXED_TIMESTEP * 1000;
    let remainingMs = lagMs;
    let currentTimeMs = shotServerTimeMs;

    while (remainingMs >= stepMs && projectileEntities.length > 0) {
      ctx.rewindTimeMs = currentTimeMs;
      const result = this.projectileSystem.tick(projectileEntities, killableEntities, ctx);

      if (result.hits.length > 0) {
        this.combatSystem.processProjectileHits(result.hits, killableEntities);
      }

      if (result.toDestroy.length > 0) {
        for (const id of result.toDestroy) {
          const buffer = encodeProjectileDestroy(Opcode.ProjectileDestroy, { entityId: id });
          this.connectionHandler.broadcast(this.getAllConnections(), buffer);
          this.world.destroyEntity(id);
        }

        for (let i = projectileEntities.length - 1; i >= 0; i--) {
          const entity = projectileEntities[i];
          if (result.toDestroy.includes(entity.id)) {
            projectileEntities.splice(i, 1);
          }
        }
      }

      currentTimeMs += stepMs;
      remainingMs -= stepMs;
    }
  }

  private broadcastTransforms(): void {
    this.transformBroadcastSystem.broadcast();
  }

  /**
   * Broadcast a low-frequency message to all connected clients.
   */
  private broadcastLow(opcode: Opcode, payload: any) {
    const connections = this.getAllConnections();
    for (const conn of connections) {
      this.connectionHandler.sendLow(conn, opcode, payload);
    }
  }

  getScene(): Scene {
    return this.scene;
  }

  getWorld(): World {
    return this.world;
  }

  dispose() {
    this.stopTicking();
    this.gameStartSystem.dispose();
    this.roundSystem.cancelCountdown();
    this.scene.dispose();
    this.engine.dispose();
    this.players.clear();
    this.connections.clear();
    this.cachedConnections = null;
  }
}
