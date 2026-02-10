/**
 * Unified Physics Constants
 * 
 * All physics systems (character, collectable, projectile) should import from here
 * to ensure consistency and avoid duplication.
 */

// ═══════════════════════════════════════════════════════════
// Core Physics Constants
// ═══════════════════════════════════════════════════════════

/**
 * Primary gravity constant used by most entities.
 * Units: units per second squared (negative = downward)
 */
export const GRAVITY = -20.0;

/**
 * Ground plane height (Y coordinate).
 * Used as fallback when no voxel terrain exists.
 */
export const GROUND_HEIGHT = 0.0;

/**
 * Fixed timestep for physics simulation (60Hz).
 * Both client and server MUST use this for determinism.
 */
export const FIXED_TIMESTEP = 1.0 / 60.0;

/**
 * Maximum accumulated time before clamping (prevents spiral of death).
 */
export const MAX_ACCUMULATED_TIME = 0.25;

// ═══════════════════════════════════════════════════════════
// Entity-Specific Physics
// ═══════════════════════════════════════════════════════════

/**
 * Character-specific constants
 */
export const CHARACTER = {
  /** Movement acceleration (units/s²) */
  ACCELERATION: 35.0,
  /** Maximum movement speed (units/s) */
  MAX_SPEED: 8.0,
  /** Friction/deceleration when no input (units/s²) */
  FRICTION: 15.0,
  /** Air control multiplier (0.0 = no control, 1.0 = full control) */
  AIR_CONTROL: 0.3,
  /** Jump initial velocity (units/s) */
  JUMP_VELOCITY: 8.0,
  /** Maximum height player can step up (units) */
  STEP_HEIGHT: 0.6,
  /** Player hitbox half-extents (units) */
  HITBOX_HALF: 0.3,
  /** Player capsule radius for player-vs-player collision (units) */
  CAPSULE_RADIUS: 0.5,
} as const;

/**
 * Collectable-specific constants
 */
export const COLLECTABLE = {
  /** Bounce damping factor (0.0 = no bounce, 1.0 = perfect bounce) */
  BOUNCE_DAMPING: 0.3,
  /** Velocity threshold for settling (units/s) */
  SETTLE_THRESHOLD: 0.5,
} as const;

/**
 * Projectile-specific constants
 * 
 * NOTE: Projectiles use lighter gravity (-9.8 vs -20.0) for gameplay reasons.
 * This makes projectiles arc more realistically at longer ranges.
 */
export const PROJECTILE = {
  /** Base projectile speed (units/s) */
  SPEED: 25.0,
  /** Gravity for projectiles (lighter than entity gravity) */
  GRAVITY: -9.8,
  /** Distance before gravity starts affecting projectile (units) */
  GRAVITY_START_DISTANCE: 0.0,
  /** Collision sphere radius (units) */
  RADIUS: 0.075,
  /** Number of collision substeps for fast projectiles */
  SUBSTEPS: 4,
  /** Lifetime before auto-destroy (seconds) */
  LIFETIME: 2.0,
  /** Shotgun pellet lifetime (seconds) - shorter for close range */
  LIFETIME_SHOTGUN: 0.5,
  /** Spawn offset in front of player (units) */
  SPAWN_OFFSET: 0.75,
  /** Collision check interval (ARMA-style optimization) */
  COLLISION_INTERVAL: 3,
} as const;

// Legacy flat exports for backward compatibility
export const PROJECTILE_SPEED = PROJECTILE.SPEED;
export const PROJECTILE_LIFETIME = PROJECTILE.LIFETIME;
export const PROJECTILE_LIFETIME_SHOTGUN = PROJECTILE.LIFETIME_SHOTGUN;
export const PROJECTILE_RADIUS = PROJECTILE.RADIUS;
export const PROJECTILE_SPAWN_OFFSET = PROJECTILE.SPAWN_OFFSET;
export const PROJECTILE_SUBSTEPS = PROJECTILE.SUBSTEPS;
export const PROJECTILE_COLLISION_INTERVAL = PROJECTILE.COLLISION_INTERVAL;

// ═══════════════════════════════════════════════════════════
// Deprecated - Use PROJECTILE.GRAVITY instead
// ═══════════════════════════════════════════════════════════

/**
 * @deprecated Use PROJECTILE.GRAVITY instead
 * Kept for backward compatibility during refactor
 */
export const PROJECTILE_GRAVITY = PROJECTILE.GRAVITY;

/**
 * @deprecated Import from physicsConstants instead
 * Kept for backward compatibility during refactor
 */
export const MOVEMENT_ACCELERATION = CHARACTER.ACCELERATION;

/**
 * @deprecated Import from physicsConstants instead
 * Kept for backward compatibility during refactor
 */
export const MOVEMENT_MAX_SPEED = CHARACTER.MAX_SPEED;

/**
 * @deprecated Import from physicsConstants instead
 * Kept for backward compatibility during refactor
 */
export const MOVEMENT_FRICTION = CHARACTER.FRICTION;

/**
 * @deprecated Import from physicsConstants instead
 * Kept for backward compatibility during refactor
 */
export const AIR_CONTROL = CHARACTER.AIR_CONTROL;

/**
 * @deprecated Import from physicsConstants instead
 * Kept for backward compatibility during refactor
 */
export const JUMP_VELOCITY = CHARACTER.JUMP_VELOCITY;
