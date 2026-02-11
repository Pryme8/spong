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
 * Character-specific constants (LAND movement)
 */
export const CHARACTER = {
  /** Movement acceleration (units/s²) - Tighter, more responsive */
  ACCELERATION: 35.0,
  /** Maximum movement speed (units/s) */
  MAX_SPEED: 8.0,
  /** Friction/deceleration when no input (units/s²) - INCREASED for tighter control */
  FRICTION: 28.0,
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
 * Water/swimming-specific constants
 * These preserve the "frictionless" feel that land movement used to have.
 */
export const WATER = {
  /** Swimming acceleration (units/s²) - Lower than land for floaty feel */
  ACCELERATION: 20.0,
  /** Maximum swim speed (units/s) - 2/3 of sprint speed (8.0 * 1.5 * 2/3 = 8.0) */
  MAX_SPEED: 8.0,
  /** Maximum sprint-swim speed (units/s) - 4/3 of sprint speed (8.0 * 1.5 * 4/3 = 16.0) */
  MAX_SPEED_SPRINT: 16.0,
  /** Water friction/drag when no input (units/s²) - Low for smooth gliding */
  FRICTION: 12.0,
  /** Water control (3D movement, so higher than air control) */
  CONTROL: 0.85,
  /** Buoyancy force (upward, opposes gravity) (units/s²) - Very subtle for neutral swimming */
  BUOYANCY: 3.0,
  /** Maximum breath duration when head underwater (seconds) */
  MAX_BREATH: 10.0,
  /** Drowning damage per second when breath = 0 (HP/s) */
  DROWNING_DAMAGE: 5.0,
  /** Vertical movement speed when actively diving/surfacing (units/s) */
  VERTICAL_SWIM_SPEED: 3.0,
  /** Stamina drain when swimming (stamina/s) */
  SWIM_STAMINA_DRAIN: 15.0,
  /** Stamina drain when sprint-swimming (stamina/s) - double normal swimming */
  SWIM_SPRINT_STAMINA_DRAIN: 30.0,
} as const;

/**
 * Stamina system constants
 */
export const STAMINA = {
  /** Maximum stamina */
  MAX: 100,
  /** Sprint drain rate on land (stamina/s) */
  SPRINT_DRAIN: 15.0,
  /** Jump cost (instant stamina deduction) */
  JUMP_COST: 12,
  /** Regeneration rate when grounded (stamina/s) */
  REGEN_RATE: 10.0,
  /** Exhaustion recovery rate (stamina/s) - faster recovery when exhausted */
  EXHAUSTED_REGEN_RATE: 25.0,
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
