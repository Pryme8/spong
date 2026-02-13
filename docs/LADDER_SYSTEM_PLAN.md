# Ladder System Implementation Plan

## Overview
Implement a ladder placement and climbing system. This plan covers Phase 1 (placement and visuals) with Phase 2 (climbing behavior) deferred to TODO list.

---

## Phase 1: Ladder Placement System

### 1. Ladder Mesh (`client/src/engine/LadderMesh.ts`)

**Visual Design:**
- Two vertical cylinders (poles): 0.5 units tall, positioned 1 unit apart
- Horizontal rungs: Smaller radius cylinders, rotated 90°, positioned at 0.25 units on Y-axis between poles
- Material: Brown/wooden appearance with slight metallic shine
- Instanced geometry using `MeshPrimitives` for performance

**Function Signature:**
```typescript
export function createLadderMesh(name: string, scene: Scene, options?: LadderMeshOptions): TransformNode
export function createLadderSegmentMesh(name: string, scene: Scene, numSegments: number): TransformNode
export function disposeLadderMesh(name: string, scene: Scene): void
```

**Implementation Details:**
- `createLadderMesh()` - Creates a single 0.5 unit segment (2 poles + 1 rung)
- `createLadderSegmentMesh()` - Creates extended ladder with multiple segments stacked vertically
- Use `MeshPrimitives.createCylinderInstance()` for all geometry
- Root node contains all children for easy manipulation
- Support shadow casting via `ShadowManager`

**Measurements:**
- Pole height: 0.5 units (per segment)
- Pole radius: 0.05 units
- Pole separation: 1.0 unit (center to center)
- Rung length: 1.0 unit (spans between poles)
- Rung radius: 0.03 units (smaller than poles)
- Rung position Y: 0.25 units (middle of segment)
- Segment spacing: Every 0.5 units vertically

---

### 2. Ladder Placement System (`client/src/engine/LadderPlacementSystem.ts`)

**Core Responsibilities:**
- Raycast against terrain and building blocks
- Show transparent ladder preview
- Handle multi-segment ladder extension
- Finalize placement and spawn ladder entity

**State Machine:**
```
IDLE → INITIAL_PLACEMENT → EXTENDING_UP → FINALIZING → IDLE
```

**Class Structure:**
```typescript
export class LadderPlacementSystem {
  private scene: Scene;
  private camera: Camera;
  private networkClient: NetworkClient | null;
  
  // Preview state
  private previewRoot: TransformNode | null;
  private previewMeshes: Mesh[];
  private isPlacementActive: boolean;
  
  // Placement state
  private firstSegmentPosition: Vector3 | null;
  private firstSegmentNormal: Vector3 | null;
  private segmentCount: number;
  private readonly MAX_SEGMENTS = 20; // 10 units tall max
  
  constructor(scene, camera, networkClient);
  update(): void;
  handleRightClick(): void;
  isActive(): boolean;
  dispose(): void;
}
```

**Raycast Logic:**

**Step 1: Initial Placement**
- Raycast against terrain/building blocks
- Check normal is NOT up (0, 1, 0) or down (0, -1, 0)
- Valid normals: Side faces only (walls, slopes with |normal.y| < 0.9)
- Show single transparent segment preview at hit point
- Store first segment position and normal

**Step 2: Extension Detection**
- After initial placement, continuously raycast upward
- Constrain raycast to same X or Z position as first segment (depending on normal)
- Example: If normal is (+X, 0, 0), lock X position and raycast along +Y
- Check hits every 0.5 units upward
- Valid hit: Same normal as first segment (±0.1 tolerance), on valid surface
- Show transparent segment preview for each valid 0.5 unit increment

**Step 3: Finalization**
- Right-click again to place ladder
- Send network message with: first position, normal, segment count
- Server spawns single ladder entity at first segment position
- Client spawns ladder mesh with all segments

**Preview Visual:**
- Transparent material (alpha: 0.4)
- Emissive color: Green (valid) or Red (invalid)
- Update every frame based on camera look direction

---

### 3. Item Integration

#### 3.1 Shared Item Definition (`shared/src/items.ts`)

Add ladder creation function:
```typescript
export function createLadder(entity: Entity): Entity {
  const weaponType: WeaponTypeComponent = { type: 'ladder' };
  
  entity
    .add(COMP_WEAPON_TYPE, weaponType)
    .tag(TAG_COLLECTABLE);
  
  return entity;
}
```

Update `WeaponType` type in `shared/src/types.ts`:
```typescript
export type WeaponType = 
  | 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'sniper' 
  | 'assault' | 'rocket' | 'hammer' | 'ladder';
```

#### 3.2 Client Item System (`client/src/engine/ItemSystem.ts`)

Add ladder mesh handling in `handleSpawn()`:
```typescript
else if (payload.itemType === 'ladder') {
  node = createLadderMesh(`item_${payload.entityId}`, scene);
}
```

Add ladder equip handling in `handlePickup()`:
```typescript
else if (payload.itemType === 'ladder') {
  console.log(`[ItemSystem] We picked up a LADDER! Placement enabled!`);
  if (hasLadder) {
    hasLadder.value = true;
  }
}
```

---

### 4. Server-Side Implementation

#### 4.1 Ladder Entity Spawning (`server/src/rooms/Room.ts`)

**On Ladder Placement Message:**
```typescript
// Receive: { posX, posY, posZ, normalX, normalY, normalZ, segmentCount }

// Create ladder entity
const ladderEntity = this.world.create();
const transform = {
  posX, posY, posZ,
  velX: 0, velY: 0, velZ: 0,
  rotX: 0, rotY: calculateRotationFromNormal(normalX, normalZ), rotZ: 0
};

// Create box collider for climbing trigger
const height = segmentCount * 0.5;
const colliderBox = {
  width: 1.2,   // Slightly wider than ladder
  height,       // Matches ladder height
  depth: 0.4    // Shallow depth for wall-mounted
};

ladderEntity
  .add(COMP_TRANSFORM, transform)
  .add(COMP_LADDER_COLLIDER, colliderBox)
  .tag(TAG_LADDER);

// Broadcast to all clients
this.broadcast(Opcode.LadderSpawned, {
  entityId: ladderEntity.id,
  posX, posY, posZ,
  normalX, normalY, normalZ,
  segmentCount
});
```

#### 4.2 New Component Definition (`shared/src/components/index.ts`)

```typescript
export interface LadderColliderComponent {
  width: number;
  height: number;
  depth: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

export const COMP_LADDER_COLLIDER = Symbol('ladder_collider');
export const TAG_LADDER = Symbol('ladder');
```

---

### 5. Client-Side Ladder Entity (`client/src/views/GameView.vue`)

**On LadderSpawned Message:**
```typescript
networkClient.onLowFrequency(Opcode.LadderSpawned, (data) => {
  const { entityId, posX, posY, posZ, normalX, normalY, normalZ, segmentCount } = data;
  
  // Create visual ladder mesh
  const ladderMesh = createLadderSegmentMesh(`ladder_${entityId}`, scene, segmentCount);
  ladderMesh.position.set(posX, posY, posZ);
  ladderMesh.rotation.y = calculateRotationFromNormal(normalX, normalZ);
  
  // Store in ladder registry
  ladderMeshes.set(entityId, ladderMesh);
  
  // Create trigger collider (invisible box mesh)
  const triggerBox = MeshBuilder.CreateBox(`ladderTrigger_${entityId}`, {
    width: 1.2,
    height: segmentCount * 0.5,
    depth: 0.4
  }, scene);
  triggerBox.position.copyFrom(ladderMesh.position);
  triggerBox.rotation.copyFrom(ladderMesh.rotation);
  triggerBox.isVisible = false; // Hidden, used for physics detection
  triggerBox.isPickable = false;
  
  ladderTriggers.set(entityId, triggerBox);
});
```

---

### 6. Input Handling Integration

#### 6.1 GameView Input (`client/src/views/GameView.vue`)

Add ladder placement mode toggle:
```typescript
const hasLadder = ref(false);
const isLadderPlacementActive = ref(false);

// When ladder is equipped and right-click is pressed
const handleRightClick = () => {
  if (hasLadder.value && !isLadderPlacementActive.value) {
    // Start ladder placement
    ladderPlacementSystem.handleRightClick();
  } else if (isLadderPlacementActive.value) {
    // Finalize ladder placement
    ladderPlacementSystem.handleRightClick();
  }
};
```

#### 6.2 Input Priority
- Ladder placement should be exclusive (no shooting/building while placing)
- ESC key cancels ladder placement
- Switching items cancels ladder placement

---

## Phase 2: Climbing Behavior (TODO - Separate Task)

This will be implemented later and includes:
- [ ] Detect player collision with ladder trigger box
- [ ] Override player input to control climbing movement
- [ ] Vertical movement along ladder (up/down with W/S or Arrow keys)
- [ ] Smooth camera transitions when mounting/dismounting
- [ ] Animation states (if player model exists)
- [ ] Network sync for climbing state
- [ ] Prevent ladder use while in combat (optional)

---

## Network Protocol Updates

### New Opcodes (add to `shared/src/protocol.ts`)

```typescript
export enum Opcode {
  // ... existing opcodes ...
  LadderPlace = 60,        // Client → Server: Place ladder request
  LadderSpawned = 61,      // Server → Client: Ladder entity created
  LadderDestroy = 62,      // Client → Server: Remove ladder
  LadderDestroyed = 63,    // Server → Client: Ladder removed
}

export interface LadderPlaceMessage {
  posX: number;
  posY: number;
  posZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  segmentCount: number;
}

export interface LadderSpawnedMessage {
  entityId: number;
  posX: number;
  posY: number;
  posZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  segmentCount: number;
}
```

---

## File Checklist

### New Files to Create:
- [ ] `client/src/engine/LadderMesh.ts`
- [ ] `client/src/engine/LadderPlacementSystem.ts`

### Files to Modify:
- [ ] `shared/src/items.ts` - Add `createLadder()`
- [ ] `shared/src/types.ts` - Add `'ladder'` to `WeaponType`
- [ ] `shared/src/components/index.ts` - Add `LadderColliderComponent`
- [ ] `shared/src/protocol.ts` - Add ladder opcodes and messages
- [ ] `client/src/engine/ItemSystem.ts` - Add ladder mesh and pickup handling
- [ ] `client/src/views/GameView.vue` - Add ladder placement integration
- [ ] `server/src/rooms/Room.ts` - Add ladder entity spawning and network handlers

---

## Testing Plan

### Unit Tests:
1. **Ladder Mesh Creation**: Verify geometry is correct (poles, rungs, spacing)
2. **Raycast Detection**: Test normal filtering (reject up/down, accept sides)
3. **Multi-Segment Extension**: Test segment counting at various heights
4. **Preview Updates**: Verify transparency, color changes, position updates

### Integration Tests:
1. **Placement on Terrain**: Place ladder on hills, cliffs, different slopes
2. **Placement on Buildings**: Place ladder on building block walls
3. **Invalid Placement**: Ensure rejection on flat ground, ceilings
4. **Network Sync**: Verify all clients see placed ladders correctly
5. **Trigger Colliders**: Confirm invisible box colliders spawn correctly

### Visual Tests:
1. Preview shows correct segments as looking up
2. Transparent preview is visible and updates smoothly
3. Placed ladder matches preview exactly
4. Multiple ladders can coexist without visual artifacts

---

## Performance Considerations

- Use instanced geometry for ladder meshes (via `MeshPrimitives`)
- Maximum 20 segments per ladder (10 units tall) to prevent excessive geometry
- Dispose preview meshes when placement is canceled
- Efficient raycast: Only check against terrain/building meshes, skip other entities

---

## Known Limitations

1. **No Ladder Removal Yet**: Players cannot destroy placed ladders (add to future TODO)
2. **No Collision with Ladder**: Ladders are visual-only, won't block projectiles/players (except for climbing trigger)
3. **Limited to Vertical**: Cannot place angled ladders (only vertical segments)
4. **Single Material**: All ladders use same brown/wood material (no customization)

---

## Summary

This plan provides a complete roadmap for implementing ladder placement. The system is designed to be:
- **Modular**: LadderMesh and LadderPlacementSystem are separate, reusable components
- **Extensible**: Easy to add climbing behavior in Phase 2
- **Network-Ready**: Full client-server synchronization from the start
- **Performant**: Uses instanced geometry and efficient raycasting

Implementation should follow this order:
1. LadderMesh.ts (visual foundation)
2. Shared items and types (data layer)
3. LadderPlacementSystem.ts (placement logic)
4. ItemSystem integration (equip/pickup)
5. Server-side entity spawning (network layer)
6. Client-side entity handling (visual spawning)
7. Testing and refinement

After Phase 1 is complete, climbing behavior can be implemented as a separate, focused task.
