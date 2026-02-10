import { CharacterState, CharacterInput } from '../physics.js';

// ── Component name constants ──────────────────────────────────
export const COMP_PLAYER = 'Player';
export const COMP_HEALTH = 'Health';
export const COMP_PROJECTILE = 'Projectile';
export const COMP_AMMO = 'Ammo';
export const COMP_SHOOTABLE = 'Shootable';
export const COMP_COLLECTED = 'Collected';
export const COMP_PHYSICS = 'Physics';
export const COMP_WEAPON_TYPE = 'WeaponType';
export const COMP_ZOOMABLE = 'Zoomable';
export const COMP_MULTI_SHOT = 'MultiShot';
export const COMP_PICKUP_EFFECT = 'PickupEffect';
export const COMP_STAMINA = 'Stamina';
export const COMP_ACTIVE_BUFFS = 'ActiveBuffs';
export const COMP_ARMOR = 'Armor';
export const COMP_HELMET = 'Helmet';
export const COMP_MATERIALS = 'Materials';
export const COMP_BUILDING = 'Building';
export const COMP_LADDER_COLLIDER = 'LadderCollider';
export const COMP_STATS = 'Stats';

// ── Tag constants ─────────────────────────────────────────────
export const TAG_KILLABLE = 'Killable';
export const TAG_COLLECTABLE = 'Collectable';
export const TAG_PICKUP = 'Pickup';
export const TAG_CLOUD = 'Cloud';
export const TAG_LADDER = 'Ladder';

// ── Component data interfaces ─────────────────────────────────

export interface PlayerComponent {
  connectionId: string;
  state: CharacterState;
  input: CharacterInput;
  lastProcessedInput: number;
  lastShootTime: number; // Timestamp (seconds) of last shot for rate limiting
  headPitch: number; // Current pitch of head for hitbox calculation and visualization
}

export interface HealthComponent {
  current: number;
  max: number;
}

export interface ProjectileComponent {
  ownerId: number;      // entity ID of the shooter
  dirX: number;         // normalized direction
  dirY: number;
  dirZ: number;
  speed: number;        // units per second
  damage: number;       // base damage (falloff applied at hit)
  lifetime: number;     // seconds remaining
  posX: number;         // world position
  posY: number;
  posZ: number;
  velY: number;         // vertical velocity for gravity
  distanceTraveled: number; // track distance for damage falloff and gravity
  baseDamage: number;   // original damage for falloff calculation
  gravityStartDistance: number; // distance before gravity starts
  tickCounter: number;  // ARMA-style: only check collision every N ticks for performance
  lastCollisionCheckX: number; // Position at last collision check (for swept collision)
  lastCollisionCheckY: number;
  lastCollisionCheckZ: number;
  proximityRadius?: number; // optional: radius for AOE/splash damage on impact
}

export interface AmmoComponent {
  current: number;      // current ammo count
  max: number;          // maximum ammo capacity
  capacity: number;     // magazine size (shots before reload)
  reloadTime: number;   // seconds to reload
  isReloading: boolean;
  reloadStartTime: number;  // timestamp when reload started
  infinite: boolean;    // infinite ammo flag
}

export interface ShootableComponent {
  damage: number;       // damage per shot
  fireRate: number;     // shots per second
  projectileSpeed: number;  // speed of fired projectiles
  lastFireTime: number; // timestamp of last shot (for rate limiting)
  accuracy: number;     // cone of fire half-angle in radians (0 = perfect)
  gravityStartDistance: number; // distance before gravity starts affecting projectile
  pelletsPerShot: number; // number of projectiles fired per shot (1 for most weapons, 6+ for shotgun)
  proximityRadius?: number; // optional: radius for AOE/splash damage (0 or undefined = no splash)
}

export interface CollectedComponent {
  items: number[];      // entity IDs of collected items/weapons
}

export interface PhysicsComponent {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  size: number;         // cube size for collision (0.5 for collectables)
  onGround: boolean;
}

export interface WeaponTypeComponent {
  type: 'pistol' | 'smg' | 'shotgun' | 'lmg' | 'sniper' | 'assault' | 'rocket' | 'hammer' | 'ladder';  // Identifies the visual mesh type
}

export interface ZoomableComponent {
  zoomFactor: number;  // How much to divide FOV by when zooming (e.g., 3 = 3x zoom)
}

export interface PickupEffectComponent {
  type: 'health' | 'ammo' | 'armor_pickup' | 'stamina' | 'buff' | 'helmet_pickup';  // Type of pickup effect
  value: number;           // Amount of instant effect (e.g., 25 health, 50 armor, 50 stamina)
  buffType?: BuffType;     // Type of buff to apply (if type === 'buff')
  buffDuration?: number;   // Duration of buff in seconds (if type === 'buff')
}

export interface StaminaComponent {
  current: number;      // Current stamina (0-100)
  max: number;          // Maximum stamina
  isExhausted: boolean; // True when stamina hits 0, prevents running/jumping
  exhaustedAt: number;  // Timestamp when exhaustion started
}

export type BuffType = 
  | 'infinite_stamina'
  | 'speed_boost'
  | 'jump_boost'
  | 'fire_rate_boost'
  | 'damage_boost'
  | 'infinite_ammo';

export interface ActiveBuff {
  type: BuffType;
  startTime: number;   // When buff was applied (seconds)
  duration: number;    // How long it lasts (seconds)
  value?: number;      // Optional value (e.g., speed multiplier)
}

export interface ActiveBuffsComponent {
  buffs: ActiveBuff[];  // Array of currently active buffs
}

export interface ArmorComponent {
  current: number;  // Current armor (0-50)
  max: number;      // Maximum armor (50)
}

export interface HelmetComponent {
  hasHelmet: boolean;  // Whether player has helmet equipped
  helmetHealth: number;  // Current helmet health (0-20)
  maxHelmetHealth: number;  // Maximum helmet health (20)
}

export interface BuildingComponent {
  ownerEntityId: number;           // Entity ID of the player who owns this building
  gridPositionX: number;           // World position of grid root
  gridPositionY: number;
  gridPositionZ: number;
  gridRotationY: number;           // Y rotation of grid
  voxelData: Uint8Array;           // 12x12x12 grid, value = colorIndex + 1 (0 = empty)
  gridSize: number;                // 12
}

export interface LadderColliderComponent {
  width: number;       // Trigger box width
  height: number;      // Trigger box height (matches ladder height)
  depth: number;       // Trigger box depth
  normalX: number;     // Surface normal X (which wall it's on)
  normalY: number;     // Surface normal Y
  normalZ: number;     // Surface normal Z
  segmentCount: number; // Number of ladder segments
}

export interface StatsComponent {
  kills: number;           // Number of kills this session
  deaths: number;          // Number of deaths this session
  damageDealt: number;     // Total damage dealt to other players
  shotsFired: number;      // Total shots fired
  shotsHit: number;        // Total shots that hit a target
}
