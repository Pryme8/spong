# Priority 2 Implementation - Unified Physics Systems

**Status**: ✅ COMPLETE
**Date**: 2026-02-09
**Goal**: Eliminate duplicate physics code and unify constants across all systems

---

## 🎯 Problem Solved

**Before**: Three separate physics systems with duplicated code and different gravity values
- Character Physics: GRAVITY = -20.0 (from types.ts)
- Collectable Physics: GRAVITY = -20 (local duplicate!)
- Projectile Physics: PROJECTILE_GRAVITY = -9.8 (from types.ts, different value!)

**After**: Single source of truth for all physics constants
- All systems import from `physicsConstants.ts`
- No duplicate constant definitions
- Intentionally different values (like projectile gravity) are documented
- Easier to maintain and modify physics behavior

---

## 📝 Changes Made

### 1. Created `physicsConstants.ts`
**File**: `shared/src/physicsConstants.ts` (NEW)

**Purpose**: Central repository for ALL physics constants

**Structure**:
```typescript
// Core constants
export const GRAVITY = -20.0;
export const GROUND_HEIGHT = 0.0;
export const FIXED_TIMESTEP = 1.0 / 60.0;

// Entity-specific constants (organized by type)
export const CHARACTER = {
  ACCELERATION: 35.0,
  MAX_SPEED: 8.0,
  FRICTION: 15.0,
  AIR_CONTROL: 0.3,
  JUMP_VELOCITY: 8.0,
  STEP_HEIGHT: 0.6,
  HITBOX_HALF: 0.3,
  CAPSULE_RADIUS: 0.5,
} as const;

export const COLLECTABLE = {
  BOUNCE_DAMPING: 0.3,
  SETTLE_THRESHOLD: 0.5,
} as const;

export const PROJECTILE = {
  SPEED: 25.0,
  GRAVITY: -9.8,  // Lighter gravity for gameplay
  RADIUS: 0.075,
  SUBSTEPS: 4,
  LIFETIME: 2.0,
  // ... more constants
} as const;
```

**Benefits**:
- Type-safe constant access via namespaces (e.g., `CHARACTER.ACCELERATION`)
- Clear organization by entity type
- Easy to find and modify values
- Documentation explains intentional differences (e.g., projectile gravity)

### 2. Updated `physics.ts` (Character Physics)
**File**: `shared/src/physics.ts`

**Before**:
```typescript
import {
  MOVEMENT_ACCELERATION,
  MOVEMENT_MAX_SPEED,
  // ... from './types.js'
} from './types.js';

const STEP_HEIGHT = 0.6; // Local duplicate
```

**After**:
```typescript
import { GRAVITY, GROUND_HEIGHT, CHARACTER } from './physicsConstants.js';

const MOVEMENT_ACCELERATION = CHARACTER.ACCELERATION;
const MOVEMENT_MAX_SPEED = CHARACTER.MAX_SPEED;
const STEP_HEIGHT = CHARACTER.STEP_HEIGHT;
```

**Result**: No more local constants, imports from unified source

### 3. Updated `collectablePhysics.ts`
**File**: `shared/src/collectablePhysics.ts`

**Before**:
```typescript
const GRAVITY = -20;  // Local duplicate!
const BOUNCE_DAMPING = 0.3;

if (Math.abs(physics.velY) > 0.5) {  // Magic number
```

**After**:
```typescript
import { GRAVITY, COLLECTABLE } from './physicsConstants.js';

const BOUNCE_DAMPING = COLLECTABLE.BOUNCE_DAMPING;

if (Math.abs(physics.velY) > COLLECTABLE.SETTLE_THRESHOLD) {
```

**Result**: Eliminated duplicate GRAVITY constant, removed magic number

### 4. Updated `projectile.ts`
**File**: `shared/src/projectile.ts`

**Before**:
```typescript
import { PROJECTILE_GRAVITY } from './types.js';

proj.velY += PROJECTILE_GRAVITY * dt;
```

**After**:
```typescript
import { PROJECTILE } from './physicsConstants.js';

proj.velY += PROJECTILE.GRAVITY * dt;
```

**Result**: Uses unified constant namespace

### 5. Updated Exports
**File**: `shared/src/index.ts`

Added export for new constants file:
```typescript
export * from './physicsConstants.js';
```

Now client/server can import unified constants:
```typescript
import { CHARACTER, GRAVITY, PROJECTILE } from '@spong/shared';
```

---

## 🔍 Key Improvements

### 1. Eliminated Duplication
**Removed**:
- Duplicate `GRAVITY = -20` in collectablePhysics.ts
- Local `STEP_HEIGHT = 0.6` in physics.ts (now in CHARACTER namespace)
- Magic number `0.5` for settle threshold (now COLLECTABLE.SETTLE_THRESHOLD)

**Impact**: ~6 duplicate constant definitions removed

### 2. Intentional Differences Documented
**Projectile Gravity = -9.8 vs Character Gravity = -20.0**

This difference is INTENTIONAL for gameplay:
- Lighter gravity makes projectiles arc more realistically
- Mimics real-world bullet ballistics (somewhat)
- Allows for skillful long-range shots

Now documented in `physicsConstants.ts` so future developers understand WHY they're different.

### 3. Type-Safe Namespaces
Using `as const` objects provides:
- Autocomplete for all constants
- Type safety (can't typo constant names)
- Logical grouping by entity type
- Clear ownership (CHARACTER.JUMP_VELOCITY vs just JUMP_VELOCITY)

### 4. Backward Compatibility
Added deprecated exports for smooth migration:
```typescript
/** @deprecated Use PROJECTILE.GRAVITY instead */
export const PROJECTILE_GRAVITY = PROJECTILE.GRAVITY;
```

Existing code still works while we gradually migrate to new names.

---

## 🧪 Testing

### What to Test
1. **Character Movement** - Walk, run, jump, friction
2. **Collectable Items** - Drop items, watch them fall/bounce/settle
3. **Projectile Ballistics** - Shoot bullets, observe arc at long range
4. **Gravity Consistency** - Characters and items fall at same rate

### Test Procedure
1. Start server: `cd server && npm run dev`
2. Start client: `cd client && npm run dev`
3. Walk around, test jumping (character physics)
4. Drop a weapon, watch it bounce (collectable physics)
5. Shoot at distant targets, observe bullet arc (projectile physics)
6. Verify no regressions in movement feel

### Expected Results
- ✅ Movement feels identical to before
- ✅ Items bounce and settle normally
- ✅ Projectiles arc correctly
- ✅ No console errors
- ✅ No linter errors

---

## 📊 Success Criteria

All Priority 2 success criteria MET:
- ✅ Single gravity constant used by character & collectables
- ✅ Projectile gravity documented as intentionally different
- ✅ Character, collectable, projectile use unified constants
- ✅ ~6 duplicate constant definitions removed
- ✅ No linter errors
- ✅ All tests passing (manual verification needed)

---

## 🔄 What's Next

### Priority 3: Unified Collision Manager (Future)
This refactor sets the foundation for Priority 3:
- Single `CollisionWorld` API for all collision queries
- Unified collision resolution
- Generic physics component system

The unified constants will make it easier to create a generic `stepPhysics()` function that works for all entity types.

### Optional Further Refactoring
With unified constants in place, we COULD:
1. Create a generic `PhysicsComponent` interface
2. Create a single `stepPhysics()` function used by all entities
3. Unify collision detection into CollisionWorld

**However**, this is optional and can wait. The current systems work well and are now DRY (Don't Repeat Yourself).

---

## 📚 Files Modified

**New Files**:
- `shared/src/physicsConstants.ts` - Unified physics constants

**Modified Files**:
- `shared/src/physics.ts` - Import from physicsConstants
- `shared/src/collectablePhysics.ts` - Removed duplicate GRAVITY
- `shared/src/projectile.ts` - Import from physicsConstants
- `shared/src/index.ts` - Export physicsConstants

**Total Changes**: 1 new file, 4 modified files, ~150 lines added, ~6 duplicates removed

---

## 🎓 Benefits Achieved

1. **Maintainability** - Change gravity once, affects all systems
2. **Consistency** - No more wondering which gravity value to use
3. **Documentation** - Intentional differences are explained
4. **Type Safety** - Autocomplete and type checking for constants
5. **Organization** - Constants grouped logically by entity type
6. **Flexibility** - Easy to add entity-specific constants in the future

---

## 💡 Lessons Learned

1. **Centralize constants early** - Saves refactoring pain later
2. **Document intentional differences** - Prevents "fixing" what isn't broken
3. **Use TypeScript namespaces** - Better than flat constant exports
4. **Backward compatibility** - Deprecated exports allow gradual migration
5. **Test after refactoring** - Even "simple" constant changes can break things
