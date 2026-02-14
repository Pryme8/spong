import type { World, Entity } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_PHYSICS,
  COMP_HEALTH,
  COMP_STAMINA,
  COMP_ACTIVE_BUFFS,
  COMP_ARMOR,
  COMP_HELMET,
  COMP_SHOOTABLE,
  COMP_AMMO,
  COMP_WEAPON_TYPE,
  COMP_COLLECTED,
  COMP_PICKUP_EFFECT,
  TAG_COLLECTABLE,
  Opcode,
  LEVEL_OFFSET_X,
  LEVEL_OFFSET_Z,
  VOXEL_WIDTH,
  VOXEL_DEPTH,
  type PlayerComponent,
  type PhysicsComponent,
  type HealthComponent,
  type StaminaComponent,
  type ActiveBuffsComponent,
  type ActiveBuff,
  type ArmorComponent,
  type HelmetComponent,
  type ShootableComponent,
  type AmmoComponent,
  type WeaponTypeComponent,
  type CollectedComponent,
  type PickupEffectComponent,
  type TerrainCollisionGrid,
  type ItemSpawnMessage,
  type ItemUpdateMessage,
  type EntityDamageMessage,
  createPistol,
  createSMG,
  createLMG,
  createShotgun,
  createDoubleBarrelShotgun,
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
  WEAPON_STATS,
  type WeaponType,
} from '@spong/shared';

const PICKUP_GRID_CELL_SIZE = 2.0;
const PICKUP_RANGE = 0.75;

export type ItemType = 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'doublebarrel' | 'sniper' | 'assault' | 'dmr' | 'rocket' | 'hammer' |
  'medic_pack' | 'large_medic_pack' | 'apple' | 'pill_bottle' | 'kevlar' | 'helmet';

type EntityFactory = (entity: Entity) => Entity;

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
  doublebarrel: { factory: createDoubleBarrelShotgun, name: 'Double Barrel Shotgun', yOffset: 0.5, validateUnderwater: true, onGround: true },
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
  helmet: { factory: createHelmet, name: 'Helmet', yOffset: 0.5, validateUnderwater: true, onGround: true },
};

export interface SpawnTerrainOptions {
  voxelGrid?: import('@spong/shared').VoxelGrid | import('@spong/shared').MultiTileVoxelGrid;
  waterLevelProvider?: { isValidSpawnPosition(x: number, y: number, z: number): boolean };
}

export interface ItemSystemOptions {
  world: World;
  broadcast: (opcode: number, msg: unknown) => void;
}

/**
 * Server-side item system. Owns pickup spatial grid, item spawn/drop, and pickup processing.
 * Room delegates spawn/drop/pickup and uses getInitialStateMessages() for new players.
 */
export class ItemSystem {
  private readonly world: World;
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly pickupGrid = new Map<string, Set<number>>();
  private readonly pickupGridCells = new Map<number, string>();
  private spawnContext: { voxelGrid: TerrainCollisionGrid; waterLevelProvider?: SpawnTerrainOptions['waterLevelProvider'] } | null = null;

  private static readonly RESPAWNABLE_CONSUMABLES = new Set<ItemType>([
    'medic_pack',
    'large_medic_pack',
    'apple',
    'pill_bottle',
    'kevlar',
    'helmet'
  ]);

  constructor(options: ItemSystemOptions) {
    this.world = options.world;
    this.broadcast = options.broadcast;
  }

  setSpawnContext(context: { voxelGrid: TerrainCollisionGrid; waterLevelProvider?: SpawnTerrainOptions['waterLevelProvider'] } | null): void {
    this.spawnContext = context;
  }

  spawnOnTerrain(itemType: ItemType, worldX: number, worldZ: number, options?: SpawnTerrainOptions): boolean {
    const config = ENTITY_CONFIGS[itemType];
    let surfaceY = 0;
    if (options?.voxelGrid) {
      surfaceY = options.voxelGrid.getWorldSurfaceY(worldX, worldZ);
      if (config.yOffsetBase !== undefined) surfaceY += config.yOffsetBase;
    }
    const spawnY = surfaceY + (config.yOffset ?? 0.5);

    if (config.validateUnderwater && options?.waterLevelProvider && !options.waterLevelProvider.isValidSpawnPosition(worldX, spawnY, worldZ))
      return false;

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
      onGround: config.onGround ?? true,
    };
    entity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(entity.id, worldX, worldZ);

    if (config.broadcastSpawn) {
      const weaponType = entity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      this.broadcast(Opcode.ItemSpawn, {
        entityId: entity.id,
        itemType: weaponType?.type || itemType,
        posX: worldX,
        posY: spawnY,
        posZ: worldZ,
      });
    }
    return true;
  }

  spawnAtPosition(itemType: ItemType, worldX: number, worldY: number, worldZ: number): void {
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
      onGround: true,
    };
    entity.add(COMP_PHYSICS, physics);
    this.upsertPickupGrid(entity.id, worldX, worldZ);
    const weaponType = entity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    this.broadcast(Opcode.ItemSpawn, {
      entityId: entity.id,
      itemType: weaponType?.type || itemType,
      posX: worldX,
      posY: worldY,
      posZ: worldZ,
    });
  }

  dropWeaponAtPosition(playerEntity: Entity, posX: number, posY: number, posZ: number): void {
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) return;
    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    const playerWeaponType = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    if (!shootable || !ammo) return;

    collected.items = [];
    playerEntity.remove(COMP_SHOOTABLE);
    playerEntity.remove(COMP_AMMO);
    playerEntity.remove(COMP_WEAPON_TYPE);

    const itemEntity = this.world.createEntity();
    itemEntity.add(COMP_SHOOTABLE, {
      damage: shootable.damage,
      fireRate: shootable.fireRate,
      projectileSpeed: shootable.projectileSpeed,
      lastFireTime: 0,
      accuracy: shootable.accuracy,
      gravityStartDistance: shootable.gravityStartDistance,
      pelletsPerShot: shootable.pelletsPerShot,
      proximityRadius: shootable.proximityRadius,
      currentBloom: 0,
    });
    itemEntity.add(COMP_AMMO, {
      current: ammo.current,
      max: ammo.max,
      capacity: ammo.capacity,
      reloadTime: ammo.reloadTime,
      isReloading: false,
      reloadStartTime: 0,
      infinite: ammo.infinite,
    });
    if (playerWeaponType) itemEntity.add(COMP_WEAPON_TYPE, { type: playerWeaponType.type });
    itemEntity.tag(TAG_COLLECTABLE);
    itemEntity.add(COMP_PHYSICS, {
      posX: posX,
      posY: posY,
      posZ: posZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: 0.5,
      onGround: true,
    });
    this.upsertPickupGrid(itemEntity.id, posX, posZ);
    const wt = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    this.broadcast(Opcode.ItemSpawn, { entityId: itemEntity.id, itemType: wt?.type || 'pistol', posX, posY, posZ });
  }

  handleItemTossLand(playerEntity: Entity, landX: number, landY: number, landZ: number): void {
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) return;
    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    const playerWeaponType = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    if (!shootable || !ammo) return;

    collected.items = [];
    playerEntity.remove(COMP_SHOOTABLE);
    playerEntity.remove(COMP_AMMO);
    playerEntity.remove(COMP_WEAPON_TYPE);

    const itemEntity = this.world.createEntity();
    itemEntity.add(COMP_SHOOTABLE, {
      damage: shootable.damage,
      fireRate: shootable.fireRate,
      projectileSpeed: shootable.projectileSpeed,
      lastFireTime: 0,
      accuracy: shootable.accuracy,
      gravityStartDistance: shootable.gravityStartDistance,
      pelletsPerShot: shootable.pelletsPerShot,
      proximityRadius: shootable.proximityRadius,
      currentBloom: 0,
    });
    itemEntity.add(COMP_AMMO, {
      current: ammo.current,
      max: ammo.max,
      capacity: ammo.capacity,
      reloadTime: ammo.reloadTime,
      isReloading: false,
      reloadStartTime: 0,
      infinite: ammo.infinite,
    });
    if (playerWeaponType) itemEntity.add(COMP_WEAPON_TYPE, { type: playerWeaponType.type });
    itemEntity.tag(TAG_COLLECTABLE);
    itemEntity.add(COMP_PHYSICS, {
      posX: landX,
      posY: landY,
      posZ: landZ,
      velX: 0,
      velY: 0,
      velZ: 0,
      size: 0.5,
      onGround: true,
    });
    this.upsertPickupGrid(itemEntity.id, landX, landZ);
    const wt = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    this.broadcast(Opcode.ItemSpawn, { entityId: itemEntity.id, itemType: wt?.type || 'pistol', posX: landX, posY: landY, posZ: landZ });

    const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
    const playerPhysics = playerEntity.get<PhysicsComponent>(COMP_PHYSICS);
    if (pc && playerPhysics) {
      this.broadcast(Opcode.ItemDropSound, {
        entityId: playerEntity.id,
        posX: playerPhysics.posX,
        posY: playerPhysics.posY,
        posZ: playerPhysics.posZ,
        excludeSender: true,
      });
    }
  }

  upsertItemPosition(entityId: number, worldX: number, worldZ: number): void {
    this.upsertPickupGrid(entityId, worldX, worldZ);
  }

  handlePickupRequest(playerEntity: Entity, itemId: number, now: number): void {
    const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
    if (!pc) return;

    const itemEntity = this.world.getEntity(itemId);
    if (!itemEntity || !itemEntity.hasTag(TAG_COLLECTABLE)) return;

    const itemPhysics = itemEntity.get<PhysicsComponent>(COMP_PHYSICS);
    if (!itemPhysics) return;

    const pickupEffect = itemEntity.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);

    if (!pickupEffect && collected && collected.items.length > 0) {
      const playerPhysics = playerEntity.get<PhysicsComponent>(COMP_PHYSICS);
      if (playerPhysics) {
        this.dropWeaponAtPosition(playerEntity, playerPhysics.posX, playerPhysics.posY, playerPhysics.posZ);
      }
    }

    if (pickupEffect) {
      this.applyConsumablePickup(playerEntity, { itemId, playerId: playerEntity.id }, pickupEffect, now);
    } else {
      this.applyWeaponPickup(playerEntity, itemEntity, { itemId, playerId: playerEntity.id });
    }
  }

  processPickups(
    collectableEntities: Entity[],
    playerEntities: Entity[],
    now: number,
  ): void {
    for (const entity of collectableEntities) {
      const physics = entity.get<PhysicsComponent>(COMP_PHYSICS);
      if (physics) this.upsertPickupGrid(entity.id, physics.posX, physics.posZ);
    }

    const itemsToPickup: { itemId: number; playerId: number }[] = [];
    const scheduledItems = new Set<number>();

    for (const playerEntity of playerEntities) {
      const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;
      const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);

      const nearbyItems = this.queryPickupGrid(pc.state.posX, pc.state.posZ, PICKUP_RANGE);
      for (const itemId of nearbyItems) {
        if (scheduledItems.has(itemId)) continue;
        const itemEntity = this.world.getEntity(itemId);
        if (!itemEntity) continue;
        const pickupEffect = itemEntity.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
        if (pickupEffect) {
          if (!this.shouldAutoPickupEffect(playerEntity, pickupEffect, now)) continue;
        } else if (collected && collected.items.length > 0) {
          continue;
        }
        const physics = itemEntity.get<PhysicsComponent>(COMP_PHYSICS);
        if (!physics) continue;
        const dx = pc.state.posX - physics.posX;
        const dy = pc.state.posY - physics.posY;
        const dz = pc.state.posZ - physics.posZ;
        if (dx * dx + dy * dy + dz * dz <= PICKUP_RANGE * PICKUP_RANGE) {
          itemsToPickup.push({ itemId: itemEntity.id, playerId: playerEntity.id });
          scheduledItems.add(itemId);
        }
      }
    }

    for (const pickup of itemsToPickup) {
      const playerEntity = this.world.getEntity(pickup.playerId);
      if (!playerEntity) continue;
      const itemEntity = this.world.getEntity(pickup.itemId);
      if (!itemEntity) continue;

      const pickupEffect = itemEntity.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
      if (pickupEffect) {
        this.applyConsumablePickup(playerEntity, pickup, pickupEffect, now);
      } else {
        this.applyWeaponPickup(playerEntity, itemEntity, pickup);
      }
    }
  }

  private applyConsumablePickup(
    playerEntity: Entity,
    pickup: { itemId: number; playerId: number },
    pickupEffect: PickupEffectComponent,
    now: number,
  ): void {
    if (pickupEffect.type === 'health') {
      const health = playerEntity.get<HealthComponent>(COMP_HEALTH);
      if (health) {
        const oldHealth = health.current;
        health.current = Math.min(health.max, health.current + pickupEffect.value);
        const dmgMsg: EntityDamageMessage = {
          entityId: pickup.playerId,
          damage: -(health.current - oldHealth),
          newHealth: health.current,
          attackerId: pickup.playerId,
        };
        this.broadcast(Opcode.EntityDamage, dmgMsg);
      }
    } else if (pickupEffect.type === 'stamina') {
      const stamina = playerEntity.get<StaminaComponent>(COMP_STAMINA);
      if (stamina) {
        stamina.current = Math.min(stamina.max, stamina.current + pickupEffect.value);
        if (stamina.isExhausted && stamina.current >= stamina.max) {
          stamina.isExhausted = false;
          stamina.exhaustedAt = 0;
        }
      }
    } else if (pickupEffect.type === 'buff' && pickupEffect.buffType && pickupEffect.buffDuration) {
      const stamina = playerEntity.get<StaminaComponent>(COMP_STAMINA);
      const buffs = playerEntity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (stamina) {
        stamina.current = Math.min(stamina.max, stamina.current + pickupEffect.value);
        if (stamina.isExhausted && stamina.current >= stamina.max) {
          stamina.isExhausted = false;
          stamina.exhaustedAt = 0;
        }
      }
      if (buffs) {
        const newBuff: ActiveBuff = { type: pickupEffect.buffType, startTime: now, duration: pickupEffect.buffDuration };
        buffs.buffs.push(newBuff);
        this.broadcast(Opcode.BuffApplied, { entityId: pickup.playerId, buffType: pickupEffect.buffType, duration: pickupEffect.buffDuration });
      }
    } else if (pickupEffect.type === 'armor_pickup') {
      const armor = playerEntity.get<ArmorComponent>(COMP_ARMOR);
      if (armor) armor.current = Math.min(armor.max, armor.current + pickupEffect.value);
    } else if (pickupEffect.type === 'helmet_pickup') {
      const helmet = playerEntity.get<HelmetComponent>(COMP_HELMET);
      if (helmet) {
        helmet.hasHelmet = true;
        helmet.helmetHealth = helmet.maxHelmetHealth;
      }
    }

    const itemType = this.getConsumableItemType(pickupEffect) ?? 'medic_pack';
    this.broadcast(Opcode.ItemPickup, { entityId: pickup.itemId, playerId: pickup.playerId, itemType });
    this.removePickupFromGrid(pickup.itemId);
    this.world.destroyEntity(pickup.itemId);
    this.scheduleConsumableRespawn(itemType);
  }

  private applyWeaponPickup(playerEntity: Entity, itemEntity: Entity, pickup: { itemId: number; playerId: number }): void {
    const itemShootable = itemEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const itemAmmo = itemEntity.get<AmmoComponent>(COMP_AMMO);
    const itemWeaponType = itemEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);

    if (itemShootable && itemAmmo) {
      const weaponType = itemWeaponType?.type as WeaponType | undefined;
      const fallbackProximityRadius = weaponType ? WEAPON_STATS[weaponType]?.proximityRadius : undefined;
      playerEntity.add(COMP_SHOOTABLE, {
        damage: itemShootable.damage,
        fireRate: itemShootable.fireRate,
        projectileSpeed: itemShootable.projectileSpeed,
        lastFireTime: itemShootable.lastFireTime,
        accuracy: itemShootable.accuracy,
        gravityStartDistance: itemShootable.gravityStartDistance,
        pelletsPerShot: itemShootable.pelletsPerShot,
        proximityRadius: itemShootable.proximityRadius ?? fallbackProximityRadius,
        currentBloom: itemShootable.currentBloom ?? 0,
      });
      playerEntity.add(COMP_AMMO, {
        current: itemAmmo.current,
        max: itemAmmo.max,
        capacity: itemAmmo.capacity,
        reloadTime: itemAmmo.reloadTime,
        isReloading: itemAmmo.isReloading,
        reloadStartTime: itemAmmo.reloadStartTime,
        infinite: itemAmmo.infinite,
      });
      if (itemWeaponType) playerEntity.add(COMP_WEAPON_TYPE, { type: itemWeaponType.type });
    }

    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (collected) collected.items.push(pickup.itemId);

    this.broadcast(Opcode.ItemPickup, {
      entityId: pickup.itemId,
      playerId: pickup.playerId,
      itemType: itemWeaponType?.type || 'pistol',
      ammoCurrent: itemAmmo?.current,
      ammoCapacity: itemAmmo?.capacity,
    });
    this.removePickupFromGrid(pickup.itemId);
    this.world.destroyEntity(pickup.itemId);
  }

  /**
   * Broadcast ItemUpdate only when an item lands (settled). All item traffic is low-frequency:
   * ItemSpawn (spawn/drop), ItemUpdate (once per land, justSettledIds only), ItemPickup (pickup).
   * No high-frequency position stream; in-air motion is client-side only.
   */
  broadcastPositionUpdates(collectableEntities: Entity[], justSettledIds: Set<number>): void {
    for (const entity of collectableEntities) {
      if (!justSettledIds.has(entity.id)) continue;
      const physics = entity.get<PhysicsComponent>(COMP_PHYSICS)!;
      const update: ItemUpdateMessage = {
        entityId: entity.id,
        posX: physics.posX,
        posY: physics.posY,
        posZ: physics.posZ,
        settled: true
      };
      this.broadcast(Opcode.ItemUpdate, update);
    }
  }

  getInitialStateMessages(): ItemSpawnMessage[] {
    const messages: ItemSpawnMessage[] = [];
    const existingItems = this.world.query(COMP_PHYSICS);
    for (const item of existingItems) {
      if (item.get(COMP_PLAYER)) continue;
      const physics = item.get<PhysicsComponent>(COMP_PHYSICS);
      if (!physics) continue;
      const pickupEffect = item.get<PickupEffectComponent>(COMP_PICKUP_EFFECT);
      const weaponType = item.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      let itemType: string;
      if (pickupEffect) {
        if (pickupEffect.type === 'buff' && pickupEffect.buffType === 'infinite_stamina') itemType = 'pill_bottle';
        else if (pickupEffect.type === 'armor_pickup') itemType = 'kevlar';
        else if (pickupEffect.type === 'helmet_pickup') itemType = 'helmet';
        else if (pickupEffect.type === 'stamina') itemType = 'apple';
        else if (pickupEffect.type === 'health' && pickupEffect.value >= 100) itemType = 'large_medic_pack';
        else itemType = 'medic_pack';
      } else {
        itemType = weaponType?.type || 'pistol';
      }
      messages.push({
        entityId: item.id,
        itemType,
        posX: physics.posX,
        posY: physics.posY,
        posZ: physics.posZ,
      });
    }
    return messages;
  }

  private getPickupCellKey(worldX: number, worldZ: number): string {
    const cellX = Math.floor(worldX / PICKUP_GRID_CELL_SIZE);
    const cellZ = Math.floor(worldZ / PICKUP_GRID_CELL_SIZE);
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
        if (previousSet.size === 0) this.pickupGrid.delete(previousKey);
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
      if (cellSet.size === 0) this.pickupGrid.delete(key);
    }
    this.pickupGridCells.delete(itemId);
  }

  private queryPickupGrid(worldX: number, worldZ: number, range: number): number[] {
    const cellRadius = Math.ceil(range / PICKUP_GRID_CELL_SIZE);
    const centerCellX = Math.floor(worldX / PICKUP_GRID_CELL_SIZE);
    const centerCellZ = Math.floor(worldZ / PICKUP_GRID_CELL_SIZE);
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

  private shouldAutoPickupEffect(playerEntity: Entity, pickupEffect: PickupEffectComponent, now: number): boolean {
    if (pickupEffect.type === 'health') {
      const health = playerEntity.get<HealthComponent>(COMP_HEALTH);
      return !health || health.current < health.max;
    }
    if (pickupEffect.type === 'stamina') {
      const stamina = playerEntity.get<StaminaComponent>(COMP_STAMINA);
      return !stamina || stamina.current < stamina.max || stamina.isExhausted;
    }
    if (pickupEffect.type === 'buff') {
      const buffs = playerEntity.get<ActiveBuffsComponent>(COMP_ACTIVE_BUFFS);
      if (!pickupEffect.buffType || !buffs) return true;
      return !buffs.buffs.some(buff => buff.type === pickupEffect.buffType && (now - buff.startTime) < buff.duration);
    }
    if (pickupEffect.type === 'armor_pickup') {
      const armor = playerEntity.get<ArmorComponent>(COMP_ARMOR);
      return !armor || armor.current < armor.max;
    }
    if (pickupEffect.type === 'helmet_pickup') {
      const helmet = playerEntity.get<HelmetComponent>(COMP_HELMET);
      return !helmet || !helmet.hasHelmet || helmet.helmetHealth < helmet.maxHelmetHealth;
    }
    return true;
  }

  private getConsumableItemType(pickupEffect: PickupEffectComponent): ItemType | null {
    if (pickupEffect.type === 'health') {
      return pickupEffect.value >= 100 ? 'large_medic_pack' : 'medic_pack';
    }
    if (pickupEffect.type === 'stamina') {
      return 'apple';
    }
    if (pickupEffect.type === 'buff') {
      return 'pill_bottle';
    }
    if (pickupEffect.type === 'armor_pickup') {
      return 'kevlar';
    }
    if (pickupEffect.type === 'helmet_pickup') {
      return 'helmet';
    }
    return null;
  }

  private scheduleConsumableRespawn(itemType: ItemType): void {
    if (!ItemSystem.RESPAWNABLE_CONSUMABLES.has(itemType)) return;
    if (!this.spawnContext) return;
    setTimeout(() => {
      this.spawnConsumableAtRandom(itemType);
    }, 10000);
  }

  private spawnConsumableAtRandom(itemType: ItemType): void {
    if (!this.spawnContext) return;
    const { voxelGrid, waterLevelProvider } = this.spawnContext;
    const bounds = this.getTerrainBounds(voxelGrid);
    const attempts = 30;
    for (let i = 0; i < attempts; i++) {
      const worldX = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const worldZ = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const spawned = this.spawnOnTerrain(itemType, worldX, worldZ, { voxelGrid, waterLevelProvider });
      if (spawned) return;
    }
  }

  private getTerrainBounds(voxelGrid: TerrainCollisionGrid): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const offset = (voxelGrid as { getOffset?: () => { offsetX: number; offsetZ: number } }).getOffset?.() ?? {
      offsetX: LEVEL_OFFSET_X,
      offsetZ: LEVEL_OFFSET_Z
    };
    const minX = offset.offsetX;
    const minZ = offset.offsetZ;
    const maxX = offset.offsetX + voxelGrid.width * VOXEL_WIDTH;
    const maxZ = offset.offsetZ + voxelGrid.depth * VOXEL_DEPTH;
    return { minX, maxX, minZ, maxZ };
  }
}
