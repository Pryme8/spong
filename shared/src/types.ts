// Shared type definitions

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vector3;
  rotation: Quaternion;
}

// Physics constants - NOW IN physicsConstants.ts
// Re-exported here for backward compatibility
export { 
  FIXED_TIMESTEP,
  MAX_ACCUMULATED_TIME,
  GRAVITY,
  GROUND_HEIGHT,
  CHARACTER,
  COLLECTABLE,
  PROJECTILE,
  // Legacy flat exports (deprecated)
  MOVEMENT_ACCELERATION,
  MOVEMENT_MAX_SPEED,
  MOVEMENT_FRICTION,
  AIR_CONTROL,
  JUMP_VELOCITY,
  PROJECTILE_GRAVITY,
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  PROJECTILE_LIFETIME_SHOTGUN,
  PROJECTILE_RADIUS,
  PROJECTILE_SPAWN_OFFSET,
  PROJECTILE_SUBSTEPS,
  PROJECTILE_COLLISION_INTERVAL
} from './physicsConstants.js';

// Non-physics constants
export const ROTATION_SPEED = 3.0; // Radians per second

// Gameplay constants (not physics)
export const PROJECTILE_DAMAGE = 25; // Damage per hit

// Shooting constants
export const SHOOT_COOLDOWN_MS = 200; // Milliseconds between shots (300 RPM)
export const SHOOT_COOLDOWN_S = 0.2; // Same in seconds for server

// Player constants
export const PLAYER_HITBOX_HALF = 0.5; // Half-extent of 1x1x1 cube hitbox
export const PLAYER_CAPSULE_RADIUS = 0.4; // Capsule radius for player-vs-player collision
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_HITBOX_CENTER_Y = 0.5; // Center of hitbox above ground
