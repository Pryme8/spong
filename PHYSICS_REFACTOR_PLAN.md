# Physics & Collision System Refactor Plan

**Date**: 2026-02-09
**Status**: Planning
**Goal**: Unify physics systems, fix client prediction desync, and enable player gravity on building blocks

---

## 🔴 Critical Issues Identified

### 1. Client-Side Missing Block Collision
**Impact**: Players don't fall off building blocks correctly
- **Server**: Passes `blockColliders` to `stepCharacter()` ✅
- **Client**: Missing `blockColliders` in `LocalTransform.ts` (lines 177, 216) ❌
- **Result**: Client prediction doesn't match server, causing desync and weird gravity behavior

### 2. Three Separate Physics Systems
**Problem**: Duplicate code across character, collectable, and projectile physics
- `shared/src/physics.ts` - Character (GRAVITY = -20.0)
- `shared/src/collectablePhysics.ts` - Collectables (GRAVITY = -20)  
- `shared/src/projectile.ts` - Projectiles (PROJECTILE_GRAVITY = -9.8) ⚠️
- Each has its own gravity, collision detection, and position integration

### 3. Scattered Collision Detection
**Problem**: Different collision systems for different entity types
- Character: Voxel Grid + Trees + Rocks + Building Blocks (AABB)
- Collectables: Flat ground plane only
- Projectiles: Raycast-based
- No unified collision query system

### 4. Building State Not Synced to Main Game
**Problem**: Building data only exists in `BuilderView`, not `GameView`
- Server creates `buildingEntity` and generates `blockColliders`
- Client only handles building in build mode (`BuildModeManager`)
- Main game has no access to building collision data

---

## 📋 Implementation Plan

### **Priority 1: Fix Client Prediction Desync** ⚡
**Goal**: Make player gravity work correctly on building blocks
**Timeline**: Immediate (critical bug fix)

#### Tasks:
1. **Create BuildingCollisionManager** (`client/src/engine/BuildingCollisionManager.ts`)
   - Store building position, rotation, voxel data
   - Generate block colliders in same format as server
   - Expose `getBlockColliders()` method

2. **Integrate with GameSession** (`client/src/composables/useGameSession.ts`)
   - Create BuildingCollisionManager instance
   - Listen for building network messages:
     - `Opcode.BuildingInitialState` - Initial building sync
     - `Opcode.BlockPlace` - Add block to collision data
     - `Opcode.BlockRemove` - Remove block from collision data
   - Pass manager to transformSync

3. **Update LocalTransform** (`client/src/engine/LocalTransform.ts`)
   - Add `blockColliders` parameter to constructor
   - Pass `blockColliders` to both `stepCharacter()` calls (lines 177, 216)
   - Ensure client physics matches server exactly

4. **Update useTransformSync** (`client/src/composables/useTransformSync.ts`)
   - Accept `buildingCollisionManager` parameter
   - Pass block colliders to LocalTransform during creation
   - Update `fixedUpdateAll()` if needed

5. **Test & Verify**
   - Player falls when walking off building blocks ✅
   - No visual jitter or snapping
   - Client prediction stays in sync with server

---

### **Priority 2: Unify Physics Systems** 🔧
**Goal**: Single physics system reused by all entities
**Timeline**: After Priority 1 is working

#### Tasks:
1. **Create Unified Constants** (`shared/src/physicsConstants.ts`)
   ```typescript
   export const GRAVITY = -20.0;
   export const GROUND_HEIGHT = 0.0;
   export const FIXED_TIMESTEP = 1 / 60;
   ```

2. **Create PhysicsComponent Interface** (`shared/src/components/PhysicsComponent.ts`)
   ```typescript
   interface PhysicsComponent {
     posX: number; posY: number; posZ: number;
     velX: number; velY: number; velZ: number;
     mass: number;
     friction: number;
     restitution: number;  // Bounce
     collisionShape: 'aabb' | 'sphere' | 'capsule' | 'mesh';
     halfExtents: { x: number; y: number; z: number };
     isGrounded: boolean;
     useGravity: boolean;
   }
   ```

3. **Create Generic stepPhysics()** (`shared/src/unifiedPhysics.ts`)
   - Accepts `PhysicsComponent` + collision data
   - Applies gravity if `useGravity === true`
   - Resolves collisions using unified collision manager
   - Handles all entity types with one function

4. **Refactor Character Physics**
   - Keep `CharacterState` for backward compatibility
   - Internally map to `PhysicsComponent`
   - Use `stepPhysics()` for actual physics step
   - Keep character-specific input handling separate

5. **Refactor Collectable Physics**
   - Convert to use `PhysicsComponent`
   - Use `stepPhysics()` instead of custom implementation
   - Remove duplicate gravity constant

6. **Refactor Projectile Physics**
   - Convert to use `PhysicsComponent`
   - Use `stepPhysics()` for gravity and movement
   - Keep raycast collision for hit detection

7. **Remove Old Physics Files**
   - Archive `collectablePhysics.ts`
   - Archive old projectile physics code
   - Update all imports

---

### **Priority 3: Unified Collision Manager** 🎯
**Goal**: Single system handles all collision queries
**Timeline**: After Priority 2 is complete

#### Tasks:
1. **Create CollisionWorld** (`shared/src/collision/CollisionWorld.ts`)
   - Stores all collidable objects
   - Provides query API:
     - `queryAABB(minX, minY, minZ, maxX, maxY, maxZ): Collider[]`
     - `raycast(origin, direction, maxDistance): RaycastHit | null`
     - `sweepAABB(aabb, velocity): SweepResult`

2. **Create Collider Types**
   - `VoxelGridCollider` - Wraps voxel grid
   - `AABBCollider` - Building blocks, simple boxes
   - `CylinderCollider` - Trees
   - `MeshCollider` - Rocks
   - `CapsuleCollider` - Players (for player-vs-player)

3. **Update stepPhysics() to Use CollisionWorld**
   - Remove separate voxel/tree/rock/block parameters
   - Single `collisionWorld` parameter
   - Query relevant colliders for each physics step

4. **Integrate with Server Physics Loop**
   - Build `CollisionWorld` once per tick
   - Add voxel grid, trees, rocks, building blocks
   - Pass to all physics steps

5. **Integrate with Client Physics Loop**
   - Build client-side `CollisionWorld`
   - Use same collision data as server
   - Ensure prediction consistency

---

### **Priority 4: Add Building Visualization to GameView** 🎨
**Goal**: See building blocks in main game, not just build mode
**Timeline**: Optional - after core physics is working

#### Tasks:
1. **Create BuildingMesh Manager** (`client/src/engine/BuildingMesh.ts`)
   - Similar to `BuildGrid` but read-only
   - Creates instanced meshes for blocks
   - Updates when blocks placed/removed

2. **Integrate with GameSession**
   - Create `BuildingMesh` instance
   - Share collision data with `BuildingCollisionManager`
   - Render blocks in main game view

3. **Optimize for Performance**
   - Use greedy meshing if many blocks
   - Instance blocks when possible
   - LOD for distant buildings

---

## 🔒 Rules & Constraints

### Physics Rules
1. **Server is Authoritative**: All physics runs on server, client only predicts
2. **Determinism**: Client and server must use IDENTICAL physics code
3. **Fixed Timestep**: Always 60Hz (1/60 = 0.01666... seconds)
4. **No Divergence**: Client physics must match server exactly or prediction fails

### Collision Rules
1. **Static vs Dynamic**: Building blocks are static (mass = 0), players are dynamic
2. **No Penetration**: Collision resolution must prevent all penetration
3. **Consistent Order**: Process collisions in same order on client and server
4. **Ground Detection**: Must check ALL collision types (voxels, blocks, trees, rocks)

### Code Quality Rules
1. **No Duplication**: Reuse systems, don't copy-paste physics code
2. **Single Responsibility**: Each manager handles one concern
3. **Type Safety**: Use TypeScript interfaces for all physics data
4. **Performance**: Build collision data once per tick, reuse for all entities

### Testing Requirements
1. **Client-Server Sync**: No visual jitter or rubber-banding
2. **Gravity Works Everywhere**: Player falls off any surface correctly
3. **Collision Accuracy**: No falling through floors, walls, or blocks
4. **Performance**: 60 FPS with full collision detection

---

## 📊 Success Criteria

### Priority 1 Success
- [ ] Player falls when walking off building blocks
- [ ] No visual jitter or position snapping
- [ ] Client prediction matches server state
- [ ] Ground detection works on blocks

### Priority 2 Success
- [ ] Single gravity constant used everywhere
- [ ] Character, collectable, projectile use same physics core
- [ ] Less than 500 lines of duplicated code removed
- [ ] All tests passing

### Priority 3 Success
- [ ] Single `CollisionWorld` API used by all systems
- [ ] Easy to add new collision types
- [ ] Collision queries < 1ms per entity
- [ ] No hardcoded collision logic in physics step

### Priority 4 Success
- [ ] Buildings visible in main game view
- [ ] Performance: 60 FPS with buildings rendered
- [ ] Memory: < 50MB for large buildings
- [ ] Visual quality matches build mode

---

## 🚧 Implementation Notes

### Don't Break Existing Systems
- Keep backward compatibility during refactor
- Run old and new systems in parallel if needed
- Extensive testing before removing old code

### Client-Server Consistency
- Any change to physics MUST update both client and server
- Test network latency scenarios (50ms, 100ms, 200ms)
- Verify reconciliation handles corrections smoothly

### Performance Monitoring
- Track physics step time (target: < 2ms per entity)
- Monitor collision queries (target: < 1ms)
- Check memory usage for collision data

### Rollback Plan
- Keep old physics code in separate files
- Feature flag for new unified system
- Can revert if critical issues found

---

## 📝 Current Status

**Phase**: Planning Complete
**Next Action**: Begin Priority 1 implementation
**Blocking Issues**: None
**Estimated Time**: 
- Priority 1: 2-4 hours
- Priority 2: 4-6 hours  
- Priority 3: 4-6 hours
- Priority 4: 2-3 hours

---

## 📚 Related Files

### Server Files
- `server/src/rooms/Room.ts` - Main physics loop, block collider generation
- `server/src/engine/RemoteTransform.ts` - Server-side character transforms

### Client Files
- `client/src/engine/LocalTransform.ts` - Client prediction (needs block colliders)
- `client/src/composables/useTransformSync.ts` - Transform synchronization
- `client/src/composables/useGameSession.ts` - Main game initialization
- `client/src/engine/BuildModeManager.ts` - Build mode (reference for block handling)
- `client/src/engine/BuildGrid.ts` - Build grid (reference for collision generation)

### Shared Files
- `shared/src/physics.ts` - Character physics (stepCharacter)
- `shared/src/collectablePhysics.ts` - Collectable physics (duplicate)
- `shared/src/projectile.ts` - Projectile physics (duplicate)
- `shared/src/collision.ts` - Collision utilities
- `shared/src/types.ts` - Physics constants
- `shared/src/components/index.ts` - Component interfaces (BuildingComponent)
