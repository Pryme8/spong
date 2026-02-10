/**
 * Item and weapon entity creation and management.
 */

import { Entity } from './ecs/Entity.js';
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
  ZoomableComponent,
  PickupEffectComponent
} from './components/index.js';

/**
 * Create a Pistol entity.
 */
export function createPistol(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 12,
    max: 12,
    capacity: 12,       // magazine size
    reloadTime: 1.5,    // 1.5 seconds to reload
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 15,
    fireRate: 3.0, // 3 shots per second
    projectileSpeed: 65, // Fast, accurate projectile
    lastFireTime: 0,
    accuracy: 0.008,  // ~0.46 degrees cone of fire (very accurate)
    gravityStartDistance: 50, // Gravity starts after 50 units
    pelletsPerShot: 1 // Single projectile
  };

  const weaponType: WeaponTypeComponent = { type: 'pistol' };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Submachine Gun entity.
 */
export function createSMG(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 30,
    max: 30,
    capacity: 30,       // larger magazine
    reloadTime: 2.2,    // longer reload time
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 12,         // slightly less than pistol (15)
    fireRate: 20.0,     // 20 shots per second (fast automatic spray)
    projectileSpeed: 60, // Slightly slower than pistol
    lastFireTime: 0,
    accuracy: 0.015,     // ~0.86 degrees cone of fire (tighter for better control)
    gravityStartDistance: 50, // Gravity starts after 50 units (same as pistol)
    pelletsPerShot: 1 // Single projectile
  };

  const weaponType: WeaponTypeComponent = { type: 'smg' };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Light Machine Gun entity.
 */
export function createLMG(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 60,
    max: 60,
    capacity: 60,       // large belt-fed magazine
    reloadTime: 3.5,    // long reload time
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 18,         // more than pistol (15)
    fireRate: 15.0,     // 15 shots per second (sustained fire)
    projectileSpeed: 70, // faster than pistol (65)
    lastFireTime: 0,
    accuracy: 0.02,      // ~1.15 degrees cone of fire (slightly worse than SMG 0.015)
    gravityStartDistance: 35, // Gravity starts earlier than pistol/SMG (35 vs 50)
    pelletsPerShot: 1 // Single projectile
  };

  const weaponType: WeaponTypeComponent = { type: 'lmg' };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Shotgun entity.
 */
export function createShotgun(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 8,
    max: 8,
    capacity: 8,        // shotgun shells
    reloadTime: 3.0,    // slow reload (3 seconds)
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 8,          // low damage per pellet (6 pellets = 48 total at close range)
    fireRate: 0.8,      // 0.8 shots per second (1.25 second cooldown - pump-action feel)
    projectileSpeed: 55, // slower projectiles
    lastFireTime: 0,
    accuracy: 0.08,      // ~4.6 degrees cone of fire (wide spread)
    gravityStartDistance: 15, // Gravity starts early (15 units)
    pelletsPerShot: 6    // Fires 6 pellets per shot
  };

  const weaponType: WeaponTypeComponent = { type: 'shotgun' };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Sniper Rifle entity.
 */
export function createSniper(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 1,
    max: 1,
    capacity: 1,        // single shot - must reload after each shot
    reloadTime: 2.5,    // 2.5 seconds to reload
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 75,         // very high damage (one-shot potential)
    fireRate: 0.4,      // 0.4 shots per second (2.5 second cooldown)
    projectileSpeed: 150, // very fast projectile
    lastFireTime: 0,
    accuracy: 0.001,     // ~0.057 degrees cone of fire (extremely accurate)
    gravityStartDistance: 200, // Gravity starts very far out
    pelletsPerShot: 1    // Single precise projectile
  };

  const weaponType: WeaponTypeComponent = { type: 'sniper' };
  
  const zoomable: ZoomableComponent = { zoomFactor: 3 }; // 3x zoom

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .add(COMP_ZOOMABLE, zoomable)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create an Assault Rifle entity.
 */
export function createAssaultRifle(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 30,
    max: 30,
    capacity: 30,       // 30-round magazine
    reloadTime: 2.5,    // 2.5 seconds to reload
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 18,         // same as LMG
    fireRate: 8.0,      // 8 shots per second (semi-auto, fast cycle rate)
    projectileSpeed: 100, // faster than SMG (60)
    lastFireTime: 0,
    accuracy: 0.008,     // ~0.46 degrees cone of fire (better than SMG 0.015)
    gravityStartDistance: 60, // moderate distance
    pelletsPerShot: 1    // Single projectile
  };

  const weaponType: WeaponTypeComponent = { type: 'assault' };
  
  const zoomable: ZoomableComponent = { zoomFactor: 1.8 }; // 1.8x zoom (tactical sight)

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .add(COMP_ZOOMABLE, zoomable)
    .tag(TAG_COLLECTABLE);

  return entity;
}

/**
 * Create a Rocket Launcher entity.
 */
export function createRocketLauncher(entity: Entity): Entity {
  const ammo: AmmoComponent = {
    current: 1,
    max: 1,
    capacity: 1,        // single rocket
    reloadTime: 6.0,    // very long reload (6 seconds)
    isReloading: false,
    reloadStartTime: 0,
    infinite: false
  };

  const shootable: ShootableComponent = {
    damage: 100,        // high base damage (before falloff)
    fireRate: 0.15,     // 0.15 shots per second (6+ second cooldown)
    projectileSpeed: 40, // slowest projectile
    lastFireTime: 0,
    accuracy: 0.005,     // ~0.29 degrees cone of fire (fairly accurate)
    gravityStartDistance: 60, // moderate distance before drop
    pelletsPerShot: 1,   // Single rocket
    proximityRadius: 5   // 5 unit radius for AOE/splash damage
  };

  const weaponType: WeaponTypeComponent = { type: 'rocket' };

  entity
    .add(COMP_AMMO, ammo)
    .add(COMP_SHOOTABLE, shootable)
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);

  return entity;
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
