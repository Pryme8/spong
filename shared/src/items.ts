/**
 * Item and weapon entity creation and management.
 */

import { Entity } from './ecs/Entity.js';
import { WEAPON_STATS, type WeaponType } from './weaponStats.js';
import { 
  COMP_AMMO, 
  COMP_SHOOTABLE,
  COMP_WEAPON_TYPE,
  COMP_ZOOMABLE,
  COMP_PICKUP_EFFECT,
  TAG_COLLECTABLE,
  TAG_PICKUP,
  AmmoComponent,
  ShootableComponent,
  WeaponTypeComponent,
  PickupEffectComponent
} from './components/index.js';

function createWeaponFromStats(type: WeaponType, entity: Entity): Entity {
  const stats = WEAPON_STATS[type];
  const ammo: AmmoComponent = {
    current: stats.ammo,
    max: stats.capacity,
    capacity: stats.capacity,
    reloadTime: stats.reloadTime,
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: stats.damage,
    fireRate: stats.fireRate,
    projectileSpeed: stats.projectileSpeed,
    lastFireTime: 0,
    accuracy: stats.accuracy,
    gravityStartDistance: stats.gravityStartDistance,
    pelletsPerShot: stats.pelletsPerShot,
    proximityRadius: stats.proximityRadius
  };

  const weaponType: WeaponTypeComponent = { type };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Pistol entity.
 */
export function createPistol(entity: Entity): Entity {
  return createWeaponFromStats('pistol', entity);
}

/**
 * Create a Submachine Gun entity.
 */
export function createSMG(entity: Entity): Entity {
  return createWeaponFromStats('smg', entity);
}

/**
 * Create a Light Machine Gun entity.
 */
export function createLMG(entity: Entity): Entity {
  return createWeaponFromStats('lmg', entity);
}

/**
 * Create a Shotgun entity.
 */
export function createShotgun(entity: Entity): Entity {
  return createWeaponFromStats('shotgun', entity);
}

/**
 * Create a Double Barrel Shotgun entity.
 */
export function createDoubleBarrelShotgun(entity: Entity): Entity {
  return createWeaponFromStats('doublebarrel', entity);
}

/**
 * Create a Sniper Rifle entity.
 */
export function createSniper(entity: Entity): Entity {
  createWeaponFromStats('sniper', entity);
  const stats = WEAPON_STATS['sniper'];
  if (stats.zoomFactor) {
    entity.add(COMP_ZOOMABLE, { zoomFactor: stats.zoomFactor });
  }
  return entity;
}

/**
 * Create an Assault Rifle entity.
 */
export function createAssaultRifle(entity: Entity): Entity {
  createWeaponFromStats('assault', entity);
  const stats = WEAPON_STATS['assault'];
  if (stats.zoomFactor) {
    entity.add(COMP_ZOOMABLE, { zoomFactor: stats.zoomFactor });
  }
  return entity;
}

/**
 * Create a DMR (Designated Marksman Rifle) entity.
 */
export function createDMR(entity: Entity): Entity {
  createWeaponFromStats('dmr', entity);
  const stats = WEAPON_STATS['dmr'];
  if (stats.zoomFactor) {
    entity.add(COMP_ZOOMABLE, { zoomFactor: stats.zoomFactor });
  }
  return entity;
}

/**
 * Create a Rocket Launcher entity.
 */
export function createRocketLauncher(entity: Entity): Entity {
  return createWeaponFromStats('rocket', entity);
}

/**
 * Create a Small Medic Pack entity (health pickup).
 */
export function createMedicPack(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'health',
    value: 25  // Heals 25 HP
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create a Large Medic Pack entity (health pickup).
 */
export function createLargeMedicPack(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'health',
    value: 100  // Heals 100 HP (full health)
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create an Apple entity (stamina pickup).
 */
export function createApple(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'stamina',
    value: 50  // Restores 50 stamina
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create a Pill Bottle entity (infinite stamina buff).
 */
export function createPillBottle(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'buff',
    value: 100,              // Instant 100 stamina restore
    buffType: 'infinite_stamina',
    buffDuration: 15         // 15 seconds of infinite stamina
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create a Kevlar entity (armor pickup).
 */
export function createKevlar(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'armor_pickup',
    value: 50  // Grants 50 armor
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create a Helmet entity (headshot protection).
 */
export function createHelmet(entity: Entity): Entity {
  const pickupEffect: PickupEffectComponent = {
    type: 'helmet_pickup',
    value: 1  // Equips helmet
  };

  entity
    .add(COMP_PICKUP_EFFECT, pickupEffect)
    .tag(TAG_COLLECTABLE)  // Make it collectable (picked up on touch)
    .tag(TAG_PICKUP);      // Mark as pickup effect type

  return entity;
}

/**
 * Create a Hammer entity (building tool).
 */
export function createHammer(entity: Entity): Entity {
  const weaponType: WeaponTypeComponent = { type: 'hammer' };

  entity
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);  // Make it collectable (picked up on touch)

  return entity;
}

/**
 * Create a Ladder entity (placement tool).
 */
export function createLadder(entity: Entity): Entity {
  const weaponType: WeaponTypeComponent = { type: 'ladder' };

  entity
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);  // Make it collectable (picked up on touch)

  return entity;
}

/**
 * Check if a weapon can fire based on fire rate.
 */
export function canFire(shootable: ShootableComponent, currentTime: number): boolean {
  const cooldown = 1.0 / shootable.fireRate;
  return (currentTime - shootable.lastFireTime) >= cooldown;
}

/**
 * Update last fire time for a weapon.
 */
export function recordFire(shootable: ShootableComponent, currentTime: number): void {
  shootable.lastFireTime = currentTime;
}

/**
 * Check if weapon has ammo.
 */
export function hasAmmo(ammo: AmmoComponent): boolean {
  return ammo.infinite || ammo.current > 0;
}

/**
 * Consume one ammo.
 */
export function consumeAmmo(ammo: AmmoComponent): boolean {
  if (ammo.infinite) return true;
  if (ammo.current > 0) {
    ammo.current--;
    return true;
  }
  return false;
}

/**
 * Add ammo to weapon.
 */
export function addAmmo(ammo: AmmoComponent, amount: number): void {
  if (ammo.infinite) return;
  ammo.current = Math.min(ammo.current + amount, ammo.max);
}

/**
 * Start reloading a weapon.
 */
export function startReload(ammo: AmmoComponent, currentTime: number): boolean {
  // Can't reload if already reloading, infinite ammo, or magazine is full
  if (ammo.isReloading || ammo.infinite || ammo.current >= ammo.capacity) {
    return false;
  }
  
  ammo.isReloading = true;
  ammo.reloadStartTime = currentTime;
  return true;
}

/**
 * Check if reload is complete and finish reloading.
 */
export function updateReload(ammo: AmmoComponent, currentTime: number): boolean {
  if (!ammo.isReloading) return false;
  
  const elapsed = currentTime - ammo.reloadStartTime;
  if (elapsed >= ammo.reloadTime) {
    // Reload complete
    ammo.current = ammo.capacity;
    ammo.isReloading = false;
    ammo.reloadStartTime = 0;
    return true; // Reload just completed
  }
  
  return false; // Still reloading
}

/**
 * Get reload progress (0 to 1).
 */
export function getReloadProgress(ammo: AmmoComponent, currentTime: number): number {
  if (!ammo.isReloading) return 0;
  
  const elapsed = currentTime - ammo.reloadStartTime;
  return Math.min(1, elapsed / ammo.reloadTime);
}

/**
 * Create weapon components from existing components (for drop/respawn).
 */
export function copyWeaponComponents(shootable: ShootableComponent, ammo: AmmoComponent): {
  shootable: ShootableComponent;
  ammo: AmmoComponent;
} {
  return {
    shootable: {
      damage: shootable.damage,
      fireRate: shootable.fireRate,
      projectileSpeed: shootable.projectileSpeed,
      lastFireTime: shootable.lastFireTime,
      accuracy: shootable.accuracy,
      gravityStartDistance: shootable.gravityStartDistance,
      pelletsPerShot: shootable.pelletsPerShot
    },
    ammo: {
      current: ammo.current,
      max: ammo.max,
      capacity: ammo.capacity,
      reloadTime: ammo.reloadTime,
      isReloading: ammo.isReloading,
      reloadStartTime: ammo.reloadStartTime,
      infinite: ammo.infinite
    }
  };
}
