import { Scene, NullEngine, MeshBuilder, PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core';
import { createNullEngine, createScene } from '../engine/setupNullEngine.js';
import { ConnectionState, ConnectionHandler } from '../network/ConnectionHandler.js';
import {
  Opcode,
  encodeTransform,
  encodeProjectileDestroy,
  FIXED_TIMESTEP,
  TransformData,
  InputData,
  World,
  Entity,
  COMP_PLAYER,
  COMP_HEALTH,
  COMP_PROJECTILE,
  COMP_COLLECTED,
  COMP_PHYSICS,
  COMP_SHOOTABLE,
  COMP_AMMO,
  COMP_WEAPON_TYPE,
  COMP_PICKUP_EFFECT,
  COMP_STAMINA,
  COMP_ACTIVE_BUFFS,
  COMP_ARMOR,
  COMP_HELMET,
  COMP_MATERIALS,
  COMP_BUILDING,
  COMP_LADDER_COLLIDER,
  COMP_STATS,
  TAG_KILLABLE,
  TAG_COLLECTABLE,
  TAG_PICKUP,
  TAG_LADDER,
  PlayerComponent,
  HealthComponent,
  StaminaComponent,
  ActiveBuffsComponent,
  ActiveBuff,
  ArmorComponent,
  HelmetComponent,
  MaterialsComponent,
  BuildingComponent,
  LadderColliderComponent,
  StatsComponent,
  ProjectileComponent,
  CollectedComponent,
  PhysicsComponent,
  ShootableComponent,
  AmmoComponent,
  WeaponTypeComponent,
  PickupEffectComponent,
  createCharacterState,
  stepCharacter,
  stepProjectile,
  stepCollectable,
  rayVsAABB,
  rayVsTriangleMesh,
  capsuleVsCapsule,
  PLAYER_MAX_HEALTH,
  PLAYER_HITBOX_HALF,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_HITBOX_CENTER_Y,
  PROJECTILE_LIFETIME,
  PROJECTILE_SPAWN_OFFSET,
  PROJECTILE_SUBSTEPS,
  PlayerInfo,
  EntityDamageMessage,
  EntityDeathMessage,
  ItemSpawnMessage,
  ItemUpdateMessage,
  BlockPlaceMessage,
  BlockRemoveMessage,
  BlockPlacedMessage,
  BlockRemovedMessage,
  BuildingInitialStateMessage,
  BuildingCreateMessage,
  BuildingCreatedMessage,
  BuildingTransformMessage,
  BuildingTransformedMessage,
  BuildingDestroyMessage,
  BuildingDestroyedMessage,
  LadderPlaceMessage,
  LadderSpawnedMessage,
  LadderDestroyMessage,
  LadderDestroyedMessage,
  ItemPickupMessage,
  ItemDropSoundMessage,
  TreeSpawnMessage,
  RockSpawnMessage,
  ExplosionSpawnMessage,
  StaminaUpdateMessage,
  BuffAppliedMessage,
  BuffExpiredMessage,
  ArmorUpdateMessage,
  HelmetUpdateMessage,
  MaterialsUpdateMessage,
  KillFeedMessage,
  PlayerScore,
  RoundStateMessage,
  ScoreUpdateMessage,
  ReloadStartedMessage,
  ProjectileSpawnData,
  VoxelGrid,
  rayVsVoxelGrid,
  createPistol,
  createSMG,
  createLMG,
  createShotgun,
  createSniper,
  createAssaultRifle,
  createDMR,
  createRocketLauncher,
  createHammer,
  createMedicPack,
  createLargeMedicPack,
  createApple,
  createPillBottle,
  createKevlar,
  createHelmet,
  createRNG,
  generateTreeVariations,
  placeTreeInstances,
  PROJECTILE_LIFETIME_SHOTGUN,
  PROJECTILE_COLLISION_INTERVAL,
  type TreeInstance,
  generateRockVariations,
  placeRockInstances,
  type RockInstance,
  type RockColliderMesh,
  generateBushVariations,
  placeBushInstances,
  type BushInstance,
  type BushVariation,
  type RockTransform,
  Octree,
  type OctreeEntry,
  WATER,
  STAMINA
} from '@spong/shared';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh.js';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform.js';
import { ServerWaterLevelProvider } from '../WaterLevelProvider.js';

export interface Player {
  id: string;
  connectionId: string;
  entityId: number;
  color: string;
}

type BlockColliderEntry = {
  gridX: number;
  gridY: number;
  gridZ: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

// ============================================================================
// Entity Spawn System
// ============================================================================

type EntityFactory = (entity: Entity) => Entity;
type ItemType = 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'sniper' | 'assault' | 'dmr' | 'rocket' | 'hammer' | 
                'medic_pack' | 'large_medic_pack' | 'apple' | 'pill_bottle' | 'kevlar' | 'helmet';

interface EntitySpawnConfig {
  factory: EntityFactory;
  name: string;
  size?: number;
  yOffset?: number;
  yOffsetBase?: number;
  validateUnderwater?: boolean;
  onGround?: boolean;
  broadcastSpawn?: boolean;
}

const ENTITY_CONFIGS: Record<ItemType, EntitySpawnConfig> = {
  pistol: { factory: createPistol, name: 'Pistol', yOffset: 0.5, validateUnderwater: true, onGround: true },
  smg: { factory: createSMG, name: 'SMG', yOffset: 0.5, validateUnderwater: true, onGround: true },
  lmg: { factory: createLMG, name: 'LMG', yOffset: 1.0, yOffsetBase: 0, validateUnderwater: true, onGround: false },
  shotgun: { factory: createShotgun, name: 'Shotgun', yOffset: 0.5, validateUnderwater: true, onGround: true },
  sniper: { factory: createSniper, name: 'Sniper', yOffset: 0.5, validateUnderwater: true, onGround: true },
  assault: { factory: createAssaultRifle, name: 'Assault Rifle', yOffset: 0.5, validateUnderwater: true, onGround: true },
  dmr: { factory: createDMR, name: 'DMR', yOffset: 0.5, validateUnderwater: true, onGround: true },
  rocket: { factory: createRocketLauncher, name: 'Rocket Launcher', yOffset: 0.5, validateUnderwater: true, onGround: true },
  hammer: { factory: createHammer, name: 'Hammer', yOffset: 0.5, validateUnderwater: false, onGround: true, broadcastSpawn: true },
  medic_pack: { factory: createMedicPack, name: 'Medic Pack', yOffset: 0.5, validateUnderwater: false, onGround: true },
  large_medic_pack: { factory: createLargeMedicPack, name: 'Large Medic Pack', yOffset: 0.5, validateUnderwater: false, onGround: true },
  apple: { factory: createApple, name: 'Apple', yOffset: 0.5, validateUnderwater: false, onGround: true },
  pill_bottle: { factory: createPillBottle, name: 'Pill Bottle', yOffset: 0.5, validateUnderwater: false, onGround: true },
  kevlar: { factory: createKevlar, name: 'Kevlar', yOffset: 0.5, validateUnderwater: true, onGround: true },
  helmet: { factory: createHelmet, name: 'Helmet', yOffset: 0.5, validateUnderwater: true, onGround: true }
};

export class Room {
  readonly id: string;
  private engine!: NullEngine;
  private scene!: Scene;
  private world = new World();
  private players = new Map<string, Player>();
  private connections = new Map<string, ConnectionState>();
  private tickInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private connectionHandler: ConnectionHandler;
  private isInitialized = false;
  private voxelGrid?: VoxelGrid;
  private waterLevelProvider?: ServerWaterLevelProvider;
  private treeInstances: TreeInstance[] = [];
  private treeColliderMeshes: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> = [];
  private rockInstances: RockInstance[] = [];
  private rockColliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }> = [];
  private bushInstances: BushInstance[] = [];
  private octree!: any; // Octree for broad-phase culling
  private buildingEntities = new Map<number, Entity>(); // Map of building entities (key: buildingEntityId)
  private blockPhysics = new Map<string, any>(); // Physics bodies for blocks (key: "buildingId_x_y_z")
  private blockColliderCache = new Map<number, Map<string, BlockColliderEntry>>();
  private pickupGridCellSize = 2.0;
  private pickupGrid = new Map<string, Set<number>>();
  private pickupGridCells = new Map<number, string>();
  private ladderEntities = new Map<number, Entity>(); // Map of ladder entities (key: ladderEntityId)
  private ownerId: string | null = null;
  private lobbyConfig: { seed?: string; pistolCount?: number; headshotDmg?: number; normalDmg?: number } = {};

  // Game start state
  private gameStartState: {
    phase: 'lobby' | 'countdown' | 'loading' | 'playing';
    countdownTimer?: NodeJS.Timeout;
    countdownSeconds: number;
    loadingTimer?: NodeJS.Timeout;
    loadingSeconds: number;
    readyPlayers: Set<string>;
    seed?: string;
  } = {
    phase: 'lobby',
    countdownSeconds: 0,
    loadingSeconds: 0,
    readyPlayers: new Set()
  };

  // Round system state
  private roundState: {
    phase: 'waiting' | 'countdown' | 'active' | 'ended';
    scores: Map<number, PlayerScore>;
    countdownTimer?: NodeJS.Timeout;
    countdownSeconds: number;
    roundStartTime?: number;
    config: {
      scoreLimit: number;
      timeLimit?: number;
      minPlayers: number;
    };
  } = {
    phase: 'waiting',
    scores: new Map(),
    countdownSeconds: 0,
    config: {
      scoreLimit: 20,
      timeLimit: 300,
      minPlayers: 2,
    },
  };

  // Physics at 60Hz, broadcast at 30Hz (AAA standard - smooth with interpolation)
  private physicsRate = 60;
  private broadcastRate = 30;

  // Cache last broadcast values to avoid unnecessary network traffic
  private lastBroadcastCache = new Map<number, {
    stamina?: number;
    isExhausted?: boolean;
    armor?: number;
    hasHelmet?: boolean;
    helmetHealth?: number;
  }>();

  constructor(id: string, connectionHandler: ConnectionHandler) {
    this.id = id;
    this.connectionHandler = connectionHandler;
    console.log(`Room constructing: ${id}`);
  }

  // ============================================================================
  // Generic Entity Spawn Functions
  // ============================================================================

  /**
   * Generic spawn function for entities on terrain.
   * Handles terrain sampling, underwater validation, physics setup, and optional broadcasting.
   * @returns true if spawned successfully, false if rejected (underwater)
   */
  private spawnEntityOnTerrain(itemType: ItemType, worldX: number, worldZ: number): boolean {
    const config = ENTITY_CONFIGS[itemType];
    
    let surfaceY = 0;
    if (this.voxelGrid) {
      surfaceY = this.voxelGrid.getWorldSurfaceY(worldX, worldZ);
      if (config.yOffsetBase !== undefined) {
        surfaceY = surfaceY + config.yOffsetBase;
      }
    }
    
    const spawnY = surfaceY + (config.yOffset ?? 0.5);

    if (config.validateUnderwater && this.waterLevelProvider && 
        !this.waterLevelProvider.isValidSpawnPosition(worldX, spawnY, worldZ)) {
      return false;
    }

    const entity = this.world.createEntity();
    config.factory(entity);

    const physics: PhysicsComponent = {
      posX: worldX,
      posY: spawnY,
      posZ: worldZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: config.size ?? 0.5,
      onGround: config.onGround ?? true
    };

    entity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(entity.id, worldX, worldZ);

    if (config.broadcastSpawn) {
      const weaponType = entity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      const spawnMsg: ItemSpawnMessage = {
        entityId: entity.id,
        itemType: weaponType?.type || itemType,
        posX: worldX,
        posY: spawnY,
        posZ: worldZ
      };
      this.broadcastLow(Opcode.ItemSpawn, spawnMsg);
    }

    console.log(`Spawned ${config.name} at (${worldX.toFixed(1)}, ${spawnY.toFixed(1)}, ${worldZ.toFixed(1)}) entity ${entity.id}`);
    return true;
  }

  /**
   * Generic spawn function for entities at fixed positions (shooting range).
   * @param itemType The type of entity to spawn
   * @param worldX World X coordinate
   * @param worldY World Y coordinate (fixed, not terrain-sampled)
   * @param worldZ World Z coordinate
   */
  private spawnEntityAtPosition(itemType: ItemType, worldX: number, worldY: number, worldZ: number): void {
    const config = ENTITY_CONFIGS[itemType];
    
    const entity = this.world.createEntity();
    config.factory(entity);

    const physics: PhysicsComponent = {
      posX: worldX,
      posY: worldY,
      posZ: worldZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: config.size ?? 0.5,
      onGround: true
    };

    entity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(entity.id, worldX, worldZ);

    const weaponType = entity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    const spawnMsg: ItemSpawnMessage = {
      entityId: entity.id,
      itemType: weaponType?.type || itemType,
      posX: worldX,
      posY: worldY,
      posZ: worldZ
    };
    this.broadcastLow(Opcode.ItemSpawn, spawnMsg);

    console.log(`Spawned ${config.name} at (${worldX.toFixed(1)}, ${worldY.toFixed(1)}, ${worldZ.toFixed(1)}) entity ${entity.id}`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.engine = createNullEngine();
    this.scene = await createScene(this.engine);

    console.log(`[Room] ========================================`);
    console.log(`[Room] Initializing room: ${this.id}`);
    console.log(`[Room] LobbyConfig:`, this.lobbyConfig);

    // Check if this is a level room (format: "level_<seed>")
    if (this.id.startsWith('level_')) {
      const seed = this.id.substring(6); // Extract seed after "level_"
      console.log(`[Room] ✓ IS A LEVEL ROOM`);
      console.log(`[Room] Generating level with seed: ${seed}`);
      this.voxelGrid = new VoxelGrid();
      this.voxelGrid.generateFromNoise(seed);
      console.log(`[Room] Generated ${this.voxelGrid.getSolidCount()} solid voxels`);

      // Create water level provider for physics
      this.waterLevelProvider = new ServerWaterLevelProvider(this.voxelGrid);
      console.log(`[Room] Water level provider initialized`);

      // Cell occupancy tracker (shared between pistols and trees)
      const occupiedCells = new Set<string>();

      // Get disable flags from lobby config
      const disableSpawns = (this.lobbyConfig?.disableSpawns || []) as string[];
      console.log('[Room] Disable spawn flags:', disableSpawns);

      // Spawn pistols on the terrain during level generation
      if (!disableSpawns.includes('items')) {
        this.spawnLevelPistols(seed, occupiedCells, this.lobbyConfig);
      } else {
        console.log('[Room] Items spawn disabled');
      }

      // Generate and place rocks across the level (after items, before trees)
      if (!disableSpawns.includes('rocks')) {
        this.spawnLevelRocks(seed, occupiedCells);
      } else {
        console.log('[Room] Rocks spawn disabled');
      }

      // Generate and place trees across the level
      if (!disableSpawns.includes('trees')) {
        this.spawnLevelTrees(seed, occupiedCells);
      } else {
        console.log('[Room] Trees spawn disabled');
      }
      
      // Generate and place bushes across the level (client-side only)
      console.log('[Room] Checking if bushes are disabled:', disableSpawns.includes('bushes'));
      if (!disableSpawns.includes('bushes')) {
        console.log('[Room] ✓ Spawning bushes...');
        this.spawnLevelBushes(seed, occupiedCells);
        console.log('[Room] ✓ Bush spawn complete. Total bushInstances:', this.bushInstances.length);
      } else {
        console.log('[Room] ✗ Bushes spawn disabled');
      }
    } else {
      console.log(`[Room] Not a level room (id: ${this.id}) - skipping terrain generation`);
    }

    // Check if this is a shooting range room (format: "shooting_range_<id>")
    if (this.id.startsWith('shooting_range_')) {
      console.log(`Initializing shooting range: ${this.id}`);
      
      // Spawn weapons at fixed positions
      const weaponSpacing = 2;
      const baseZ = 5;
      const baseY = 0.5;
      
      // Pistol at x=-6 (more spaced out)
      this.spawnWeaponAtPosition('pistol', -6, baseY, baseZ);
      
      // SMG at x=-4.5
      this.spawnWeaponAtPosition('smg', -4.5, baseY, baseZ);
      
      // Assault Rifle at x=-3
      this.spawnWeaponAtPosition('assault', -3 * weaponSpacing * 0.5, baseY, baseZ);
      
      // DMR at x=-1
      this.spawnWeaponAtPosition('dmr', -1 * weaponSpacing * 0.5, baseY, baseZ);
      
      // LMG at x=1
      this.spawnWeaponAtPosition('lmg', 1 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Shotgun at x=3
      this.spawnWeaponAtPosition('shotgun', 3 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Sniper at x=5
      this.spawnWeaponAtPosition('sniper', 5 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Rocket Launcher at x=7
      this.spawnWeaponAtPosition('rocket', 7 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Small Medic Pack at x=9
      this.spawnPickupAtPosition('medic_pack', 9 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Large Medic Pack at x=11
      this.spawnPickupAtPosition('large_medic_pack', 11 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Apple at x=13
      this.spawnPickupAtPosition('apple', 13 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Pill Bottle at x=15
      this.spawnPickupAtPosition('pill_bottle', 15 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Kevlar at x=17
      this.spawnPickupAtPosition('kevlar', 17 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Helmet at x=19
      this.spawnPickupAtPosition('helmet', 19 * weaponSpacing * 0.5, baseY, baseZ);
      
      // Hammer at x=21
      this.spawnWeaponAtPosition('hammer', 21 * weaponSpacing * 0.5, baseY, baseZ);
      
      console.log(`Spawned 8 weapons and 6 pickups in shooting range ${this.id}`);
    }

    // Check if this is a builder room (format: "builder_room_<id>")
    if (this.id.startsWith('builder_room_')) {
      console.log(`Initializing builder room: ${this.id}`);
      // Spawn a hammer at the origin for building
      this.spawnWeaponAtPosition('hammer', 0, 0.5, 5);
      
      // Spawn a test tree at (10, 0, 10)
      const rng = createRNG(this.id + '_tree');
      const treeVariations = generateTreeVariations(this.id + '_tree', 32);
      const treeVariationId = Math.floor(rng() * treeVariations.length);
      this.treeInstances.push({
        variationId: treeVariationId,
        worldX: 10,
        worldY: 0,
        worldZ: 10,
        rotationY: 0
      });
      const treeVariation = treeVariations[treeVariationId];
      this.treeColliderMeshes.push({
        mesh: treeVariation.colliderMesh,
        transform: {
          posX: 10,
          posY: 0.4, // Offset up to match rendering
          posZ: 10,
          rotY: 0,
          scale: 0.4
        }
      });
      
      // Spawn a test rock at (-10, 0, 10)
      const rockVariations = generateRockVariations(this.id + '_rock', 3, 9);
      const rockVariationId = Math.floor(rng() * rockVariations.length);
      this.rockInstances.push({
        variationId: rockVariationId,
        worldX: -10,
        worldY: 0,
        worldZ: 10,
        rotationY: 0,
        scale: 1.0
      });
      const rockVariation = rockVariations[rockVariationId];
      this.rockColliderMeshes.push({
        mesh: rockVariation.colliderMesh,
        transform: {
          posX: -10,
          posY: 0,
          posZ: 10,
          rotY: 0,
          scale: 1.0 * 0.5 // ROCK_SCALE = 0.5
        }
      });
      
      // Build octree for builder room
      this.buildOctree();
      console.log('Spawned hammer, tree, and rock in builder room with octree');
    }

    // Check if this is a rock editor room (format: "rock_editor_<id>")
    if (this.id.startsWith('rock_editor_')) {
      console.log(`Initializing rock editor: ${this.id}`);
      // Simple flat ground for collision testing
      // No items spawned - this is a rock collision testing environment
      console.log('Rock editor initialized with flat ground');
    }

    // Check if this is a tree editor room (format: "tree_editor_<id>")
    if (this.id.startsWith('tree_editor_')) {
      console.log(`Initializing tree editor: ${this.id}`);
      // Simple flat ground for tree parameter debugging
      // No items spawned - this is a tree visualization environment
      console.log('Tree editor initialized with flat ground');
    }

    this.isInitialized = true;
    console.log(`Room initialized: ${this.id}`);
  }

  addPlayer(conn: ConnectionState): Player {
    // Create ECS entity with Player, Health, and Killable
    const entity = this.world.createEntity();
    const playerComp: PlayerComponent = {
      connectionId: conn.id,
      state: createCharacterState(),
      input: { forward: 0, right: 0, cameraYaw: 0, jump: false, sprint: false },
      lastProcessedInput: 0,
      lastShootTime: 0,
      headPitch: 0,
      inputQueue: []
    };
    const healthComp: HealthComponent = {
      current: PLAYER_MAX_HEALTH,
      max: PLAYER_MAX_HEALTH
    };
    const staminaComp: StaminaComponent = {
      current: 100,
      max: 100,
      isExhausted: false,
      exhaustedAt: 0
    };
    const activeBuffsComp: ActiveBuffsComponent = {
      buffs: []
    };
    const armorComp: ArmorComponent = {
      current: 0,
      max: 50
    };
    const helmetComp: HelmetComponent = {
      equipped: false,
      health: 0,
      maxHealth: 20
    };
    const materialsComp: MaterialsComponent = {
      current: 500,
      max: 500
    };

    // Add collected component (empty for now)
    const collectedComp: CollectedComponent = {
      items: []
    };

    const statsComp: StatsComponent = {
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      shotsFired: 0,
      shotsHit: 0
    };

    entity
      .add(COMP_PLAYER, playerComp)
      .add(COMP_HEALTH, healthComp)
      .add(COMP_STAMINA, staminaComp)
      .add(COMP_ACTIVE_BUFFS, activeBuffsComp)
      .add(COMP_ARMOR, armorComp)
      .add(COMP_HELMET, helmetComp)
      .add(COMP_MATERIALS, materialsComp)
      .add(COMP_COLLECTED, collectedComp)
      .add(COMP_STATS, statsComp)
      .tag(TAG_KILLABLE);

    const isFirstPlayer = this.players.size === 0;

    // Generate vibrant color for player based on index
    const playerIndex = this.players.size;
    const hue = (playerIndex * 137.5) % 360;
    const saturation = 0.8 + Math.random() * 0.2;
    const lightness = 0.5 + Math.random() * 0.2;
    const color = this.hslToHex(hue, saturation, lightness);

    const player: Player = {
      id: conn.id,
      connectionId: conn.id,
      entityId: entity.id,
      color
    };

    this.players.set(conn.id, player);
    this.connections.set(conn.id, conn);

    conn.roomId = this.id;
    conn.entityId = entity.id;

    // Set owner to first player
    if (isFirstPlayer) {
      this.ownerId = conn.id;
    }

    console.log(`Player ${conn.id} joined room ${this.id} with entity ${entity.id} (color: ${color}), phase: ${this.gameStartState.phase}`);

    if (isFirstPlayer) {
      this.startTicking();
    }
    
    // If room is already in loading phase, send current ready update and register as ready
    if (this.gameStartState.phase === 'loading') {
      console.log(`[Room] Player ${conn.id} joined during loading phase, sending ready update`);
      setTimeout(() => {
        this.broadcastReadyUpdate();
      }, 200);
    }
    
    // If room is already playing, send GameBegin immediately so late joiner can spawn
    if (this.gameStartState.phase === 'playing') {
      console.log(`[Room] Player ${conn.id} joined during playing phase, sending GameBegin immediately`);
      setTimeout(() => {
        this.connectionHandler.sendLow(conn, Opcode.GameBegin, {});
      }, 200);
    }

    // Send all existing item positions to the newly joined player
    // (items are spawned at level init, not per-player)
    setTimeout(() => {
      const existingItems = this.world.query(COMP_PHYSICS);
      for (const item of existingItems) {
        // Skip player entities (they have Player component)
        if (item.get(COMP_PLAYER)) continue;
        
        const physics = item.get<PhysicsComponent>(COMP_PHYSICS)!;
        
        // Determine item type: check for pickup effect first, then weapon type
        const pickupEffect = item.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
        const weaponType = item.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
        
        let itemType: string;
        if (pickupEffect) {
          // Determine pickup type based on effect type and value
          if (pickupEffect.type === 'buff' && pickupEffect.buffType === 'infinite_stamina') {
            itemType = 'pill_bottle';
          } else if (pickupEffect.type === 'armor_pickup') {
            itemType = 'kevlar';
          } else if (pickupEffect.type === 'helmet_pickup') {
            itemType = 'helmet';
          } else if (pickupEffect.type === 'stamina') {
            itemType = 'apple';
          } else if (pickupEffect.type === 'health' && pickupEffect.value >= 100) {
            itemType = 'large_medic_pack';
          } else if (pickupEffect.type === 'health') {
            itemType = 'medic_pack';
          } else {
            itemType = 'medic_pack'; // Default fallback
          }
        } else {
          itemType = weaponType?.type || 'pistol';
        }
        
        const spawnMsg: ItemSpawnMessage = {
          entityId: item.id,
          itemType,
          posX: physics.posX,
          posY: physics.posY,
          posZ: physics.posZ
        };
        this.connectionHandler.sendLow(conn, Opcode.ItemSpawn, spawnMsg);
      }
      console.log(`Sent ${existingItems.length} existing items to player ${conn.id}`);

      // Send all tree instances to the newly joined player
      if (this.treeInstances.length > 0) {
        const treeMsg: TreeSpawnMessage = {
          trees: this.treeInstances.map(t => ({
            variationId: t.variationId,
            posX: t.worldX,
            posY: t.worldY,
            posZ: t.worldZ,
            rotationY: t.rotationY
          }))
        };
        this.connectionHandler.sendLow(conn, Opcode.TreeSpawn, treeMsg);
        console.log(`Sent ${this.treeInstances.length} trees to player ${conn.id}`);
      }

      // Send all rock instances to the newly joined player
      if (this.rockInstances.length > 0) {
        const rockMsg: RockSpawnMessage = {
          rocks: this.rockInstances.map(r => ({
            variationId: r.variationId,
            posX: r.worldX,
            posY: r.worldY,
            posZ: r.worldZ,
            rotationY: r.rotationY,
            scale: r.scale
          }))
        };
        this.connectionHandler.sendLow(conn, Opcode.RockSpawn, rockMsg);
        console.log(`Sent ${this.rockInstances.length} rocks to player ${conn.id}`);
      }

      // Send all bush instances to the newly joined player
      console.log(`[Room] Checking bushes to send: ${this.bushInstances.length} instances`);
      if (this.bushInstances.length > 0) {
        const bushMsg = {
          bushes: this.bushInstances.map(b => ({
            variationId: b.variationId,
            posX: b.worldX,
            posY: b.worldY,
            posZ: b.worldZ
          }))
        };
        this.connectionHandler.sendLow(conn, Opcode.BushSpawn, bushMsg);
        console.log(`[Room] ✓ Sent ${this.bushInstances.length} bushes to player ${conn.id}`);
      } else {
        console.log(`[Room] ✗ No bushes to send (bushInstances is empty)`);
      }

      // Send existing players' armor and helmet state to the newly joined player
      const playerEntities = this.world.query(COMP_PLAYER);
      for (const playerEntity of playerEntities) {
        const armor = playerEntity.get<ArmorComponent>(COMP_ARMOR);
        if (armor && armor.current > 0) {
          const armorMsg: ArmorUpdateMessage = {
            entityId: playerEntity.id,
            armor: armor.current
          };
          this.connectionHandler.sendLow(conn, Opcode.ArmorUpdate, armorMsg);
        }

        const helmet = playerEntity.get<HelmetComponent>(COMP_HELMET);
        if (helmet && helmet.equipped) {
          const helmetMsg: HelmetUpdateMessage = {
            entityId: playerEntity.id,
            hasHelmet: helmet.equipped,
            helmetHealth: helmet.health
          };
          this.connectionHandler.sendLow(conn, Opcode.HelmetUpdate, helmetMsg);
        }

        const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
        if (materials) {
          const materialsMsg: MaterialsUpdateMessage = {
            entityId: playerEntity.id,
            materials: materials.current
          };
          this.connectionHandler.sendLow(conn, Opcode.MaterialsUpdate, materialsMsg);
        }
      }

      // Send all existing building entities to the newly joined player
      for (const [buildingEntityId, buildingEntity] of this.buildingEntities) {
        const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
        if (building) {
          const blocks: Array<{ gridX: number; gridY: number; gridZ: number; colorIndex: number }> = [];
          
          // Iterate through voxelData to find all placed blocks
          for (let x = 0; x < building.gridSize; x++) {
            for (let y = 0; y < building.gridSize; y++) {
              for (let z = 0; z < building.gridSize; z++) {
                const index = x + y * building.gridSize + z * building.gridSize * building.gridSize;
                const voxelValue = building.voxelData[index];
                if (voxelValue !== 0) {
                  blocks.push({
                    gridX: x,
                    gridY: y,
                    gridZ: z,
                    colorIndex: voxelValue - 1
                  });
                }
              }
            }
          }

          const buildingMsg: BuildingInitialStateMessage = {
            buildingEntityId,
            ownerEntityId: building.ownerEntityId,
            gridPositionX: building.gridPositionX,
            gridPositionY: building.gridPositionY,
            gridPositionZ: building.gridPositionZ,
            gridRotationY: building.gridRotationY,
            gridSize: building.gridSize,
            blocks
          };
          this.connectionHandler.sendLow(conn, Opcode.BuildingInitialState, buildingMsg);
          console.log(`Sent ${blocks.length} building blocks (entity ${buildingEntityId}) to player ${conn.id}`);
        }
      }

    }, 100);

    // Send current round state to newly joined player
    setTimeout(() => {
      this.connectionHandler.sendLow(conn, Opcode.RoundState, this.getRoundStateMessage());
    }, 1100);

    // Check if we now have enough players to start a round
    this.checkRoundStart();

    return player;
  }

  /**
   * Find a valid spawn position (not underwater, on solid ground).
   * Tries origin first, then searches in expanding radius.
   * @returns {x, y, z} spawn position
   */
  findValidSpawnPosition(): { x: number; y: number; z: number } {
    // Try origin first
    if (this.waterLevelProvider) {
      if (this.waterLevelProvider.isValidSpawnPosition(0, 0, 0)) {
        return { x: 0, y: 0, z: 0 };
      }

      // Search in expanding radius
      const maxAttempts = 100;
      const maxRadius = 50;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Get terrain height at this position
        let y = 0;
        if (this.voxelGrid) {
          y = this.voxelGrid.getWorldSurfaceY(x, z) + 0.5;
        }
        
        // Check if valid (not underwater)
        if (this.waterLevelProvider.isValidSpawnPosition(x, y, z)) {
          return { x, y, z };
        }
      }
      
      console.warn('[Room] Could not find valid spawn position after 100 attempts, using origin');
    }
    
    // Fallback to origin
    return { x: 0, y: 0, z: 0 };
  }

  spawnPistolOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('pistol', worldX, worldZ);
  }

  spawnWeaponAtPosition(weaponType: 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'sniper' | 'assault' | 'rocket' | 'hammer', worldX: number, worldY: number, worldZ: number): void {
    this.spawnEntityAtPosition(weaponType, worldX, worldY, worldZ);
  }

  spawnPickupAtPosition(pickupType: 'medic_pack' | 'large_medic_pack' | 'apple' | 'pill_bottle' | 'kevlar' | 'helmet', worldX: number, worldY: number, worldZ: number): void {
    this.spawnEntityAtPosition(pickupType, worldX, worldY, worldZ);
  }

  spawnHammerOnTerrain(worldX: number, worldZ: number): void {
    this.spawnEntityOnTerrain('hammer', worldX, worldZ);
  }

  spawnSMGOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('smg', worldX, worldZ);
  }

  spawnLMGOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('lmg', worldX, worldZ);
  }

  spawnShotgunOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('shotgun', worldX, worldZ);
  }

  spawnAssaultOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('assault', worldX, worldZ);
  }

  spawnSniperOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('sniper', worldX, worldZ);
  }

  spawnRocketOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('rocket', worldX, worldZ);
  }

  spawnMedicPackOnTerrain(worldX: number, worldZ: number): void {
    this.spawnEntityOnTerrain('medic_pack', worldX, worldZ);
  }

  spawnLargeMedicPackOnTerrain(worldX: number, worldZ: number): void {
    this.spawnEntityOnTerrain('large_medic_pack', worldX, worldZ);
  }

  spawnAppleOnTerrain(worldX: number, worldZ: number): void {
    this.spawnEntityOnTerrain('apple', worldX, worldZ);
  }

  spawnPillBottleOnTerrain(worldX: number, worldZ: number): void {
    this.spawnEntityOnTerrain('pill_bottle', worldX, worldZ);
  }

  spawnKevlarOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('kevlar', worldX, worldZ);
  }

  spawnHelmetOnTerrain(worldX: number, worldZ: number): boolean {
    return this.spawnEntityOnTerrain('helmet', worldX, worldZ);
  }

  /**
   * Spawn pistols scattered across the level during initialization.
   * Deterministic based on seed so every client sees the same layout.
   */
  private spawnLevelPistols(seed: string, occupiedCells: Set<string>, config: { pistolCount?: number }): void {
    if (!this.voxelGrid) return;

    const rng = createRNG(seed + '_items');
    const PISTOL_COUNT = config.pistolCount ?? 30;
    const SMG_COUNT = 12;
    const LMG_COUNT = 6;
    const SHOTGUN_COUNT = 8;
    const CELL_SIZE = 2.0; // Match terrain voxel size

    // Terrain world bounds: roughly -100 to 100 in X and Z
    const HALF_EXTENT = 90; // Stay slightly inside the edges

    // Spawn one pistol 3 units in front of player spawn (0, 0, 0)
    let spawned = this.spawnPistolOnTerrain(3, 0);
    if (spawned) {
      const spawnCellX = Math.floor((3 + 100) / CELL_SIZE);
      const spawnCellZ = Math.floor((0 + 100) / CELL_SIZE);
      occupiedCells.add(`${spawnCellX},${spawnCellZ}`);
    }

    // Spawn the rest scattered around the map
    let pistolsSpawned = spawned ? 1 : 0;
    const maxAttempts = PISTOL_COUNT * 3; // Allow some retries for underwater positions
    for (let attempt = 0; attempt < maxAttempts && pistolsSpawned < PISTOL_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnPistolOnTerrain(wx, wz)) {
        pistolsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${pistolsSpawned} pistols across the level (${PISTOL_COUNT - pistolsSpawned} rejected underwater)`);

    // Spawn SMGs scattered around the map
    let smgsSpawned = 0;
    const maxSMGAttempts = SMG_COUNT * 3;
    for (let attempt = 0; attempt < maxSMGAttempts && smgsSpawned < SMG_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnSMGOnTerrain(wx, wz)) {
        smgsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${smgsSpawned} SMGs across the level (${SMG_COUNT - smgsSpawned} rejected underwater)`);

    // Spawn LMGs scattered around the map
    let lmgsSpawned = 0;
    const maxLMGAttempts = LMG_COUNT * 3;
    for (let attempt = 0; attempt < maxLMGAttempts && lmgsSpawned < LMG_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnLMGOnTerrain(wx, wz)) {
        lmgsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${lmgsSpawned} LMGs across the level (${LMG_COUNT - lmgsSpawned} rejected underwater)`);

    // Spawn Shotguns scattered around the map
    let shotgunsSpawned = 0;
    const maxShotgunAttempts = SHOTGUN_COUNT * 3;
    for (let attempt = 0; attempt < maxShotgunAttempts && shotgunsSpawned < SHOTGUN_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnShotgunOnTerrain(wx, wz)) {
        shotgunsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${shotgunsSpawned} Shotguns across the level (${SHOTGUN_COUNT - shotgunsSpawned} rejected underwater)`);

    // Spawn Assault Rifles scattered around the map
    const ASSAULT_COUNT = 8;
    let assaultsSpawned = 0;
    const maxAssaultAttempts = ASSAULT_COUNT * 3;
    for (let attempt = 0; attempt < maxAssaultAttempts && assaultsSpawned < ASSAULT_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnAssaultOnTerrain(wx, wz)) {
        assaultsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${assaultsSpawned} Assault Rifles across the level (${ASSAULT_COUNT - assaultsSpawned} rejected underwater)`);

    // Spawn Snipers scattered around the map
    const SNIPER_COUNT = 4;
    let snipersSpawned = 0;
    const maxSniperAttempts = SNIPER_COUNT * 3;
    for (let attempt = 0; attempt < maxSniperAttempts && snipersSpawned < SNIPER_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnSniperOnTerrain(wx, wz)) {
        snipersSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${snipersSpawned} Snipers across the level (${SNIPER_COUNT - snipersSpawned} rejected underwater)`);

    // Spawn Rocket Launchers scattered around the map
    const ROCKET_COUNT = 3;
    let rocketsSpawned = 0;
    const maxRocketAttempts = ROCKET_COUNT * 3;
    for (let attempt = 0; attempt < maxRocketAttempts && rocketsSpawned < ROCKET_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnRocketOnTerrain(wx, wz)) {
        rocketsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${rocketsSpawned} Rocket Launchers across the level (${ROCKET_COUNT - rocketsSpawned} rejected underwater)`);

    // Spawn Medic Packs scattered around the map
    const MEDIC_PACK_COUNT = 15;
    for (let i = 0; i < MEDIC_PACK_COUNT; i++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      this.spawnMedicPackOnTerrain(wx, wz);
      
      const cellX = Math.floor((wx + 100) / CELL_SIZE);
      const cellZ = Math.floor((wz + 100) / CELL_SIZE);
      occupiedCells.add(`${cellX},${cellZ}`);
    }

    console.log(`Spawned ${MEDIC_PACK_COUNT} Medic Packs across the level`);

    // Spawn Large Medic Packs scattered around the map
    const LARGE_MEDIC_PACK_COUNT = 8;
    for (let i = 0; i < LARGE_MEDIC_PACK_COUNT; i++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      this.spawnLargeMedicPackOnTerrain(wx, wz);
      
      const cellX = Math.floor((wx + 100) / CELL_SIZE);
      const cellZ = Math.floor((wz + 100) / CELL_SIZE);
      occupiedCells.add(`${cellX},${cellZ}`);
    }

    console.log(`Spawned ${LARGE_MEDIC_PACK_COUNT} Large Medic Packs across the level`);

    // Spawn Apples scattered around the map
    const APPLE_COUNT = 20;
    for (let i = 0; i < APPLE_COUNT; i++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      this.spawnAppleOnTerrain(wx, wz);
      
      const cellX = Math.floor((wx + 100) / CELL_SIZE);
      const cellZ = Math.floor((wz + 100) / CELL_SIZE);
      occupiedCells.add(`${cellX},${cellZ}`);
    }

    console.log(`Spawned ${APPLE_COUNT} Apples across the level`);

    // Spawn Pill Bottles scattered around the map
    const PILL_BOTTLE_COUNT = 5;
    for (let i = 0; i < PILL_BOTTLE_COUNT; i++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      this.spawnPillBottleOnTerrain(wx, wz);
      
      const cellX = Math.floor((wx + 100) / CELL_SIZE);
      const cellZ = Math.floor((wz + 100) / CELL_SIZE);
      occupiedCells.add(`${cellX},${cellZ}`);
    }

    console.log(`Spawned ${PILL_BOTTLE_COUNT} Pill Bottles across the level`);

    // Spawn Kevlar scattered around the map
    const KEVLAR_COUNT = 10;
    let kevlarsSpawned = 0;
    const maxKevlarAttempts = KEVLAR_COUNT * 3;
    for (let attempt = 0; attempt < maxKevlarAttempts && kevlarsSpawned < KEVLAR_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnKevlarOnTerrain(wx, wz)) {
        kevlarsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${kevlarsSpawned} Kevlar across the level (${KEVLAR_COUNT - kevlarsSpawned} rejected underwater)`);

    // Spawn Helmets scattered around the map
    const HELMET_COUNT = 10;
    let helmetsSpawned = 0;
    const maxHelmetAttempts = HELMET_COUNT * 3;
    for (let attempt = 0; attempt < maxHelmetAttempts && helmetsSpawned < HELMET_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      
      if (this.spawnHelmetOnTerrain(wx, wz)) {
        helmetsSpawned++;
        const cellX = Math.floor((wx + 100) / CELL_SIZE);
        const cellZ = Math.floor((wz + 100) / CELL_SIZE);
        occupiedCells.add(`${cellX},${cellZ}`);
      }
    }

    console.log(`Spawned ${helmetsSpawned} Helmets across the level (${HELMET_COUNT - helmetsSpawned} rejected underwater)`);
  }

  /**
   * Generate rock variations and place instances across the level.
   * Rocks are static decorations with collision.
   * Rocks only avoid items, can overlap trees and other rocks.
   */
  private spawnLevelRocks(seed: string, occupiedCells: Set<string>): void {
    if (!this.voxelGrid) return;

    console.log('Generating rock variations...');
    const variations = generateRockVariations(seed, 5, 9); // gridResolution = 9
    
    // Place rock instances across the level
    const targetCount = 300;
    this.rockInstances = placeRockInstances(
      seed,
      variations.length,
      targetCount,
      (worldX: number, worldZ: number) => this.voxelGrid!.getWorldSurfaceY(worldX, worldZ),
      occupiedCells
    );

    // Create collision meshes for all rocks
    // Store mesh + transform for each instance (mesh collider data in local space)
    this.rockColliderMeshes = [];
    for (const instance of this.rockInstances) {
      const variation = variations[instance.variationId];
      const ROCK_SCALE = 0.5; // Match client constant
      
      this.rockColliderMeshes.push({
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY,
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: instance.scale * ROCK_SCALE
        }
      });
    }

    let totalTris = 0;
    for (const data of this.rockColliderMeshes) {
      totalTris += data.mesh.triangleCount;
    }
    console.log(`Spawned ${this.rockInstances.length} rocks with ${totalTris} total collision triangles`);
  }

  /**
   * Generate tree variations and place instances across the level.
   * Trees are static decorations with collision.
   */
  private spawnLevelTrees(seed: string, occupiedCells: Set<string>): void {
    if (!this.voxelGrid) return;

    console.log('Generating tree variations...');
    // Note: We generate variations but don't need to store them server-side
    // Clients will generate the same variations from the seed
    const variations = generateTreeVariations(seed);
    
    // Place tree instances across the level (120 trees)
    const targetCount = 120;
    const allTreeInstances = placeTreeInstances(
      seed,
      variations.length,
      targetCount,
      (worldX: number, worldZ: number) => this.voxelGrid!.getWorldSurfaceY(worldX, worldZ),
      occupiedCells
    );

    // Filter out underwater trees
    this.treeInstances = allTreeInstances.filter(instance => {
      if (!this.waterLevelProvider) return true;
      return this.waterLevelProvider.isValidSpawnPosition(instance.worldX, instance.worldY, instance.worldZ);
    });

    const underwaterTreesFiltered = allTreeInstances.length - this.treeInstances.length;
    if (underwaterTreesFiltered > 0) {
      console.log(`Filtered out ${underwaterTreesFiltered} underwater trees`);
    }

    // Create collision meshes for all trees
    // Trees use 50x80x50 voxel grid scaled 0.4x = ~16 units tall
    const TREE_SCALE = 0.4;
    this.treeColliderMeshes = this.treeInstances.map(instance => {
      const variation = variations[instance.variationId];
      return {
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY + 0.4, // Offset up to match rendering
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: TREE_SCALE
        }
      };
    });

    let totalTris = 0;
    for (const tm of this.treeColliderMeshes) {
      totalTris += tm.mesh.triangleCount;
    }
    console.log(`Placed ${this.treeInstances.length} tree instances with ${totalTris} total collider triangles`);
  }

  /**
   * Place bush instances across the level.
   * Bushes are client-side only decorations (no server collision).
   */
  private spawnLevelBushes(seed: string, occupiedCells: Set<string>): void {
    if (!this.voxelGrid) {
      console.log('[Room] ✗ Cannot spawn bushes - no voxelGrid');
      return;
    }

    console.log('[Room] Generating bush variations...');
    // Note: Server doesn't store variations, clients generate the same ones from seed
    const variations = generateBushVariations(seed, 8, 18);
    
    // Place bush instances across the level (200 bushes)
    const targetCount = 200;
    const allBushInstances = placeBushInstances(
      seed,
      variations.length,
      targetCount,
      (worldX: number, worldZ: number) => this.voxelGrid!.getWorldSurfaceY(worldX, worldZ),
      occupiedCells
    );

    // Filter out underwater bushes
    this.bushInstances = allBushInstances.filter(instance => {
      if (!this.waterLevelProvider) return true;
      return this.waterLevelProvider.isValidSpawnPosition(instance.worldX, instance.worldY, instance.worldZ);
    });

    const underwaterBushesFiltered = allBushInstances.length - this.bushInstances.length;
    if (underwaterBushesFiltered > 0) {
      console.log(`[Room] Filtered out ${underwaterBushesFiltered} underwater bushes`);
    }

    console.log(`[Room] ✓ Placed ${this.bushInstances.length} bush instances (transforms only, no physics)`);
    
    // Debug first 3 bush positions
    for (let i = 0; i < Math.min(3, this.bushInstances.length); i++) {
      const b = this.bushInstances[i];
      console.log(`[Room]   Bush ${i}: pos=(${b.worldX.toFixed(1)}, ${b.worldY.toFixed(1)}, ${b.worldZ.toFixed(1)}), variation=${b.variationId}`);
    }
  }

  /**
   * Build octree for broad-phase collision culling.
   * Called after all static objects (trees, rocks, bushes) are placed.
   */
  private buildOctree(): void {
    console.log('[Room] Building octree for collision culling...');
    
    // Create octree covering the play area: center (0, 10, 0), halfSize 110
    // Covers -100 to +100 in X/Z with margin, 0-20 in Y
    this.octree = new Octree(0, 10, 0, 110, 6, 8);
    
    let nextId = 0;
    
    // Insert tree colliders
    for (let i = 0; i < this.treeColliderMeshes.length; i++) {
      const treeData = this.treeColliderMeshes[i];
      const instance = this.treeInstances[i];
      
      // Compute AABB (rough estimate: ±5 units from position)
      const entry: OctreeEntry = {
        id: nextId++,
        type: 'tree',
        data: treeData,
        minX: instance.worldX - 5,
        minY: instance.worldY - 1,
        minZ: instance.worldZ - 5,
        maxX: instance.worldX + 5,
        maxY: instance.worldY + 20,
        maxZ: instance.worldZ + 5
      };
      
      this.octree.insert(entry);
    }
    
    // Insert rock colliders
    for (let i = 0; i < this.rockColliderMeshes.length; i++) {
      const rockData = this.rockColliderMeshes[i];
      const instance = this.rockInstances[i];
      
      // Compute AABB (rough estimate: ±3 units scaled)
      const radius = 3 * instance.scale;
      const entry: OctreeEntry = {
        id: nextId++,
        type: 'rock',
        data: rockData,
        minX: instance.worldX - radius,
        minY: instance.worldY - radius,
        minZ: instance.worldZ - radius,
        maxX: instance.worldX + radius,
        maxY: instance.worldY + radius,
        maxZ: instance.worldZ + radius
      };
      
      this.octree.insert(entry);
    }
    
    console.log(`[Room] Octree built with ${this.treeColliderMeshes.length + this.rockColliderMeshes.length} colliders`);
  }

  removePlayer(connectionId: string): Player | undefined {
    const player = this.players.get(connectionId);
    if (player) {
      // Remove player's score
      this.roundState.scores.delete(player.entityId);
      
      // Clean up broadcast cache
      this.lastBroadcastCache.delete(player.entityId);
      
      this.world.destroyEntity(player.entityId);
      this.players.delete(connectionId);
      this.connections.delete(connectionId);

      console.log(`Player ${connectionId} left room ${this.id}`);

      // Check if round should end due to insufficient players
      const remainingPlayers = this.players.size;
      if (remainingPlayers < this.roundState.config.minPlayers && this.roundState.phase === 'active') {
        console.log(`[Round] Not enough players (${remainingPlayers}), ending round`);
        this.roundState.phase = 'waiting';
        if (this.roundState.countdownTimer) {
          clearInterval(this.roundState.countdownTimer);
        }
        this.broadcastRoundState();
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
      sprint: input.sprint || false
    });

    // Cap queue to prevent memory growth from clock drift or flooding
    if (queue.length > 8) {
      queue.splice(0, queue.length - 8);
    }

    // Update visual-only headPitch immediately (used for broadcast, not physics)
    comp.headPitch = input.cameraPitch || 0;
  }

  /** Spawn a projectile using client-provided aim direction and spawn position. */
  spawnProjectile(
    connectionId: string, 
    aimDirX: number, 
    aimDirY: number, 
    aimDirZ: number,
    clientSpawnX: number,
    clientSpawnY: number,
    clientSpawnZ: number
  ): ProjectileSpawnData | ProjectileSpawnData[] | null {
    const player = this.players.get(connectionId);
    if (!player) {
      console.log('[Shoot] No player found for connection');
      return null;
    }

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) {
      console.log('[Shoot] No player entity found');
      return null;
    }

    const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
    if (!pc) {
      console.log('[Shoot] No player component');
      return null;
    }

    // Check if the player has a weapon
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) {
      console.log('[Shoot] No weapon in collection');
      return null; // No weapon, can't shoot
    }

    // Get weapon type from player entity (weapon components are on the player when equipped)
    const weaponTypeComp = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    const weaponType = weaponTypeComp?.type || 'unknown';
    console.log(`[spawnProjectile] Player has weapon type: ${weaponType}`);

    // Get weapon components from player
    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    
    if (!shootable || !ammo) {
      console.log('[Shoot] Missing shootable or ammo component');
      return null; // No weapon components
    }
    
    console.log(`[Shoot] Player shooting with proximityRadius=${shootable.proximityRadius}, ammo=${ammo.current}`);

    // Check if reloading
    if (ammo.isReloading) {
      return null; // Can't shoot while reloading
    }

    // Check ammo
    if (!ammo.infinite && ammo.current <= 0) {
      // Auto-reload when empty
      const now = Date.now() * 0.001;
      ammo.isReloading = true;
      ammo.reloadStartTime = now;

      // Broadcast auto-reload for remote audio
      const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
      if (collected && collected.items.length > 0) {
        const weaponEntity = this.world.getEntity(collected.items[0]);
        const weaponTypeComp = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
        const reloadMsg: ReloadStartedMessage = {
          entityId: player.entityId,
          weaponType: weaponTypeComp?.type || 'pistol',
          excludeSender: true, // Sender plays local reload sound
        };
        this.broadcastLow(Opcode.ReloadStarted, reloadMsg);
      }
      return null;
    }

    // Check shooting cooldown (rate limit)
    const now = Date.now() * 0.001; // Convert to seconds
    const cooldown = 1.0 / shootable.fireRate;
    if (now - shootable.lastFireTime < cooldown) {
      return null; // Too soon, ignore shoot request
    }
    shootable.lastFireTime = now;

    // Consume ammo (double barrel uses 2 per shot)
    if (!ammo.infinite) {
      const ammoPerShot = weaponType === 'doublebarrel' ? 2 : 1;
      ammo.current -= ammoPerShot;
    }

    // Normalize the client-provided direction (never trust client magnitudes)
    const len = Math.sqrt(aimDirX * aimDirX + aimDirY * aimDirY + aimDirZ * aimDirZ);
    if (len < 0.001) return null; // Degenerate direction
    const baseDirX = aimDirX / len;
    const baseDirY = aimDirY / len;
    const baseDirZ = aimDirZ / len;

    // Use client-provided spawn position directly
    // Client calculates barrel tip position using hold transform
    const posX = clientSpawnX;
    const posY = clientSpawnY;
    const posZ = clientSpawnZ;

    // Spawn multiple projectiles for shotguns (pelletsPerShot)
    const spawnDataArray: ProjectileSpawnData[] = [];
    const pelletCount = shootable.pelletsPerShot || 1;
    
    console.log(`[Shotgun Debug] Spawning ${pelletCount} pellets for player ${player.entityId}`);

    for (let i = 0; i < pelletCount; i++) {
      let dirX = baseDirX;
      let dirY = baseDirY;
      let dirZ = baseDirZ;

      // Apply accuracy cone (random spread) for each pellet
      if (shootable.accuracy > 0) {
        // Random angle within cone (0 to accuracy radians)
        const coneAngle = Math.random() * shootable.accuracy;
        const spin = Math.random() * Math.PI * 2;
        
        // Find a perpendicular vector to the direction
        let perpX, perpY, perpZ;
        if (Math.abs(dirY) < 0.9) {
          // Use up vector if direction is not too vertical
          perpX = dirY * 0 - dirZ * 1;
          perpY = dirZ * 0 - dirX * 0;
          perpZ = dirX * 1 - dirY * 0;
        } else {
          // Use forward vector if direction is vertical
          perpX = dirY * 1 - dirZ * 0;
          perpY = dirZ * 0 - dirX * 0;
          perpZ = dirX * 0 - dirY * 1;
        }
        
        // Normalize perpendicular vector
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
        perpX /= perpLen;
        perpY /= perpLen;
        perpZ /= perpLen;
        
        // Rotate perpendicular around direction by spin angle
        const cosSpin = Math.cos(spin);
        const sinSpin = Math.sin(spin);
        const crossX = perpY * dirZ - perpZ * dirY;
        const crossY = perpZ * dirX - perpX * dirZ;
        const crossZ = perpX * dirY - perpY * dirX;
        
        const rotPerpX = perpX * cosSpin + crossX * sinSpin;
        const rotPerpY = perpY * cosSpin + crossY * sinSpin;
        const rotPerpZ = perpZ * cosSpin + crossZ * sinSpin;
        
        // Apply cone angle rotation
        const cosAngle = Math.cos(coneAngle);
        const sinAngle = Math.sin(coneAngle);
        
        dirX = dirX * cosAngle + rotPerpX * sinAngle;
        dirY = dirY * cosAngle + rotPerpY * sinAngle;
        dirZ = dirZ * cosAngle + rotPerpZ * sinAngle;
        
        // Renormalize
        const finalLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        dirX /= finalLen;
        dirY /= finalLen;
        dirZ /= finalLen;
      }

      // Add tiny offset to each pellet spawn position to prevent instant collisions
      // Offset in a small circle pattern around the main spawn point
      const offsetRadius = 0.05; // Very small offset
      const angle = (i / pelletCount) * Math.PI * 2;
      const offsetX = Math.cos(angle) * offsetRadius;
      const offsetZ = Math.sin(angle) * offsetRadius;
      
      const pelletPosX = posX + offsetX;
      const pelletPosZ = posZ + offsetZ;

      // Create projectile entity for this pellet
      const projEntity = this.world.createEntity();
      
      // Use shorter lifetime for shotgun pellets (close range weapon)
      const lifetime = pelletCount > 1 ? PROJECTILE_LIFETIME_SHOTGUN : PROJECTILE_LIFETIME;
      
      const projComp: ProjectileComponent = {
        ownerId: player.entityId,
        weaponType: weaponType,
        dirX, dirY, dirZ,
        speed: shootable.projectileSpeed,
        damage: shootable.damage,
        baseDamage: shootable.damage,
        lifetime,
        posX: pelletPosX,
        posY,
        posZ: pelletPosZ,
        velY: dirY * shootable.projectileSpeed,
        distanceTraveled: 0,
        gravityStartDistance: shootable.gravityStartDistance,
        tickCounter: 0, // ARMA-style: start at 0 for immediate first check
        lastCollisionCheckX: pelletPosX, // Initialize to spawn position
        lastCollisionCheckY: posY,
        lastCollisionCheckZ: pelletPosZ,
        proximityRadius: shootable.proximityRadius // Optional AOE/splash damage radius
      };
      
      console.log(`[Projectile] Created projectile with proximityRadius: ${shootable.proximityRadius}, damage: ${shootable.damage}`);
      projEntity.add(COMP_PROJECTILE, projComp);

      const spawnData: ProjectileSpawnData = {
        entityId: projEntity.id,
        ownerId: player.entityId,
        posX: pelletPosX,
        posY,
        posZ: pelletPosZ,
        dirX, dirY, dirZ,
        speed: shootable.projectileSpeed
      };

      spawnDataArray.push(spawnData);
    }

    console.log(`[Shotgun Debug] Created ${spawnDataArray.length} spawn data entries`);
    
    // Track shots fired (each pellet counts as one shot)
    for (let i = 0; i < spawnDataArray.length; i++) {
      this.trackShotFired(player.entityId);
    }
    
    return spawnDataArray.length === 1 ? spawnDataArray[0] : spawnDataArray;
  }

  /** Handle manual reload request from player. */
  handleReloadRequest(connectionId: string): void {
    const player = this.players.get(connectionId);
    if (!player) return;

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;

    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    if (!ammo) return; // No weapon

    // Can't reload if already reloading, infinite ammo, or magazine is full
    if (ammo.isReloading || ammo.infinite || ammo.current >= ammo.capacity) {
      return;
    }

    const now = Date.now() * 0.001;
    ammo.isReloading = true;
    ammo.reloadStartTime = now;

    // Broadcast reload started for remote audio
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (collected && collected.items.length > 0) {
      const weaponEntity = this.world.getEntity(collected.items[0]);
      const weaponTypeComp = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      const reloadMsg: ReloadStartedMessage = {
        entityId: player.entityId,
        weaponType: weaponTypeComp?.type || 'pistol',
        excludeSender: true, // Sender plays local reload sound
      };
      this.broadcastLow(Opcode.ReloadStarted, reloadMsg);
    }
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

  /** Handle item toss landing (called when client animation completes). */
  handleItemTossLand(connectionId: string, landX: number, landY: number, landZ: number): void {
    const player = this.players.get(connectionId);
    if (!player) return;

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;

    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) {
      return; // No weapon to drop
    }

    // Get weapon components from player before removing
    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    const playerWeaponType = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);

    if (!shootable || !ammo) return;

    // Remove weapon from player
    collected.items = [];
    playerEntity.remove(COMP_SHOOTABLE);
    playerEntity.remove(COMP_AMMO);
    playerEntity.remove(COMP_WEAPON_TYPE);

    // Create new item entity at landing position
    const itemEntity = this.world.createEntity();
    
    // Copy weapon components to item
    itemEntity.add(COMP_SHOOTABLE, {
      damage: shootable.damage,
      fireRate: shootable.fireRate,
      projectileSpeed: shootable.projectileSpeed,
      lastFireTime: 0, // Reset
      accuracy: shootable.accuracy,
      gravityStartDistance: shootable.gravityStartDistance,
      pelletsPerShot: shootable.pelletsPerShot
    });
    
    itemEntity.add(COMP_AMMO, {
      current: ammo.current,
      max: ammo.max,
      capacity: ammo.capacity,
      reloadTime: ammo.reloadTime,
      isReloading: false, // Reset reload state
      reloadStartTime: 0,
      infinite: ammo.infinite
    });

    if (playerWeaponType) {
      itemEntity.add(COMP_WEAPON_TYPE, {
        type: playerWeaponType.type
      });
    }

    itemEntity.tag(TAG_COLLECTABLE);

    // Add physics component for the dropped item (already settled on ground)
    const physics: PhysicsComponent = {
      posX: landX,
      posY: landY,
      posZ: landZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: 0.5,
      onGround: true // Already settled at drop location
    };
    itemEntity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(itemEntity.id, landX, landZ);

    // Get weapon type from item entity
    const weaponType = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);

    // Broadcast spawn to all clients
    const spawnMsg: ItemSpawnMessage = {
      entityId: itemEntity.id,
      itemType: weaponType?.type || 'pistol',
      posX: landX,
      posY: landY,
      posZ: landZ
    };
    this.broadcastLow(Opcode.ItemSpawn, spawnMsg);

    // Broadcast drop sound for spatial audio
    const playerPhysics = playerEntity.get<PhysicsComponent>(COMP_PHYSICS);
    if (playerPhysics) {
      const dropSoundMsg: ItemDropSoundMessage = {
        entityId: player.entityId,
        posX: playerPhysics.posX,
        posY: playerPhysics.posY,
        posZ: playerPhysics.posZ,
        excludeSender: true, // Sender plays local drop sound
      };
      this.broadcastLow(Opcode.ItemDropSound, dropSoundMsg);
    }

    console.log(`Player ${player.entityId} dropped weapon at (${landX.toFixed(1)}, ${landY.toFixed(1)}, ${landZ.toFixed(1)})`);
  }

  /** Drop player's weapon at specified position. */
  private dropWeaponAtPosition(playerEntity: Entity, posX: number, posY: number, posZ: number): void {
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) return;

    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    const playerWeaponType2 = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    if (!shootable || !ammo) return;

    // Remove weapon from player
    collected.items = [];
    playerEntity.remove(COMP_SHOOTABLE);
    playerEntity.remove(COMP_AMMO);
    playerEntity.remove(COMP_WEAPON_TYPE);

    // Create new item entity at drop position
    const itemEntity = this.world.createEntity();
    
    itemEntity.add(COMP_SHOOTABLE, {
      damage: shootable.damage,
      fireRate: shootable.fireRate,
      projectileSpeed: shootable.projectileSpeed,
      lastFireTime: 0,
      accuracy: shootable.accuracy,
      gravityStartDistance: shootable.gravityStartDistance,
      pelletsPerShot: shootable.pelletsPerShot,
      proximityRadius: shootable.proximityRadius
    });
    
    itemEntity.add(COMP_AMMO, {
      current: ammo.current,
      max: ammo.max,
      capacity: ammo.capacity,
      reloadTime: ammo.reloadTime,
      isReloading: false,
      reloadStartTime: 0,
      infinite: ammo.infinite
    });

    if (playerWeaponType2) {
      itemEntity.add(COMP_WEAPON_TYPE, {
        type: playerWeaponType2.type
      });
    }

    itemEntity.tag(TAG_COLLECTABLE);

    const physics: PhysicsComponent = {
      posX,
      posY,
      posZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: 0.5,
      onGround: true // Already settled at drop location
    };
    itemEntity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(itemEntity.id, posX, posZ);

    // Get weapon type from item entity
    const itemWeaponType2 = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);

    // Broadcast spawn to all clients
    const spawnMsg: ItemSpawnMessage = {
      entityId: itemEntity.id,
      itemType: itemWeaponType2?.type || 'pistol',
      posX,
      posY,
      posZ
    };
    this.broadcastLow(Opcode.ItemSpawn, spawnMsg);
  }

  /**
   * Apply proximity/AOE damage to all entities within radius.
   * Damage falls off linearly with distance from impact point.
   */
  private applyProximityDamage(
    impactX: number,
    impactY: number,
    impactZ: number,
    radius: number,
    baseDamage: number,
    projectileDistance: number,
    attackerId: number,
    killableEntities: Entity[]
  ): void {
    // Broadcast explosion visual effect
    const explosionMsg: ExplosionSpawnMessage = {
      posX: impactX,
      posY: impactY,
      posZ: impactZ,
      radius
    };
    console.log(`[Explosion] Broadcasting explosion at (${impactX.toFixed(2)}, ${impactY.toFixed(2)}, ${impactZ.toFixed(2)}) with radius ${radius}`);
    this.broadcastLow(Opcode.ExplosionSpawn, explosionMsg);
    // Apply distance falloff to base damage first (same as regular projectiles)
    let damageMult = 1.0;
    if (projectileDistance > 20) {
      damageMult = Math.max(0.3, 1.0 - (projectileDistance - 20) * 0.0125);
    }
    const effectiveDamage = baseDamage * damageMult;

    // Find all entities within radius and apply proximity damage
    for (const targetEntity of killableEntities) {
      const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
      const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
      if (!pc || !health) continue;

      // Calculate distance from impact point to target (posY is already center)
      const dx = pc.state.posX - impactX;
      const dy = pc.state.posY - impactY;
      const dz = pc.state.posZ - impactZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Check if target is within radius
      if (distance > radius) continue;

      // Line-of-sight check: raycast from explosion to player
      // If blocked by terrain, rocks, or other entities, skip this target
      const rayDirX = dx / distance;
      const rayDirY = dy / distance;
      const rayDirZ = dz / distance;
      
      let losBlocked = false;
      
      // Check voxel collision (terrain)
      if (this.voxelGrid) {
        const voxelHit = rayVsVoxelGrid(
          this.voxelGrid,
          impactX, impactY, impactZ,
          rayDirX, rayDirY, rayDirZ,
          distance
        );
        if (voxelHit.hit) {
          losBlocked = true;
        }
      }
      
      // Check rock collision (if not already blocked)
      if (!losBlocked) {
        // Query octree for rocks along explosion ray (broad-phase culling)
        let rocksToCheck = this.rockColliderMeshes;
        
        if (this.octree) {
          const nearbyEntries = this.octree.queryRay(impactX, impactY, impactZ, rayDirX, rayDirY, rayDirZ, distance);
          rocksToCheck = nearbyEntries.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
        }
        
        for (const rockData of rocksToCheck) {
          const rockHit = rayVsTriangleMesh(
            [impactX, impactY, impactZ],
            [rayDirX, rayDirY, rayDirZ],
            rockData.mesh,
            rockData.transform,
            distance
          );
          if (rockHit.hit) {
            losBlocked = true;
            break;
          }
        }
      }
      
      // Check if another entity is blocking the line of sight
      if (!losBlocked) {
        for (const blockingEntity of killableEntities) {
          if (blockingEntity.id === targetEntity.id) continue; // Skip target itself
          
          const blockingPc = blockingEntity.get<PlayerComponent>(COMP_PLAYER);
          if (!blockingPc) continue;
          
          // Check if ray intersects blocking entity's hitbox (posY is already center)
          const blockingResult = rayVsAABB(
            impactX, impactY, impactZ,
            rayDirX, rayDirY, rayDirZ,
            distance,
            blockingPc.state.posX,
            blockingPc.state.posY,
            blockingPc.state.posZ,
            PLAYER_HITBOX_HALF
          );
          
          if (blockingResult.hit) {
            losBlocked = true;
            break;
          }
        }
      }
      
      // Skip this target if line of sight is blocked
      if (losBlocked) continue;

      // Calculate proximity falloff (linear: 100% at center, 0% at radius edge)
      const proximityMult = Math.max(0, 1.0 - (distance / radius));
      const finalDamage = effectiveDamage * proximityMult;

      console.log(`[Explosion] Entity ${targetEntity.id} hit! distance=${distance.toFixed(2)}, proximityMult=${proximityMult.toFixed(2)}, finalDamage=${finalDamage.toFixed(1)}`);

      // Apply damage (armor absorbs first)
      this.applyDamageToEntity(targetEntity, finalDamage);

      // Apply knockback impulse (more aggressive falloff than damage)
      // Use quadratic falloff: (proximityMult * 0.5)^2 for stronger near-center push
      if (distance > 0.001) { // Avoid division by zero
        const impulseStrength = 20.0; // Base impulse strength
        const impulseMult = proximityMult * 0.5; // Scale down base multiplier
        const impulseFalloff = impulseMult * impulseMult; // Square it for aggressive falloff
        const finalImpulse = impulseStrength * impulseFalloff;
        
        // Calculate normalized direction away from explosion
        const dirX = dx / distance;
        const dirY = dy / distance;
        const dirZ = dz / distance;
        
        // Apply impulse to player velocity (push away from explosion)
        pc.state.velX += dirX * finalImpulse;
        pc.state.velY += dirY * finalImpulse * 0.5; // Reduced vertical impulse
        pc.state.velZ += dirZ * finalImpulse;
      }

      // Track damage dealt
      this.trackDamage(attackerId, finalDamage);
      
      // Broadcast damage
      const dmgMsg: EntityDamageMessage = {
        entityId: targetEntity.id,
        damage: finalDamage,
        newHealth: health.current,
        attackerId
      };
      this.broadcastLow(Opcode.EntityDamage, dmgMsg);

      // Check death
      if (health.current <= 0) {
        // Drop weapon at death position
        this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);

        const deathMsg: EntityDeathMessage = {
          entityId: targetEntity.id,
          killerId: attackerId
        };
        this.broadcastLow(Opcode.EntityDeath, deathMsg);

        // Update round scores if active
        if (this.roundState.phase === 'active') {
          // Get weapon type from attacker for kill feed
          let weaponType: string | null = null;
          const attackerEntity = this.world.getEntity(attackerId);
          if (attackerEntity) {
            const attackerCollected = attackerEntity.get<CollectedComponent>(COMP_COLLECTED);
            if (attackerCollected && attackerCollected.items.length > 0) {
              const weaponEntity = this.world.getEntity(attackerCollected.items[0]);
              if (weaponEntity) {
                const weaponTypeComp = weaponEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
                if (weaponTypeComp) {
                  weaponType = weaponTypeComp.type;
                }
              }
            }
          }
          this.handleKill(attackerId, targetEntity.id, weaponType, false);
          this.checkWinCondition();
        }

        // Respawn
        const spawnPos = this.findValidSpawnPosition();
        pc.state.posX = spawnPos.x;
        pc.state.posY = spawnPos.y;
        pc.state.posZ = spawnPos.z;
        pc.state.velX = 0;
        pc.state.velY = 0;
        pc.state.velZ = 0;
        pc.state.isInWater = false;
        pc.state.isHeadUnderwater = false;
        pc.state.breathRemaining = 10.0;
        pc.state.waterDepth = 0;
        pc.inputQueue!.length = 0; // Clear stale inputs on death
        health.current = health.max;
      }
    }
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
    console.log(`[Building] handleBuildingCreate called - player: ${playerEntityId}, data:`, data);
    
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    // Create new building entity
    const buildingEntity = this.world.createEntity();
    const buildingEntityId = buildingEntity.id;
    const gridSize = 12;
    const buildingComp: BuildingComponent = {
      ownerEntityId: playerEntityId,
      gridPositionX: data.posX,
      gridPositionY: data.posY,
      gridPositionZ: data.posZ,
      gridRotationY: data.rotY,
      voxelData: new Uint8Array(gridSize * gridSize * gridSize),
      gridSize: gridSize
    };
    buildingEntity.add(COMP_BUILDING, buildingComp);
    this.buildingEntities.set(buildingEntityId, buildingEntity);
    this.blockColliderCache.set(buildingEntityId, new Map());

    // Broadcast to all clients
    const createdMsg: BuildingCreatedMessage = {
      buildingEntityId,
      ownerEntityId: playerEntityId,
      gridPositionX: data.posX,
      gridPositionY: data.posY,
      gridPositionZ: data.posZ,
      gridRotationY: data.rotY,
      gridSize
    };
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.BuildingCreated, createdMsg);
    });

    console.log(`[Building] Building entity ${buildingEntityId} created at (${data.posX.toFixed(2)}, ${data.posY.toFixed(2)}, ${data.posZ.toFixed(2)})`);
  }

  handleBlockPlace(playerEntityId: number, data: BlockPlaceMessage): void {
    console.log(`[Building] handleBlockPlace called - player: ${playerEntityId}, data:`, data);
    
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) {
      console.error('[Building] Building entity not found:', data.buildingEntityId);
      return;
    }

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) {
      console.error('[Building] Building component not found');
      return;
    }

    // Check ownership
    if (building.ownerEntityId !== playerEntityId) {
      console.error('[Building] Player does not own this building');
      return;
    }

    // Check materials
    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (!materials || materials.current < 1) {
      console.log('[Building] Player does not have enough materials');
      return;
    }

    const { gridX, gridY, gridZ, colorIndex } = data;

    // Validate grid position
    if (gridX < 0 || gridX >= building.gridSize ||
        gridY < 0 || gridY >= building.gridSize ||
        gridZ < 0 || gridZ >= building.gridSize) {
      return;
    }

    const index = gridX + gridY * building.gridSize + gridZ * building.gridSize * building.gridSize;
    if (building.voxelData[index] !== 0) {
      return;
    }

    // Deduct materials
    materials.current -= 1;

    // Broadcast materials update
    const materialsMsg: MaterialsUpdateMessage = {
      entityId: playerEntityId,
      materials: materials.current
    };
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.MaterialsUpdate, materialsMsg);
    });

    // Place block in voxel data
    building.voxelData[index] = colorIndex + 1;

    // Create physics collider (using Havok physics from the scene)
    this.createBlockPhysics(data.buildingEntityId, building, gridX, gridY, gridZ);
    this.upsertBlockCollider(data.buildingEntityId, building, gridX, gridY, gridZ);

    // Broadcast to all clients
    const msg: BlockPlacedMessage = { 
      buildingEntityId: data.buildingEntityId,
      gridX, 
      gridY, 
      gridZ, 
      colorIndex 
    };
    console.log(`[Building] Broadcasting BlockPlaced to ${this.connections.size} clients: (${gridX}, ${gridY}, ${gridZ}), color=${colorIndex}, materials left: ${materials.current}`);
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.BlockPlaced, msg);
    });

    console.log(`[Building] Block placed at (${gridX}, ${gridY}, ${gridZ})`);
  }

  handleBlockRemove(playerEntityId: number, data: BlockRemoveMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) {
      console.error('[Building] Building entity not found:', data.buildingEntityId);
      return;
    }

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;

    // Check ownership
    if (building.ownerEntityId !== playerEntityId) {
      console.error('[Building] Player does not own this building');
      return;
    }

    const { gridX, gridY, gridZ } = data;

    // Validate grid position
    if (gridX < 0 || gridX >= building.gridSize ||
        gridY < 0 || gridY >= building.gridSize ||
        gridZ < 0 || gridZ >= building.gridSize) {
      return;
    }

    const index = gridX + gridY * building.gridSize + gridZ * building.gridSize * building.gridSize;
    if (building.voxelData[index] === 0) return; // Nothing to remove

    // Refund materials
    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (materials) {
      materials.current = Math.min(materials.max, materials.current + 1);

      // Broadcast materials update
      const materialsMsg: MaterialsUpdateMessage = {
        entityId: playerEntityId,
        materials: materials.current
      };
      this.connections.forEach(conn => {
        this.connectionHandler.sendLow(conn, Opcode.MaterialsUpdate, materialsMsg);
      });
    }

    // Remove block from voxel data
    building.voxelData[index] = 0;

    // Remove physics collider
    this.removeBlockPhysics(data.buildingEntityId, gridX, gridY, gridZ);
    this.removeBlockCollider(data.buildingEntityId, gridX, gridY, gridZ);

    // Broadcast to all clients
    const msg: BlockRemovedMessage = { 
      buildingEntityId: data.buildingEntityId,
      gridX, 
      gridY, 
      gridZ 
    };
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.BlockRemoved, msg);
    });

    console.log(`[Building] Block removed at (${gridX}, ${gridY}, ${gridZ}), materials refunded`);
  }

  private createBlockPhysics(buildingEntityId: number, building: BuildingComponent, gridX: number, gridY: number, gridZ: number): void {
    const key = `${buildingEntityId}_${gridX}_${gridY}_${gridZ}`;
    if (this.blockPhysics.has(key)) return;

    // Calculate world position
    const cellSize = 0.5;
    const halfSize = (building.gridSize * cellSize) / 2;
    
    // Local position relative to grid
    const localX = (gridX * cellSize) - halfSize + (cellSize * 0.5);
    const localY = (gridY * cellSize) - halfSize + (cellSize * 0.5);
    const localZ = (gridZ * cellSize) - halfSize + (cellSize * 0.5);

    // Transform to world space (Babylon uses left-handed coordinate system)
    const cosY = Math.cos(building.gridRotationY);
    const sinY = Math.sin(building.gridRotationY);
    const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
    const worldY = building.gridPositionY + localY;
    const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);

    // Create physics box using Havok
    const colliderMesh = MeshBuilder.CreateBox(`blockCollider_${key}`, { size: cellSize }, this.scene);
    colliderMesh.position.set(worldX, worldY, worldZ);
    colliderMesh.isVisible = false;

    const aggregate = new PhysicsAggregate(
      colliderMesh,
      PhysicsShapeType.BOX,
      { mass: 0, restitution: 0, friction: 0.5 },
      this.scene
    );

    this.blockPhysics.set(key, { mesh: colliderMesh, aggregate });
  }

  private removeBlockPhysics(buildingEntityId: number, gridX: number, gridY: number, gridZ: number): void {
    const key = `${buildingEntityId}_${gridX}_${gridY}_${gridZ}`;
    const physics = this.blockPhysics.get(key);
    
    if (physics) {
      physics.aggregate.dispose();
      physics.mesh.dispose();
      this.blockPhysics.delete(key);
    }
  }

  private getBlockColliderKey(gridX: number, gridY: number, gridZ: number): string {
    return `${gridX}_${gridY}_${gridZ}`;
  }

  private buildBlockColliderEntry(building: BuildingComponent, gridX: number, gridY: number, gridZ: number): BlockColliderEntry {
    const cellSize = 0.5;
    const halfCell = cellSize * 0.5;
    const halfSize = (building.gridSize * cellSize) * 0.5;

    const localX = (gridX * cellSize) - halfSize + halfCell;
    const localY = (gridY * cellSize) - halfSize + halfCell;
    const localZ = (gridZ * cellSize) - halfSize + halfCell;

    const cosY = Math.cos(building.gridRotationY);
    const sinY = Math.sin(building.gridRotationY);
    const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
    const worldY = building.gridPositionY + localY;
    const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);

    return {
      gridX,
      gridY,
      gridZ,
      minX: worldX - halfCell,
      minY: worldY - halfCell,
      minZ: worldZ - halfCell,
      maxX: worldX + halfCell,
      maxY: worldY + halfCell,
      maxZ: worldZ + halfCell
    };
  }

  private upsertBlockCollider(buildingEntityId: number, building: BuildingComponent, gridX: number, gridY: number, gridZ: number): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache) return;

    const key = this.getBlockColliderKey(gridX, gridY, gridZ);
    const entry = this.buildBlockColliderEntry(building, gridX, gridY, gridZ);
    cache.set(key, entry);
  }

  private removeBlockCollider(buildingEntityId: number, gridX: number, gridY: number, gridZ: number): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache) return;

    const key = this.getBlockColliderKey(gridX, gridY, gridZ);
    cache.delete(key);
  }

  private rebuildBlockCollidersForBuilding(buildingEntityId: number, building: BuildingComponent): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache || cache.size === 0) return;

    for (const entry of cache.values()) {
      const updated = this.buildBlockColliderEntry(building, entry.gridX, entry.gridY, entry.gridZ);
      entry.minX = updated.minX;
      entry.minY = updated.minY;
      entry.minZ = updated.minZ;
      entry.maxX = updated.maxX;
      entry.maxY = updated.maxY;
      entry.maxZ = updated.maxZ;
    }
  }

  private collectBlockColliders(): Array<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> | undefined {
    if (this.blockColliderCache.size === 0) return undefined;

    const colliders: Array<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = [];
    for (const cache of this.blockColliderCache.values()) {
      for (const entry of cache.values()) {
        colliders.push({
          minX: entry.minX,
          minY: entry.minY,
          minZ: entry.minZ,
          maxX: entry.maxX,
          maxY: entry.maxY,
          maxZ: entry.maxZ
        });
      }
    }

    return colliders.length > 0 ? colliders : undefined;
  }

  private getPickupCellKey(worldX: number, worldZ: number): string {
    const cellX = Math.floor(worldX / this.pickupGridCellSize);
    const cellZ = Math.floor(worldZ / this.pickupGridCellSize);
    return `${cellX},${cellZ}`;
  }

  private upsertPickupGrid(itemId: number, worldX: number, worldZ: number): void {
    const key = this.getPickupCellKey(worldX, worldZ);
    const previousKey = this.pickupGridCells.get(itemId);
    if (previousKey === key) return;

    if (previousKey) {
      const previousSet = this.pickupGrid.get(previousKey);
      if (previousSet) {
        previousSet.delete(itemId);
        if (previousSet.size === 0) {
          this.pickupGrid.delete(previousKey);
        }
      }
    }

    let cellSet = this.pickupGrid.get(key);
    if (!cellSet) {
      cellSet = new Set<number>();
      this.pickupGrid.set(key, cellSet);
    }
    cellSet.add(itemId);
    this.pickupGridCells.set(itemId, key);
  }

  private removePickupFromGrid(itemId: number): void {
    const key = this.pickupGridCells.get(itemId);
    if (!key) return;

    const cellSet = this.pickupGrid.get(key);
    if (cellSet) {
      cellSet.delete(itemId);
      if (cellSet.size === 0) {
        this.pickupGrid.delete(key);
      }
    }

    this.pickupGridCells.delete(itemId);
  }

  private queryPickupGrid(worldX: number, worldZ: number, range: number): number[] {
    const cellRadius = Math.ceil(range / this.pickupGridCellSize);
    const centerCellX = Math.floor(worldX / this.pickupGridCellSize);
    const centerCellZ = Math.floor(worldZ / this.pickupGridCellSize);
    const results: number[] = [];
    const seen = new Set<number>();

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const key = `${centerCellX + dx},${centerCellZ + dz}`;
        const cellSet = this.pickupGrid.get(key);
        if (!cellSet) continue;

        for (const id of cellSet) {
          if (seen.has(id)) continue;
          seen.add(id);
          results.push(id);
        }
      }
    }

    return results;
  }

  handleBuildingTransform(playerEntityId: number, data: BuildingTransformMessage): void {
    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) {
      console.error('[Building] Building entity not found:', data.buildingEntityId);
      return;
    }

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;

    // Check ownership
    if (building.ownerEntityId !== playerEntityId) {
      console.error('[Building] Player does not own this building');
      return;
    }

    // Update building position and rotation
    building.gridPositionX = data.posX;
    building.gridPositionY = data.posY;
    building.gridPositionZ = data.posZ;
    building.gridRotationY = data.rotY;

    // Update all physics colliders for this building
    const cellSize = 0.5;
    const halfSize = (building.gridSize * cellSize) / 2;
    const halfCell = cellSize * 0.5;

    for (let x = 0; x < building.gridSize; x++) {
      for (let y = 0; y < building.gridSize; y++) {
        for (let z = 0; z < building.gridSize; z++) {
          const index = x + y * building.gridSize + z * building.gridSize * building.gridSize;
          if (building.voxelData[index] !== 0) {
            const key = `${data.buildingEntityId}_${x}_${y}_${z}`;
            const physics = this.blockPhysics.get(key);
            
            if (physics) {
              // Calculate new world position
              const localX = (x * cellSize) - halfSize + halfCell;
              const localY = (y * cellSize) - halfSize + halfCell;
              const localZ = (z * cellSize) - halfSize + halfCell;

              const cosY = Math.cos(building.gridRotationY);
              const sinY = Math.sin(building.gridRotationY);
              const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
              const worldY = building.gridPositionY + localY;
              const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);

              physics.mesh.position.set(worldX, worldY, worldZ);
            }
          }
        }
      }
    }

    this.rebuildBlockCollidersForBuilding(data.buildingEntityId, building);

    // Broadcast to all clients
    const msg: BuildingTransformedMessage = {
      buildingEntityId: data.buildingEntityId,
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      rotY: data.rotY
    };
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.BuildingTransformed, msg);
    });

    console.log(`[Building] Building ${data.buildingEntityId} transformed`);
  }

  handleBuildingDestroy(playerEntityId: number, data: BuildingDestroyMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) {
      console.error('[Building] Building entity not found:', data.buildingEntityId);
      return;
    }

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;

    // Check ownership
    if (building.ownerEntityId !== playerEntityId) {
      console.error('[Building] Player does not own this building');
      return;
    }

    // Count blocks and refund materials
    let blockCount = 0;
    for (let x = 0; x < building.gridSize; x++) {
      for (let y = 0; y < building.gridSize; y++) {
        for (let z = 0; z < building.gridSize; z++) {
          const index = x + y * building.gridSize + z * building.gridSize * building.gridSize;
          if (building.voxelData[index] !== 0) {
            blockCount++;
            this.removeBlockPhysics(data.buildingEntityId, x, y, z);
          }
        }
      }
    }

    // Refund materials for all blocks
    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (materials && blockCount > 0) {
      materials.current = Math.min(materials.max, materials.current + blockCount);

      // Broadcast materials update
      const materialsMsg: MaterialsUpdateMessage = {
        entityId: playerEntityId,
        materials: materials.current
      };
      this.connections.forEach(conn => {
        this.connectionHandler.sendLow(conn, Opcode.MaterialsUpdate, materialsMsg);
      });

      console.log(`[Building] Refunded ${blockCount} materials to player ${playerEntityId}`);
    }

    // Remove building entity
    this.world.destroyEntity(buildingEntity);
    this.buildingEntities.delete(data.buildingEntityId);
    this.blockColliderCache.delete(data.buildingEntityId);

    // Broadcast to all clients
    const msg: BuildingDestroyedMessage = {
      buildingEntityId: data.buildingEntityId
    };
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.BuildingDestroyed, msg);
    });

    console.log(`[Building] Building ${data.buildingEntityId} destroyed, ${blockCount} blocks refunded`);
  }

  // ========== LADDER SYSTEM ==========

  handleLadderPlace(playerEntityId: number, data: LadderPlaceMessage): void {
    console.log(`[Ladder] handleLadderPlace called - player: ${playerEntityId}, segments: ${data.segmentCount}`);
    
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Ladder] Player entity not found:', playerEntityId);
      return;
    }

    // Create ladder entity
    const ladderEntity = this.world.createEntity();
    const ladderEntityId = ladderEntity.id;
    
    // Calculate rotation from normal
    const rotY = Math.atan2(-data.normalX, -data.normalZ);
    
    // Create ladder collider component
    const ladderCollider: LadderColliderComponent = {
      width: 1.2,
      height: data.segmentCount * 0.5,
      depth: 0.4,
      normalX: data.normalX,
      normalY: data.normalY,
      normalZ: data.normalZ,
      segmentCount: data.segmentCount
    };
    
    ladderEntity.add(COMP_LADDER_COLLIDER, ladderCollider);
    ladderEntity.tag(TAG_LADDER);
    
    this.ladderEntities.set(ladderEntityId, ladderEntity);

    // Broadcast to all clients
    const msg: LadderSpawnedMessage = {
      entityId: ladderEntityId,
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      normalX: data.normalX,
      normalY: data.normalY,
      normalZ: data.normalZ,
      segmentCount: data.segmentCount
    };
    
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.LadderSpawned, msg);
    });

    console.log(`[Ladder] Ladder ${ladderEntityId} placed at (${data.posX.toFixed(2)}, ${data.posY.toFixed(2)}, ${data.posZ.toFixed(2)}) with ${data.segmentCount} segments`);
  }

  handleLadderDestroy(playerEntityId: number, data: LadderDestroyMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Ladder] Player entity not found:', playerEntityId);
      return;
    }

    const ladderEntity = this.ladderEntities.get(data.entityId);
    if (!ladderEntity) {
      console.error('[Ladder] Ladder entity not found:', data.entityId);
      return;
    }

    // Remove ladder entity
    this.world.destroyEntity(ladderEntity);
    this.ladderEntities.delete(data.entityId);

    // Broadcast to all clients
    const msg: LadderDestroyedMessage = {
      entityId: data.entityId
    };
    
    this.connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.LadderDestroyed, msg);
    });

    console.log(`[Ladder] Ladder ${data.entityId} destroyed`);
  }

  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
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
    if (this.gameStartState.phase !== 'lobby') {
      console.log('[Room] Cannot start game countdown - already in progress');
      return;
    }

    console.log('[Room] Starting 3-second game start countdown');
    this.gameStartState.phase = 'countdown';
    this.gameStartState.countdownSeconds = 3;

    // Broadcast initial countdown
    this.broadcastGameCountdown();

    // Start countdown timer
    this.gameStartState.countdownTimer = setInterval(() => {
      this.gameStartState.countdownSeconds--;
      
      if (this.gameStartState.countdownSeconds > 0) {
        this.broadcastGameCountdown();
      } else {
        // Countdown finished - transition to loading phase
        clearInterval(this.gameStartState.countdownTimer);
        this.startLoadingPhase();
      }
    }, 1000);
  }

  cancelGameCountdown(): void {
    if (this.gameStartState.phase !== 'countdown') {
      return;
    }

    console.log('[Room] Game countdown cancelled');
    if (this.gameStartState.countdownTimer) {
      clearInterval(this.gameStartState.countdownTimer);
      this.gameStartState.countdownTimer = undefined;
    }

    this.gameStartState.phase = 'lobby';
    this.gameStartState.countdownSeconds = 0;

    // Broadcast cancellation
    const connections = this.getAllConnections();
    connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.LobbyStartCancel, {});
    });
  }

  private broadcastGameCountdown(): void {
    const connections = this.getAllConnections();
    connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.LobbyStartCountdown, {
        secondsRemaining: this.gameStartState.countdownSeconds
      });
    });
  }

  private startLoadingPhase(): void {
    console.log('[Room] Starting loading phase');
    this.gameStartState.phase = 'loading';
    this.gameStartState.loadingSeconds = 10;
    this.gameStartState.readyPlayers.clear();

    // Generate final seed
    const config = this.lobbyConfig;
    const seed = config.seed || Math.random().toString(36).substring(2, 15);
    const finalSeed = `${seed}_${this.ownerId}`;
    this.gameStartState.seed = finalSeed;
    
    // Generate the level terrain, items, trees, and rocks from the seed
    // This is the same logic as initialize() for level_ rooms but done in-place
    if (!this.voxelGrid) {
      console.log(`[Room] Generating level terrain for loading phase with seed: ${finalSeed}`);
      this.voxelGrid = new VoxelGrid();
      this.voxelGrid.generateFromNoise(finalSeed);
      console.log(`[Room] Generated ${this.voxelGrid.getSolidCount()} solid voxels`);

      const occupiedCells = new Set<string>();
      this.spawnLevelPistols(finalSeed, occupiedCells, config);
      this.spawnLevelRocks(finalSeed, occupiedCells);
      this.spawnLevelTrees(finalSeed, occupiedCells);
      this.spawnLevelBushes(finalSeed, occupiedCells);
      console.log(`[Room] Level generated: ${this.treeInstances.length} trees, ${this.rockInstances.length} rocks, ${this.bushInstances.length} bushes`);
      
      // Build octree for broad-phase collision culling
      this.buildOctree();
    }

    // Broadcast game loading message to all clients
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

    // Start loading timer - always runs the full duration
    this.gameStartState.loadingTimer = setInterval(() => {
      this.gameStartState.loadingSeconds--;
      
      // Broadcast ready status update
      this.broadcastReadyUpdate();

      // Only start game when countdown reaches 0
      if (this.gameStartState.loadingSeconds <= 0) {
        clearInterval(this.gameStartState.loadingTimer);
        this.gameStartState.loadingTimer = undefined;
        this.startGame();
      }
    }, 1000);

    // Broadcast initial ready update
    this.broadcastReadyUpdate();
  }

  private broadcastReadyUpdate(): void {
    const connections = this.getAllConnections();
    connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.PlayersReadyUpdate, {
        readyPlayers: Array.from(this.gameStartState.readyPlayers),
        totalPlayers: this.players.size,
        secondsRemaining: this.gameStartState.loadingSeconds
      });
    });
  }

  handleClientReady(playerId: string): void {
    if (this.gameStartState.phase !== 'loading') {
      return;
    }

    console.log(`[Room] Player ${playerId} is ready`);
    this.gameStartState.readyPlayers.add(playerId);
    this.broadcastReadyUpdate();
    // Ready status is informational only - game always waits for the full countdown
  }

  private startGame(): void {
    console.log('[Room] Starting game - all players ready or timeout reached');
    this.gameStartState.phase = 'playing';

    // Broadcast game begin
    const connections = this.getAllConnections();
    connections.forEach(conn => {
      this.connectionHandler.sendLow(conn, Opcode.GameBegin, {});
    });

    // TODO: Spawn players at random valid locations
    // For now, the existing spawn logic in addPlayer will handle initial spawns
  }

  private hslToHex(h: number, s: number, l: number): string {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 30) % 360;
      const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * color);
    };
    const r = f(0);
    const g = f(8);
    const b = f(4);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Apply damage to an entity, prioritizing armor over health.
   * Returns the actual damage dealt to health (after armor absorption).
   */
  private applyDamageToEntity(entity: Entity, damage: number): number {
    const health = entity.get<HealthComponent>(COMP_HEALTH);
    const armor = entity.get<ArmorComponent>(COMP_ARMOR);
    
    if (!health) return 0;

    let damageToHealth = damage;
    
    // If entity has armor, armor absorbs damage first
    if (armor && armor.current > 0) {
      const damageAbsorbed = Math.min(armor.current, damage);
      armor.current = Math.max(0, armor.current - damage);
      damageToHealth = Math.max(0, damage - damageAbsorbed);
      
      console.log(`[Armor] Entity ${entity.id} absorbed ${damageAbsorbed.toFixed(1)} damage (armor: ${armor.current.toFixed(1)}/${armor.max})`);
    }
    
    // Apply remaining damage to health
    health.current = Math.max(0, health.current - damageToHealth);
    
    return damageToHealth;
  }

  getPlayerCount(): number {
    return this.players.size;
  }
  
  /** Returns true if the room is in a game-active phase (countdown/loading/playing) and should not be destroyed */
  isGameActive(): boolean {
    return this.gameStartState.phase !== 'lobby';
  }

  private startTicking() {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      this.physicsTick();
    }, 1000 / this.physicsRate);

    this.broadcastInterval = setInterval(() => {
      this.broadcastTransforms();
    }, 1000 / this.broadcastRate);

    console.log(`Room ${this.id} started: physics ${this.physicsRate}Hz, broadcast ${this.broadcastRate}Hz`);
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
    console.log(`Room ${this.id} tick stopped`);
  }

  private physicsTick() {
    // 0. Update and expire buffs
    const now = Date.now() * 0.001; // seconds
    const playerEntities = this.world.query(COMP_PLAYER);
    for (const entity of playerEntities) {
      const buffs = entity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (!buffs) continue;
      
      // Check for expired buffs
      const expiredBuffs: ActiveBuff[] = [];
      buffs.buffs = buffs.buffs.filter(buff => {
        const elapsed = now - buff.startTime;
        if (elapsed >= buff.duration) {
          expiredBuffs.push(buff);
          return false; // Remove expired buff
        }
        return true; // Keep active buff
      });
      
      // Broadcast expired buffs
      for (const expiredBuff of expiredBuffs) {
        const expireMsg: BuffExpiredMessage = {
          entityId: entity.id,
          buffType: expiredBuff.type
        };
        this.broadcastLow(Opcode.BuffExpired, expireMsg);
        console.log(`[Buff] Player ${entity.id} buff expired: ${expiredBuff.type}`);
      }
    }

    // 1. Handle stamina consumption and regeneration
    for (const entity of playerEntities) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER)!;
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      const buffs = entity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (!stamina) continue;
      
      // Check if player has infinite stamina buff
      const hasInfiniteStamina = buffs?.buffs.some(b => b.type === 'infinite_stamina') || false;

      // Check player movement and water state
      const isMoving = pc.input.forward !== 0 || pc.input.right !== 0;
      const isTryingToSprint = pc.input.sprint && isMoving && pc.state.isGrounded;
      const didJump = pc.input.jump && pc.state.isGrounded && !pc.state.hasJumped;
      
      // Water stamina mechanics
      const DEEP_WATER_THRESHOLD = 0.5;
      const isSwimming = pc.state.waterDepth > DEEP_WATER_THRESHOLD && !pc.state.isGrounded;
      const isWading = pc.state.isInWater && pc.state.isGrounded; // Walking on bottom

      // Handle exhaustion recovery
      if (stamina.isExhausted) {
        const exhaustedDuration = now - stamina.exhaustedAt;
        
        // Can only recover if grounded (land or underwater walking)
        if (pc.state.isGrounded) {
          // After being exhausted, regenerate faster until fully recovered
          stamina.current = Math.min(stamina.max, stamina.current + STAMINA.EXHAUSTED_REGEN_RATE * FIXED_TIMESTEP);
          
          // Exit exhaustion only when stamina is fully recovered (100%)
          if (stamina.current >= stamina.max) {
            stamina.isExhausted = false;
            stamina.exhaustedAt = 0;
          }
        } else if (isSwimming) {
          // Swimming while exhausted: SINK! (disable buoyancy, add downward force)
          // This is handled in stepCharacter via isExhausted flag
        }
        
        // Prevent sprinting and jumping while exhausted
        if (pc.input.sprint) pc.input.sprint = false;
        if (pc.input.jump) pc.input.jump = false;
      } else {
        // Normal stamina consumption and regeneration
        if (hasInfiniteStamina) {
          // Infinite stamina buff - keep at max
          stamina.current = stamina.max;
        } else if (isSwimming) {
          // Swimming drains stamina like sprinting
          let swimmingDrain = WATER.SWIM_STAMINA_DRAIN; // Base swimming drain (same as land sprint)
          
          if (pc.input.sprint && isMoving) {
            // Sprint while swimming = DOUBLE drain
            swimmingDrain = WATER.SWIM_SPRINT_STAMINA_DRAIN;
          } else if (!isMoving) {
            // Not moving while swimming = no drain
            swimmingDrain = 0;
          }
          
          if (swimmingDrain > 0) {
            stamina.current = Math.max(0, stamina.current - swimmingDrain * FIXED_TIMESTEP);
            
            if (stamina.current <= 0) {
              stamina.isExhausted = true;
              stamina.exhaustedAt = now;
              pc.input.sprint = false; // Stop sprinting immediately
            }
          }
          
          // NO regeneration while swimming
        } else if (isTryingToSprint) {
          // Land sprinting: Consume stamina per second
          stamina.current = Math.max(0, stamina.current - STAMINA.SPRINT_DRAIN * FIXED_TIMESTEP);
          
          if (stamina.current <= 0) {
            stamina.isExhausted = true;
            stamina.exhaustedAt = now;
            pc.input.sprint = false; // Stop sprinting immediately
          }
        } else if (didJump) {
          // Jumping costs stamina instantly (significant investment)
          stamina.current = Math.max(0, stamina.current - STAMINA.JUMP_COST);
          
          if (stamina.current <= 0) {
            stamina.isExhausted = true;
            stamina.exhaustedAt = now;
            pc.input.jump = false; // Cancel jump
          }
        } else if (pc.state.isGrounded) {
          // Regenerate stamina per second when grounded (land OR underwater walking)
          stamina.current = Math.min(stamina.max, stamina.current + STAMINA.REGEN_RATE * FIXED_TIMESTEP);
        }
        // Note: No regen when in air (jumping) or swimming (not grounded)
      }
    }

    // 2. Build unified CollisionWorld (once per physics tick, reused for all entities)
    const blockColliders = this.collectBlockColliders();

    // Build unified collision world (optional - for future optimization)
    // For now, we still pass individual parameters to stepCharacter for compatibility
    // const collisionWorld = buildCollisionWorld({
    //   voxelGrid: this.voxelGrid,
    //   treeColliders: this.treeColliders,
    //   rockColliderMeshes: this.rockColliderMeshes,
    //   blockColliders
    // });

    // 3. Tick all player character controllers
    // Each player processes exactly one queued input per tick, maintaining
    // 1:1 correspondence with client physics steps for prediction accuracy.
    for (const entity of playerEntities) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER)!;
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      const queue = pc.inputQueue!;

      // Pop the next input from the queue (one per tick)
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
      // If queue is empty, reuse last input (player continues same movement).
      // lastProcessedInput stays unchanged so the client doesn't over-prune.
      
      // Sync exhaustion state to physics state (needed for sinking mechanic)
      if (stamina) {
        pc.state.isExhausted = stamina.isExhausted;
      }
      
      // Apply speed modifier if exhausted (half speed)
      if (stamina && stamina.isExhausted) {
        pc.input.sprint = false;
      }
      
      // Query octree for nearby colliders (broad-phase culling)
      let filteredTrees = this.treeColliderMeshes;
      let filteredRocks = this.rockColliderMeshes;
      
      if (this.octree) {
        const nearby = this.octree.queryPoint(pc.state.posX, pc.state.posY, pc.state.posZ, 8);
        filteredTrees = nearby.filter((e: any) => e.type === 'tree').map((e: any) => e.data);
        filteredRocks = nearby.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
      }
      
      stepCharacter(pc.state, pc.input, FIXED_TIMESTEP, this.voxelGrid, filteredTrees, filteredRocks, blockColliders, this.waterLevelProvider);
      
      // If exhausted, apply speed reduction after physics step
      if (stamina && stamina.isExhausted) {
        pc.state.velX *= 0.5;
        pc.state.velZ *= 0.5;
      }

      // Apply drowning damage if breath is depleted
      const health = entity.get<HealthComponent>(COMP_HEALTH);
      if (health && pc.state.breathRemaining <= 0 && pc.state.isHeadUnderwater) {
        const drowningDamage = WATER.DROWNING_DAMAGE * FIXED_TIMESTEP;
        const oldHealth = health.current;
        health.current = Math.max(0, health.current - drowningDamage);

        // Broadcast damage event
        const damageMsg: EntityDamageMessage = {
          entityId: entity.id,
          damage: drowningDamage,
          newHealth: health.current,
          attackerId: 0 // No attacker for drowning
        };
        this.broadcastLow(Opcode.EntityDamage, damageMsg);

        // Check death from drowning
        if (health.current <= 0 && oldHealth > 0) {
          const deathMsg: EntityDeathMessage = {
            entityId: entity.id,
            killerId: 0 // No killer for drowning (suicide)
          };
          this.broadcastLow(Opcode.EntityDeath, deathMsg);

          // Update round scores if active (drowning counts as suicide)
          if (this.roundState.phase === 'active') {
            this.handleKill(0, entity.id);
            this.checkWinCondition();
          }

          // Respawn
          const spawnPos = this.findValidSpawnPosition();
          pc.state.posX = spawnPos.x;
          pc.state.posY = spawnPos.y;
          pc.state.posZ = spawnPos.z;
          pc.state.velX = 0;
          pc.state.velY = 0;
          pc.state.velZ = 0;
          pc.state.isInWater = false;
          pc.state.isHeadUnderwater = false;
          pc.state.breathRemaining = 10.0;
          pc.state.waterDepth = 0;
          pc.inputQueue!.length = 0;
          health.current = health.max;
        }
      }
    }

    // 3. Update reload state for players with weapons
    for (const entity of playerEntities) {
      const ammo = entity.get<AmmoComponent>(COMP_AMMO);
      if (ammo && ammo.isReloading) {
        const elapsed = now - ammo.reloadStartTime;
        if (elapsed >= ammo.reloadTime) {
          // Reload complete
          ammo.current = ammo.capacity;
          ammo.isReloading = false;
          ammo.reloadStartTime = 0;
        }
      }
    }

    // 1b. Resolve player-vs-player collisions (prevent players from overlapping)
    const playerArray = Array.from(playerEntities);
    for (let i = 0; i < playerArray.length; i++) {
      const entity1 = playerArray[i];
      const pc1 = entity1.get<PlayerComponent>(COMP_PLAYER)!;
      
      for (let j = i + 1; j < playerArray.length; j++) {
        const entity2 = playerArray[j];
        const pc2 = entity2.get<PlayerComponent>(COMP_PLAYER)!;
        
        // Check capsule collision in XZ plane
        const result = capsuleVsCapsule(
          pc1.state.posX, pc1.state.posZ,
          pc2.state.posX, pc2.state.posZ,
          PLAYER_CAPSULE_RADIUS,
          PLAYER_CAPSULE_RADIUS
        );
        
        if (result.colliding) {
          // Push both players apart (equal and opposite)
          pc1.state.posX += result.pushX;
          pc1.state.posZ += result.pushZ;
          pc2.state.posX -= result.pushX;
          pc2.state.posZ -= result.pushZ;
          
          // Zero out velocity in the collision direction to prevent sticking
          const dx = pc2.state.posX - pc1.state.posX;
          const dz = pc2.state.posZ - pc1.state.posZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0.001) {
            const nx = dx / dist;
            const nz = dz / dist;
            
            // Project velocities onto collision normal and zero them out
            const vel1Dot = pc1.state.velX * nx + pc1.state.velZ * nz;
            const vel2Dot = pc2.state.velX * nx + pc2.state.velZ * nz;
            
            if (vel1Dot > 0) { // Moving toward player 2
              pc1.state.velX -= nx * vel1Dot;
              pc1.state.velZ -= nz * vel1Dot;
            }
            if (vel2Dot < 0) { // Moving toward player 1
              pc2.state.velX -= nx * vel2Dot;
              pc2.state.velZ -= nz * vel2Dot;
            }
          }
        }
      }
    }

    // 2. Tick all projectiles with swept collision detection
    const projectileEntities = this.world.query(COMP_PROJECTILE);
    const killableEntities = this.world.queryTag(TAG_KILLABLE);
    const toDestroy: number[] = [];

    for (const entity of projectileEntities) {
      const proj = entity.get<ProjectileComponent>(COMP_PROJECTILE)!;

      // Skip expired projectiles
      if (proj.lifetime <= 0) {
        toDestroy.push(entity.id);
        continue;
      }

      // Advance projectile
      stepProjectile(proj, FIXED_TIMESTEP);

      // ARMA-style optimization: Only check collision every N ticks
      proj.tickCounter++;
      const shouldCheckCollision = (proj.tickCounter % PROJECTILE_COLLISION_INTERVAL) === 0;
      
      if (!shouldCheckCollision) {
        continue; // Skip collision checks this tick (just move the projectile)
      }

      // Calculate total movement since LAST collision check (not just last tick)
      // This ensures we sweep through all movement, even when checking every N ticks
      const prevCheckX = proj.lastCollisionCheckX;
      const prevCheckY = proj.lastCollisionCheckY;
      const prevCheckZ = proj.lastCollisionCheckZ;
      
      const totalDirX = proj.posX - prevCheckX;
      const totalDirY = proj.posY - prevCheckY;
      const totalDirZ = proj.posZ - prevCheckZ;
      const totalLength = Math.sqrt(totalDirX * totalDirX + totalDirY * totalDirY + totalDirZ * totalDirZ);

      // Skip if projectile didn't move (shouldn't happen, but safety check)
      if (totalLength < 0.0001) {
        // Still update last collision check position
        proj.lastCollisionCheckX = proj.posX;
        proj.lastCollisionCheckY = proj.posY;
        proj.lastCollisionCheckZ = proj.posZ;
        continue;
      }

      // Substep collision: divide movement into smaller segments for accuracy with fast projectiles
      let hitOccurred = false;
      for (let substep = 0; substep < PROJECTILE_SUBSTEPS && !hitOccurred; substep++) {
        const t0 = substep / PROJECTILE_SUBSTEPS;
        const t1 = (substep + 1) / PROJECTILE_SUBSTEPS;
        
        const stepStartX = prevCheckX + totalDirX * t0;
        const stepStartY = prevCheckY + totalDirY * t0;
        const stepStartZ = prevCheckZ + totalDirZ * t0;
        
        const stepEndX = prevCheckX + totalDirX * t1;
        const stepEndY = prevCheckY + totalDirY * t1;
        const stepEndZ = prevCheckZ + totalDirZ * t1;
        
        const rayDirX = stepEndX - stepStartX;
        const rayDirY = stepEndY - stepStartY;
        const rayDirZ = stepEndZ - stepStartZ;
        const rayLength = Math.sqrt(rayDirX * rayDirX + rayDirY * rayDirY + rayDirZ * rayDirZ);
        
        if (rayLength < 0.0001) continue;
        
        const rayDirNormX = rayDirX / rayLength;
        const rayDirNormY = rayDirY / rayLength;
        const rayDirNormZ = rayDirZ / rayLength;

      // Check voxel collision first (if level has terrain)
      if (this.voxelGrid) {
        const voxelHit = rayVsVoxelGrid(
          this.voxelGrid,
          stepStartX, stepStartY, stepStartZ,
          rayDirNormX, rayDirNormY, rayDirNormZ,
          rayLength
        );
        if (voxelHit.hit) {
          console.log(`[Projectile] Hit terrain! proximityRadius=${proj.proximityRadius}`);
          // Hit terrain, check for proximity/AOE damage
          if (proj.proximityRadius && proj.proximityRadius > 0) {
            console.log(`[Projectile] Applying proximity damage!`);
            this.applyProximityDamage(
              proj.posX, proj.posY, proj.posZ,
              proj.proximityRadius,
              proj.baseDamage,
              proj.distanceTraveled,
              proj.ownerId,
              killableEntities
            );
          }
          
          // Destroy projectile
          toDestroy.push(entity.id);
          hitOccurred = true;
          break; // Exit substep loop
        }
      } else {
        // For rooms without voxel grid (shooting range), check ground plane collision
        // Ground plane at y = -0.5
        const groundY = -0.5;
        if (stepStartY > groundY && stepEndY <= groundY && rayDirNormY < 0) {
          // Calculate intersection point with ground plane
          const t = (groundY - stepStartY) / rayDirNormY;
          const hitX = stepStartX + rayDirNormX * t;
          const hitZ = stepStartZ + rayDirNormZ * t;
          
          console.log(`[Projectile] Hit ground plane at (${hitX.toFixed(2)}, ${groundY}, ${hitZ.toFixed(2)})! proximityRadius=${proj.proximityRadius}`);
          
          // Check for proximity/AOE damage
          if (proj.proximityRadius && proj.proximityRadius > 0) {
            console.log(`[Projectile] Applying proximity damage!`);
            this.applyProximityDamage(
              hitX, groundY, hitZ,
              proj.proximityRadius,
              proj.baseDamage,
              proj.distanceTraveled,
              proj.ownerId,
              killableEntities
            );
          }
          
          // Destroy projectile
          toDestroy.push(entity.id);
          hitOccurred = true;
          break; // Exit substep loop
        }
      }

      // ARMA-style optimization: Skip tree collision (bullets pass through)
      // Trees are decorative - checking collision is expensive and not worth it

      // Check rock collision using octree ray query (broad-phase culling)
      let rocksToCheck = this.rockColliderMeshes;
      
      if (this.octree) {
        const nearbyEntries = this.octree.queryRay(stepStartX, stepStartY, stepStartZ, rayDirNormX, rayDirNormY, rayDirNormZ, rayLength);
        rocksToCheck = nearbyEntries.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
      }
      
      for (const rockData of rocksToCheck) {
        const rockHit = rayVsTriangleMesh(
          [stepStartX, stepStartY, stepStartZ],
          [rayDirNormX, rayDirNormY, rayDirNormZ],
          rockData.mesh,
          rockData.transform,
          rayLength
        );
        if (rockHit.hit) {
          // Hit rock, check for proximity/AOE damage
          if (proj.proximityRadius && proj.proximityRadius > 0) {
            this.applyProximityDamage(
              proj.posX, proj.posY, proj.posZ,
              proj.proximityRadius,
              proj.baseDamage,
              proj.distanceTraveled,
              proj.ownerId,
              killableEntities
            );
          }
          
          toDestroy.push(entity.id);
          hitOccurred = true;
          break; // Exit rock loop
        }
      }
      
      if (hitOccurred) break; // Exit substep loop

      // Check swept collision against all killable entities
      // Spatial optimization: Only check players within 50 units
      const PLAYER_CHECK_DISTANCE = 50;
      for (const targetEntity of killableEntities) {
        // Don't hit the shooter
        if (targetEntity.id === proj.ownerId) continue;
        
        const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
        if (!pc) continue;
        
        // Quick spatial check: skip players that are far away
        const distX = proj.posX - pc.state.posX;
        const distZ = proj.posZ - pc.state.posZ;
        const distSq = distX * distX + distZ * distZ;
        
        if (distSq > PLAYER_CHECK_DISTANCE * PLAYER_CHECK_DISTANCE) {
          continue; // Player is too far, skip collision check
        }

        // Player body hitbox center
        const bx = pc.state.posX;
        const by = pc.state.posY; // posY is already the hitbox center
        const bz = pc.state.posZ;

        // Check HEAD hitbox first (priority for headshots)
        const headY = by + 0.8; // Head positioned above body center (matches client at +0.8)
        const headHalfSize = 0.3; // Head is 0.6x0.6x0.6 cube
        const headResult = rayVsAABB(
          stepStartX, stepStartY, stepStartZ,
          rayDirNormX, rayDirNormY, rayDirNormZ,
          rayLength,
          bx, headY, bz,
          headHalfSize
        );

        if (headResult.hit) {
          // HEADSHOT! Apply configurable damage multiplier with distance falloff
          const headshotMultiplier = this.lobbyConfig.headshotDmg ?? 2.0;
          const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
          if (health) {
            // Damage falloff: 100% at 0-20m, 75% at 40m, 50% at 60m, 30% at 80m+
            let damageMult = 1.0;
            if (proj.distanceTraveled > 20) {
              damageMult = Math.max(0.3, 1.0 - (proj.distanceTraveled - 20) * 0.0125);
            }
            const finalDamage = proj.baseDamage * damageMult;
            
            // Check if player has helmet - helmet negates headshot multiplier and absorbs up to 20 HP
            const helmet = targetEntity.get<HelmetComponent>(COMP_HELMET);
            let actualDamage: number;
            
            if (helmet && helmet.hasHelmet && helmet.helmetHealth > 0) {
              // Helmet negates the headshot multiplier, so treat as normal damage
              const damageAfterNegation = finalDamage;
              
              // Helmet absorbs damage up to its remaining health
              const helmetAbsorbed = Math.min(helmet.helmetHealth, damageAfterNegation);
              helmet.helmetHealth = Math.max(0, helmet.helmetHealth - damageAfterNegation);
              actualDamage = Math.max(0, damageAfterNegation - helmetAbsorbed);
              
              // Helmet breaks if health reaches 0
              if (helmet.helmetHealth <= 0) {
                helmet.hasHelmet = false;
                console.log(`[Helmet] Entity ${targetEntity.id} helmet absorbed ${helmetAbsorbed.toFixed(1)} damage and broke`);
              } else {
                console.log(`[Helmet] Entity ${targetEntity.id} helmet absorbed ${helmetAbsorbed.toFixed(1)} damage (${helmet.helmetHealth}/${helmet.maxHelmetHealth} remaining)`);
              }
            } else {
              // No helmet - apply headshot multiplier
              actualDamage = finalDamage * headshotMultiplier;
            }
            
            // Headshots bypass armor and go straight to health
            health.current = Math.max(0, health.current - actualDamage);

            // Track shot hit and damage dealt
            this.trackShotHit(proj.ownerId);
            this.trackDamage(proj.ownerId, actualDamage);
            
            // Broadcast damage
            const dmgMsg: EntityDamageMessage = {
              entityId: targetEntity.id,
              damage: actualDamage,
              newHealth: health.current,
              attackerId: proj.ownerId
            };
            this.broadcastLow(Opcode.EntityDamage, dmgMsg);
            
            console.log(`[Headshot] Entity ${targetEntity.id} took ${actualDamage.toFixed(1)} damage (bypassed armor)`);


            // Check death
            if (health.current <= 0) {
              // Drop weapon at death position
              this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);

              const deathMsg: EntityDeathMessage = {
                entityId: targetEntity.id,
                killerId: proj.ownerId
              };
              this.broadcastLow(Opcode.EntityDeath, deathMsg);
              
              // Update round scores if active
              if (this.roundState.phase === 'active') {
                this.handleKill(proj.ownerId, targetEntity.id, proj.weaponType, true); // isHeadshot = true
                this.checkWinCondition();
              }

              // Respawn
              const spawnPos = this.findValidSpawnPosition();
              pc.state.posX = spawnPos.x;
              pc.state.posY = spawnPos.y;
              pc.state.posZ = spawnPos.z;
              pc.state.velX = 0;
              pc.state.velY = 0;
              pc.state.velZ = 0;
              pc.state.isInWater = false;
              pc.state.isHeadUnderwater = false;
              pc.state.breathRemaining = 10.0;
              pc.state.waterDepth = 0;
              pc.inputQueue!.length = 0;
              health.current = health.max;
            }
          }
          
          // Check for proximity/AOE damage
          if (proj.proximityRadius && proj.proximityRadius > 0) {
            this.applyProximityDamage(
              proj.posX, proj.posY, proj.posZ,
              proj.proximityRadius,
              proj.baseDamage,
              proj.distanceTraveled,
              proj.ownerId,
              killableEntities
            );
          }
          
          // Destroy projectile
          toDestroy.push(entity.id);
          hitOccurred = true;
          break; // Stop checking other targets
        }

        // Check BODY hitbox (1.0 tall cube centered at posY)
        const bodyResult = rayVsAABB(
          stepStartX, stepStartY, stepStartZ,
          rayDirNormX, rayDirNormY, rayDirNormZ,
          rayLength,
          bx, by, bz,
          PLAYER_HITBOX_HALF
        );

        if (bodyResult.hit) {
          // Body hit! Apply configurable damage multiplier with distance falloff
          const normalMultiplier = this.lobbyConfig.normalDmg ?? 1.0;
          const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
          if (health) {
            // Damage falloff: 100% at 0-20m, 75% at 40m, 50% at 60m, 30% at 80m+
            let damageMult = 1.0;
            if (proj.distanceTraveled > 20) {
              damageMult = Math.max(0.3, 1.0 - (proj.distanceTraveled - 20) * 0.0125);
            }
            const finalDamage = proj.baseDamage * damageMult * normalMultiplier;
            
            // Apply damage (armor absorbs first)
            this.applyDamageToEntity(targetEntity, finalDamage);

            // Track shot hit and damage dealt
            this.trackShotHit(proj.ownerId);
            this.trackDamage(proj.ownerId, finalDamage);
            
            // Broadcast damage (use finalDamage for accurate display)
            const dmgMsg: EntityDamageMessage = {
              entityId: targetEntity.id,
              damage: finalDamage,
              newHealth: health.current,
              attackerId: proj.ownerId
            };
            this.broadcastLow(Opcode.EntityDamage, dmgMsg);

            // Check death
            if (health.current <= 0) {
              // Drop weapon at death position
              this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);

              const deathMsg: EntityDeathMessage = {
                entityId: targetEntity.id,
                killerId: proj.ownerId
              };
              this.broadcastLow(Opcode.EntityDeath, deathMsg);

              // Update round scores if active
              if (this.roundState.phase === 'active') {
                this.handleKill(proj.ownerId, targetEntity.id, proj.weaponType, false); // isHeadshot = false
                this.checkWinCondition();
              }

              // Respawn: reset health and position
              health.current = health.max;
              const spawnPos = this.findValidSpawnPosition();
              pc.state.posX = spawnPos.x;
              pc.state.posY = spawnPos.y;
              pc.state.posZ = spawnPos.z;
              pc.state.velX = 0;
              pc.state.velY = 0;
              pc.state.velZ = 0;
              pc.state.isInWater = false;
              pc.state.isHeadUnderwater = false;
              pc.state.breathRemaining = 10.0;
              pc.state.waterDepth = 0;
              pc.inputQueue!.length = 0;
            }
          }
          
          // Check for proximity/AOE damage (body hit)
          if (proj.proximityRadius && proj.proximityRadius > 0) {
            this.applyProximityDamage(
              proj.posX, proj.posY, proj.posZ,
              proj.proximityRadius,
              proj.baseDamage,
              proj.distanceTraveled,
              proj.ownerId,
              killableEntities
            );
          }

          // Destroy this projectile
          toDestroy.push(entity.id);
          hitOccurred = true;
          break; // One hit per projectile
        }
      }
      
      // Exit substep loop if hit occurred
      if (hitOccurred) break;
      } // End of substep loop
      
      // Update last collision check position for next time (whether hit or miss)
      proj.lastCollisionCheckX = proj.posX;
      proj.lastCollisionCheckY = proj.posY;
      proj.lastCollisionCheckZ = proj.posZ;
    }

    // 3. Destroy projectiles and broadcast
    for (const id of toDestroy) {
      const buffer = encodeProjectileDestroy(Opcode.ProjectileDestroy, { entityId: id });
      this.connectionHandler.broadcast(this.getAllConnections(), buffer);
      this.world.destroyEntity(id);
    }

    // 4. Tick all collectable items (gravity + ground collision)
    const collectableEntities = this.world.query(COMP_PHYSICS);
    const itemsToPickup: { itemId: number; playerId: number; connectionId: string }[] = [];

    for (const entity of collectableEntities) {
      const physics = entity.get<PhysicsComponent>(COMP_PHYSICS)!;
      const justSettled = stepCollectable(physics, FIXED_TIMESTEP, this.voxelGrid, this.treeColliderMeshes, this.rockColliderMeshes, blockColliders);
      this.upsertPickupGrid(entity.id, physics.posX, physics.posZ);

      // Broadcast position update (low-freq JSON)
      if (!physics.onGround || justSettled) {
        const update: ItemUpdateMessage = {
          entityId: entity.id,
          posX: physics.posX,
          posY: physics.posY,
          posZ: physics.posZ,
          settled: physics.onGround
        };
        this.broadcastLow(Opcode.ItemUpdate, update);
      }
    }

    // Check pickup proximity using spatial grid
    const PICKUP_RANGE = 1.5;
    const scheduledItems = new Set<number>();
    for (const playerEntity of playerEntities) {
      const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;

      // Skip players who already have a weapon
      const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
      if (collected && collected.items.length > 0) continue;

      const nearbyItems = this.queryPickupGrid(pc.state.posX, pc.state.posZ, PICKUP_RANGE);
      for (const itemId of nearbyItems) {
        if (scheduledItems.has(itemId)) continue;
        const itemEntity = this.world.getEntity(itemId);
        if (!itemEntity) continue;

        const physics = itemEntity.get<PhysicsComponent>(COMP_PHYSICS);
        if (!physics) continue;

        const dx = pc.state.posX - physics.posX;
        const dy = pc.state.posY - physics.posY;
        const dz = pc.state.posZ - physics.posZ;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= PICKUP_RANGE * PICKUP_RANGE) {
          itemsToPickup.push({
            itemId: itemEntity.id,
            playerId: playerEntity.id,
            connectionId: pc.connectionId
          });
          scheduledItems.add(itemId);
        }
      }
    }

    // Process pickups
    for (const pickup of itemsToPickup) {
      const playerEntity = this.world.getEntity(pickup.playerId);
      if (!playerEntity) continue;

      const itemEntity = this.world.getEntity(pickup.itemId);
      if (!itemEntity) continue;

      // Check if this is a pickup effect item (health pack, etc.)
      const pickupEffect = itemEntity.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
      
      if (pickupEffect) {
        // This is a consumable pickup - apply effect immediately
        if (pickupEffect.type === 'health') {
          const health = playerEntity.get<HealthComponent>(COMP_HEALTH);
          if (health) {
            const oldHealth = health.current;
            health.current = Math.min(health.max, health.current + pickupEffect.value);
            console.log(`[Pickup] Player ${pickup.playerId} gained ${pickupEffect.value} health (${oldHealth} -> ${health.current})`);
            
            // Broadcast health change as damage message (negative damage = healing)
            const dmgMsg: EntityDamageMessage = {
              entityId: pickup.playerId,
              damage: -(health.current - oldHealth), // Negative for healing
              newHealth: health.current,
              attackerId: pickup.playerId
            };
            this.broadcastLow(Opcode.EntityDamage, dmgMsg);
          }
        } else if (pickupEffect.type === 'stamina') {
          const stamina = playerEntity.get<StaminaComponent>(COMP_STAMINA);
          if (stamina) {
            const oldStamina = stamina.current;
            stamina.current = Math.min(stamina.max, stamina.current + pickupEffect.value);
            
            // If was exhausted and now above threshold, exit exhaustion
            if (stamina.isExhausted && stamina.current >= stamina.max) {
              stamina.isExhausted = false;
              stamina.exhaustedAt = 0;
            }
            
            console.log(`[Pickup] Player ${pickup.playerId} gained ${pickupEffect.value} stamina (${oldStamina} -> ${stamina.current})`);
          }
        } else if (pickupEffect.type === 'buff' && pickupEffect.buffType && pickupEffect.buffDuration) {
          // Apply a timed buff effect
          const stamina = playerEntity.get<StaminaComponent>(COMP_STAMINA);
          const buffs = playerEntity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
          
          // Instant stamina restore
          if (stamina) {
            stamina.current = Math.min(stamina.max, stamina.current + pickupEffect.value);
            
            // Exit exhaustion if fully restored
            if (stamina.isExhausted && stamina.current >= stamina.max) {
              stamina.isExhausted = false;
              stamina.exhaustedAt = 0;
            }
          }
          
          // Add buff to active buffs
          if (buffs) {
            const newBuff: ActiveBuff = {
              type: pickupEffect.buffType,
              startTime: now,
              duration: pickupEffect.buffDuration
            };
            buffs.buffs.push(newBuff);
            
            // Broadcast buff applied
            const buffMsg: BuffAppliedMessage = {
              entityId: pickup.playerId,
              buffType: pickupEffect.buffType,
              duration: pickupEffect.buffDuration
            };
            this.broadcastLow(Opcode.BuffApplied, buffMsg);
            
            console.log(`[Pickup] Player ${pickup.playerId} gained buff: ${pickupEffect.buffType} for ${pickupEffect.buffDuration}s`);
          }
        } else if (pickupEffect.type === 'armor_pickup') {
          const armor = playerEntity.get<ArmorComponent>(COMP_ARMOR);
          if (armor) {
            const oldArmor = armor.current;
            armor.current = Math.min(armor.max, armor.current + pickupEffect.value);
            
            console.log(`[Pickup] Player ${pickup.playerId} gained ${pickupEffect.value} armor (${oldArmor} -> ${armor.current})`);
          }
        } else if (pickupEffect.type === 'helmet_pickup') {
          const helmet = playerEntity.get<HelmetComponent>(COMP_HELMET);
          if (helmet) {
            helmet.equipped = true;
            helmet.health = helmet.maxHealth;
            console.log(`[Pickup] Player ${pickup.playerId} equipped helmet (20 HP headshot protection)`);
          }
        }
        
        // Broadcast pickup to all clients (for visual/audio feedback)
        const pickupMsg: ItemPickupMessage = {
          entityId: pickup.itemId,
          playerId: pickup.playerId,
          itemType: 'medic_pack'
        };
        this.broadcastLow(Opcode.ItemPickup, pickupMsg);
        
        // Remove the pickup entity from the world
        this.removePickupFromGrid(pickup.itemId);
        this.world.destroyEntity(pickup.itemId);
        
        console.log(`Player entity ${pickup.playerId} picked up consumable ${pickup.itemId}`);
      } else {
        // This is a weapon - copy components to player
        const itemShootable = itemEntity.get<ShootableComponent>(COMP_SHOOTABLE);
        const itemAmmo = itemEntity.get<AmmoComponent>(COMP_AMMO);
        const itemWeaponType = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
        
        if (itemShootable && itemAmmo) {
          // Add weapon components to player
          playerEntity.add(COMP_SHOOTABLE, {
            damage: itemShootable.damage,
            fireRate: itemShootable.fireRate,
            projectileSpeed: itemShootable.projectileSpeed,
            lastFireTime: itemShootable.lastFireTime,
            accuracy: itemShootable.accuracy,
            gravityStartDistance: itemShootable.gravityStartDistance,
            pelletsPerShot: itemShootable.pelletsPerShot,
            proximityRadius: itemShootable.proximityRadius
          });
          playerEntity.add(COMP_AMMO, {
            current: itemAmmo.current,
            max: itemAmmo.max,
            capacity: itemAmmo.capacity,
            reloadTime: itemAmmo.reloadTime,
            isReloading: itemAmmo.isReloading,
            reloadStartTime: itemAmmo.reloadStartTime,
            infinite: itemAmmo.infinite
          });
          if (itemWeaponType) {
            playerEntity.add(COMP_WEAPON_TYPE, {
              type: itemWeaponType.type
            });
          }
        }

        const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
        if (collected) {
          collected.items.push(pickup.itemId);
        }

        // Broadcast pickup to all clients
        const pickupMsg: ItemPickupMessage = {
          entityId: pickup.itemId,
          playerId: pickup.playerId,
          itemType: itemWeaponType?.type || 'pistol'
        };
        this.broadcastLow(Opcode.ItemPickup, pickupMsg);

        // Remove the item entity from the world
        this.removePickupFromGrid(pickup.itemId);
        this.world.destroyEntity(pickup.itemId);

        console.log(`Player entity ${pickup.playerId} picked up weapon ${pickup.itemId}`);
      }
    }

    // 5. Step Havok scene for future environment physics
    this.scene.render();
  }

  private broadcastTransforms() {
    const connections = this.getAllConnections();
    if (connections.length === 0) return;

    // Broadcast player transforms
    const playerEntities = this.world.query(COMP_PLAYER);
    for (const entity of playerEntities) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER)!;
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
      this.connectionHandler.broadcast(connections, buffer);
      
      // Get or create cache entry for this entity
      let cache = this.lastBroadcastCache.get(entity.id);
      if (!cache) {
        cache = {};
        this.lastBroadcastCache.set(entity.id, cache);
      }
      
      // Broadcast stamina for this player (only if changed)
      const stamina = entity.get<StaminaComponent>(COMP_STAMINA);
      if (stamina && (cache.stamina !== stamina.current || cache.isExhausted !== stamina.isExhausted)) {
        cache.stamina = stamina.current;
        cache.isExhausted = stamina.isExhausted;
        const staminaMsg: StaminaUpdateMessage = {
          entityId: entity.id,
          stamina: stamina.current,
          isExhausted: stamina.isExhausted
        };
        this.broadcastLow(Opcode.StaminaUpdate, staminaMsg);
      }

      // Broadcast armor for this player (only if changed)
      const armor = entity.get<ArmorComponent>(COMP_ARMOR);
      if (armor && cache.armor !== armor.current) {
        cache.armor = armor.current;
        const armorMsg: ArmorUpdateMessage = {
          entityId: entity.id,
          armor: armor.current
        };
        this.broadcastLow(Opcode.ArmorUpdate, armorMsg);
      }

      // Broadcast helmet for this player (only if changed)
      const helmet = entity.get<HelmetComponent>(COMP_HELMET);
      if (helmet && (cache.hasHelmet !== helmet.equipped || cache.helmetHealth !== helmet.health)) {
        cache.hasHelmet = helmet.equipped;
        cache.helmetHealth = helmet.health;
        const helmetMsg: HelmetUpdateMessage = {
          entityId: entity.id,
          hasHelmet: helmet.equipped,
          helmetHealth: helmet.health
        };
        this.broadcastLow(Opcode.HelmetUpdate, helmetMsg);
      }
    }

  }

  // ══════════════════════════════════════════════════════════════
  // Round System Methods
  // ══════════════════════════════════════════════════════════════

  private checkRoundStart(): void {
    if (this.roundState.phase !== 'waiting') return;
    
    const playerCount = this.world.query(COMP_PLAYER).length;
    if (playerCount >= this.roundState.config.minPlayers) {
      this.startCountdown();
    }
  }

  private startCountdown(): void {
    this.roundState.phase = 'countdown';
    this.roundState.countdownSeconds = 5;
    
    this.broadcastRoundState();
    
    this.roundState.countdownTimer = setInterval(() => {
      this.roundState.countdownSeconds--;
      this.broadcastRoundState();
      
      if (this.roundState.countdownSeconds <= 0) {
        if (this.roundState.countdownTimer) {
          clearInterval(this.roundState.countdownTimer);
        }
        this.startRound();
      }
    }, 1000);
  }

  private startRound(): void {
    this.roundState.phase = 'active';
    this.roundState.roundStartTime = Date.now();
    
    // Initialize scores for all current players
    this.roundState.scores.clear();
    for (const entity of this.world.query(COMP_PLAYER)) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (pc) {
        this.roundState.scores.set(entity.id, {
          entityId: entity.id,
          name: `Player ${entity.id}`,
          kills: 0,
          deaths: 0,
        });
      }
    }
    
    // Reset all player health
    for (const entity of this.world.query(COMP_PLAYER, COMP_HEALTH)) {
      const health = entity.get<HealthComponent>(COMP_HEALTH);
      if (health) {
        health.current = health.max;
      }
    }
    
    this.broadcastRoundState();
    console.log(`[Round] Round started with ${this.roundState.scores.size} players`);
  }

  private handleKill(killerId: number, victimId: number, weaponType: string | null = null, isHeadshot: boolean = false): void {
    const killerEntity = this.world.getEntity(killerId);
    const victimEntity = this.world.getEntity(victimId);
    
    // Update StatsComponent for killer and victim
    if (killerEntity && victimEntity) {
      const killerStats = killerEntity.get<StatsComponent>(COMP_STATS);
      const victimStats = victimEntity.get<StatsComponent>(COMP_STATS);
      
      if (killerStats) {
        killerStats.kills++;
      }
      if (victimStats) {
        victimStats.deaths++;
      }
      
      // If weapon type not provided, try to get it from killer's current weapon
      if (!weaponType) {
        const killerCollected = killerEntity.get<CollectedComponent>(COMP_COLLECTED);
        if (killerCollected && killerCollected.items.length > 0) {
          const weaponEntity = this.world.getEntity(killerCollected.items[0]);
          if (weaponEntity) {
            const weaponTypeComp = weaponEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
            if (weaponTypeComp) {
              weaponType = weaponTypeComp.type;
            }
          }
        }
      }
      
      // Get player colors
      const killerPlayer = Array.from(this.players.values()).find(p => p.entityId === killerId);
      const victimPlayer = Array.from(this.players.values()).find(p => p.entityId === victimId);
      
      // Broadcast kill feed message
      if (killerPlayer && victimPlayer) {
        const killFeedMsg: KillFeedMessage = {
          killerEntityId: killerId,
          killerColor: killerPlayer.color,
          victimEntityId: victimId,
          victimColor: victimPlayer.color,
          weaponType: weaponType,
          isHeadshot: isHeadshot,
          timestamp: Date.now()
        };
        console.log(`[KillFeed] Broadcasting kill: Player#${killerId} → Player#${victimId}, Weapon: ${weaponType}, Headshot: ${isHeadshot}`);
        this.broadcastLow(Opcode.KillFeed, killFeedMsg);
      }
    }
    
    // Update killer's kills in round scores (for game mode system)
    const killerScore = this.roundState.scores.get(killerId);
    if (killerScore) {
      killerScore.kills++;
      const scoreMsg: ScoreUpdateMessage = {
        entityId: killerId,
        kills: killerScore.kills,
        deaths: killerScore.deaths,
      };
      this.broadcastLow(Opcode.ScoreUpdate, scoreMsg);
      console.log(`[Round] ${killerScore.name} now has ${killerScore.kills} kills`);
    }
    
    // Update victim's deaths in round scores
    const victimScore = this.roundState.scores.get(victimId);
    if (victimScore) {
      victimScore.deaths++;
      const scoreMsg: ScoreUpdateMessage = {
        entityId: victimId,
        kills: victimScore.kills,
        deaths: victimScore.deaths,
      };
      this.broadcastLow(Opcode.ScoreUpdate, scoreMsg);
    }
  }

  private trackDamage(attackerId: number, damage: number): void {
    const attackerEntity = this.world.getEntity(attackerId);
    if (attackerEntity) {
      const stats = attackerEntity.get<StatsComponent>(COMP_STATS);
      if (stats) {
        stats.damageDealt += damage;
      }
    }
  }

  private trackShotFired(shooterId: number): void {
    const shooterEntity = this.world.getEntity(shooterId);
    if (shooterEntity) {
      const stats = shooterEntity.get<StatsComponent>(COMP_STATS);
      if (stats) {
        stats.shotsFired++;
      }
    }
  }

  private trackShotHit(shooterId: number): void {
    const shooterEntity = this.world.getEntity(shooterId);
    if (shooterEntity) {
      const stats = shooterEntity.get<StatsComponent>(COMP_STATS);
      if (stats) {
        stats.shotsHit++;
      }
    }
  }

  private checkWinCondition(): void {
    if (this.roundState.phase !== 'active') return;
    
    const scores = Array.from(this.roundState.scores.values());
    const topScore = Math.max(...scores.map(s => s.kills), 0);
    
    // Check score limit
    if (topScore >= this.roundState.config.scoreLimit) {
      console.log(`[Round] Score limit reached! Winner has ${topScore} kills`);
      this.endRound();
      return;
    }
    
    // Check time limit
    if (this.roundState.config.timeLimit && this.roundState.roundStartTime) {
      const elapsed = (Date.now() - this.roundState.roundStartTime) * 0.001;
      if (elapsed >= this.roundState.config.timeLimit) {
        console.log(`[Round] Time limit reached!`);
        this.endRound();
      }
    }
  }

  private endRound(): void {
    this.roundState.phase = 'ended';
    
    const scores = Array.from(this.roundState.scores.values());
    scores.sort((a, b) => b.kills - a.kills);
    
    this.broadcastRoundState();
    console.log(`[Round] Round ended. Winner: ${scores[0]?.name || 'none'} with ${scores[0]?.kills || 0} kills`);
    
    // Auto-restart after 10 seconds
    setTimeout(() => {
      this.roundState.phase = 'waiting';
      this.roundState.roundStartTime = undefined;
      this.checkRoundStart();
    }, 10000);
  }

  private getRoundStateMessage(): RoundStateMessage {
    const scores = Array.from(this.roundState.scores.values());
    scores.sort((a, b) => b.kills - a.kills);
    
    return {
      phase: this.roundState.phase,
      countdownSeconds: this.roundState.countdownSeconds > 0 ? this.roundState.countdownSeconds : undefined,
      scores,
      config: this.roundState.config,
      winner: this.roundState.phase === 'ended' && scores[0] ? {
        entityId: scores[0].entityId,
        name: scores[0].name,
        kills: scores[0].kills,
      } : undefined,
    };
  }

  private broadcastRoundState(): void {
    this.broadcastLow(Opcode.RoundState, this.getRoundStateMessage());
  }

  // ══════════════════════════════════════════════════════════════
  // End Round System Methods
  // ══════════════════════════════════════════════════════════════

  /**
   * Broadcast a low-frequency message to all connected clients.
   */
  private broadcastLow(opcode: Opcode, payload: any) {
    const connections = this.getAllConnections();
    for (const conn of connections) {
      this.connectionHandler.sendLow(conn, opcode, payload);
    }
  }

  /**
   * Broadcast a low-frequency message to all clients except one.
   * Useful for spatial audio where the sender plays a local version.
   */
  private broadcastLowExcept(opcode: Opcode, payload: any, excludeConnectionId: string) {
    const connections = this.getAllConnections();
    for (const conn of connections) {
      if (conn.id !== excludeConnectionId) {
        this.connectionHandler.sendLow(conn, opcode, payload);
      }
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
    
    // Clean up round system timers
    if (this.roundState.countdownTimer) {
      clearInterval(this.roundState.countdownTimer);
    }
    
    this.scene.dispose();
    this.engine.dispose();
    this.players.clear();
    this.connections.clear();
    console.log(`Room ${this.id} disposed`);
  }
}
