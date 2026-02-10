# Building System Implementation Plan

## Overview
Add a creative building mode where players can construct voxel-based structures using a 160³ grid, with real-time preview and greedy meshing for optimization.

---

## 🎯 PROOF OF CONCEPT SCOPE (Phase 1)

**This initial implementation is LOCAL ONLY - no network, no server, no ECS integration yet!**

### What We're Building First:
✅ `/builder` route with flat plane terrain  
✅ Press 'B' to toggle build mode  
✅ Yellow boundary cube (20×20×20)  
✅ Grid plane with lines (160×160)  
✅ Raycast from camera center  
✅ Semi-transparent preview block  
✅ Left-click to place block (instances)  
✅ Right-click to remove block  
✅ `[` and `]` to cycle colors (16 colors)  
✅ Press 'B' to finalize → run greedy meshing **locally**  
✅ Dispose instances, show final mesh  
✅ Right-click on final mesh to delete it  
✅ Press 'B' again to start new grid  

### What We're NOT Building Yet:
❌ Network synchronization  
❌ Server-side ECS entities  
❌ Multi-client building sync  
❌ Persistent storage  
❌ BuildingSystem.ts (network renderer)  
❌ Server-side BuildingManager  
❌ Network protocol messages  

**Goal:** Get the core building experience working locally first, then add network/ECS in Phase 2!

---

## 🔒 Future ECS Architecture (Phase 2 - Not Now!)

<details>
<summary>Click to expand future network/ECS plans (NOT for proof of concept)</summary>

### **MUST Follow Existing ECS Pattern**

1. **Server-Side Entities**
   - All finalized buildings MUST be ECS entities
   - Use `shared/src/components/index.ts` for component definitions
   - Server creates and manages building entities
   - Buildings stored in `World` like items, projectiles, etc.

2. **Component Structure**
   ```typescript
   // Building component (server-side)
   BuildingComponent {
     builderId: string;           // Player who built it
     voxelData: Uint8Array;       // 160³ grid (serialized)
     worldPosition: {x, y, z};    // Grid center position
     worldRotation: number;       // Y-axis rotation
     createdAt: number;           // Timestamp
   }
   
   // Mesh data component (server-side)
   BuildingMeshComponent {
     positions: Float32Array;     // Vertex positions
     normals: Float32Array;       // Vertex normals
     colors: Float32Array;        // Vertex colors
     indices: Uint32Array;        // Triangle indices
   }
   ```

3. **Network Synchronization**
   - New opcode: `BuildingSpawn` (like `ItemSpawn`, `TreeSpawn`)
   - Send mesh data to clients when they join
   - Clients reconstruct mesh from network data
   - Buildings synced to all players

4. **Client-Side Rendering**
   - `BuildingSystem.ts` (similar to `ItemSystem.ts`)
   - Manages building mesh instances on client
   - Receives network messages, creates/destroys meshes
   - NO client-side entity logic - render only

5. **Building Phase**
   - Building phase is CLIENT-ONLY (no ECS)
   - Uses temporary instances for preview
   - Only becomes ECS entity when finalized (press B)
   - Server receives final voxel data + position

</details>

---

## Phase 1: Builder Route & Scene Setup

### 1.1 Create Builder Route
**Files to create/modify:**
- `client/src/views/BuilderView.vue` - New view component
- `client/src/router/index.ts` - Add `/builder` route

**Tasks:**
- Copy structure from `ShootingRangeView.vue`
- Use `useGameSession` composable
- Initialize with flat plane terrain only
- No weapon/item spawns

### 1.2 Build Mode Input Handler
**Files to create/modify:**
- `client/src/engine/BuildModeManager.ts` - New class

**Responsibilities:**
- Listen for 'B' key press to toggle build mode
- Listen for '[' and ']' keys to cycle colors
- Manage active/inactive states
- Track current build grid
- Track current color selection (16 colors)
- Handle mouse clicks (left = place, right = remove)

**State:**
```typescript
class BuildModeManager {
  private isActive: boolean = false;
  private currentGrid: BuildGrid | null = null;
  private scene: Scene;
  private camera: Camera;
  private currentColorIndex: number = 0;
  private readonly COLOR_PALETTE: Color3[] = [
    new Color3(1, 1, 1),      // 0: White
    new Color3(0.5, 0.5, 0.5), // 1: Gray
    new Color3(0, 0, 0),      // 2: Black
    new Color3(1, 0, 0),      // 3: Red
    new Color3(0, 1, 0),      // 4: Green
    new Color3(0, 0, 1),      // 5: Blue
    new Color3(1, 1, 0),      // 6: Yellow
    new Color3(1, 0, 1),      // 7: Magenta
    new Color3(0, 1, 1),      // 8: Cyan
    new Color3(1, 0.5, 0),    // 9: Orange
    new Color3(0.5, 0, 1),    // 10: Purple
    new Color3(0.5, 0.25, 0), // 11: Brown
    new Color3(1, 0.75, 0.8), // 12: Pink
    new Color3(0, 0.5, 0),    // 13: Dark Green
    new Color3(0.5, 0, 0),    // 14: Dark Red
    new Color3(0, 0, 0.5)     // 15: Dark Blue
  ];
  
  toggleBuildMode(): void;
  isInBuildMode(): boolean;
  getCurrentGrid(): BuildGrid | null;
  cycleColorForward(): void;
  cycleColorBackward(): void;
  getCurrentColor(): Color3;
}
```

---

## Phase 2: Build Grid System

### 2.1 Build Grid Container
**Files to create:**
- `client/src/engine/BuildGrid.ts` - Main grid class

**⚠️ PROOF OF CONCEPT: Local only, no network!**

**Components:**
1. **Root TransformNode** - Parent for all grid elements
2. **Boundary Cube** - 20×20×20 yellow transparent double-sided box
3. **Grid Plane** - Middle horizontal plane with grid lines
4. **Voxel Data** - 160×160×160 Uint8Array for block states
5. **Instance Container** - Parent for all block instances
6. **Final Mesh** - Greedy meshed result (stored locally for now)

**Grid Structure:**
```typescript
class BuildGrid {
  // Dimensions
  readonly WORLD_SIZE = 20;        // World units (20×20×20)
  readonly GRID_SIZE = 160;        // Grid cells (160³)
  readonly CELL_SIZE = 0.125;      // 20/160 = 0.125 units per cell
  
  // Transform hierarchy
  private root: TransformNode;
  private boundaryCube: Mesh;
  private gridPlane: Mesh;
  private instanceContainer: TransformNode;
  
  // Voxel data (0 = empty, 1-16 = block color index)
  private voxelData: Uint8Array;  // 160³ = 4,096,000 bytes
  
  // Active block instances (for building phase)
  private blockInstances: Map<number, InstancedMesh>;
  
  // Final mesh (stored locally for proof of concept)
  private finalMesh: Mesh | null = null;
  private isFinalized: boolean = false;
}
```

### 2.2 Boundary Cube Creation
**Task:** Create yellow transparent wireframe cube

```typescript
createBoundaryCube(scene: Scene): Mesh {
  const cube = MeshBuilder.CreateBox('buildBoundary', {
    size: 20
  }, scene);
  
  const mat = new StandardMaterial('boundaryMat', scene);
  mat.diffuseColor = new Color3(1, 1, 0);      // Yellow
  mat.alpha = 0.2;                              // Transparent
  mat.backFaceCulling = false;                  // Double-sided
  mat.wireframe = true;                         // Wireframe
  
  cube.material = mat;
  return cube;
}
```

### 2.3 Grid Plane Creation
**Task:** Create middle plane with grid lines matching cell size

```typescript
createGridPlane(scene: Scene): Mesh {
  // Create plane at y=0 (middle of 20-unit cube)
  const plane = MeshBuilder.CreatePlane('gridPlane', {
    size: 20,
    sideOrientation: Mesh.DOUBLESIDE
  }, scene);
  plane.rotation.x = Math.PI / 2; // Horizontal
  
  // Custom shader or texture for grid lines
  // Grid should have 160 lines (one per cell)
  const mat = createGridMaterial(scene, 160);
  plane.material = mat;
  
  return plane;
}

// Grid material with procedural lines
createGridMaterial(scene: Scene, gridCount: number): ShaderMaterial {
  // Use shader to draw yellow lines every 1/160th
  // Background transparent
  // Lines at cell boundaries
}
```

### 2.4 Voxel Data Structure
**Task:** Initialize 160³ grid

```typescript
initVoxelData(): Uint8Array {
  const size = 160 * 160 * 160;
  return new Uint8Array(size); // All zeros (empty)
}

// Convert 3D indices to 1D array index
gridToIndex(x: number, y: number, z: number): number {
  return x + y * 160 + z * 160 * 160;
}

// Check bounds
isValidGridPos(x: number, y: number, z: number): boolean {
  return x >= 0 && x < 160 && 
         y >= 0 && y < 160 && 
         z >= 0 && z < 160;
}
```

---

## Phase 3: Coordinate Transformations

### 3.1 Space Conversion System
**Files to create:**
- `client/src/engine/BuildGridTransforms.ts`

**Transformation Chain:**
```
World Space → Local Space → Grid Space
     ↓              ↓            ↓
  Camera Ray    Grid Origin   Cell Index
```

**Implementation:**
```typescript
class BuildGridTransforms {
  private root: TransformNode;
  private GRID_SIZE = 160;
  private WORLD_SIZE = 20;
  private CELL_SIZE = 0.125; // 20/160
  
  // World space to local space (relative to grid root)
  worldToLocal(worldPos: Vector3): Vector3 {
    const worldMatrix = this.root.getWorldMatrix();
    const invMatrix = Matrix.Invert(worldMatrix);
    return Vector3.TransformCoordinates(worldPos, invMatrix);
  }
  
  // Local space to grid space (0-159 indices)
  localToGrid(localPos: Vector3): Vector3Int {
    // Local space: -10 to +10
    // Grid space: 0 to 159
    const x = Math.floor((localPos.x + 10) / this.CELL_SIZE);
    const y = Math.floor((localPos.y + 10) / this.CELL_SIZE);
    const z = Math.floor((localPos.z + 10) / this.CELL_SIZE);
    
    return {
      x: Math.max(0, Math.min(159, x)),
      y: Math.max(0, Math.min(159, y)),
      z: Math.max(0, Math.min(159, z))
    };
  }
  
  // Grid space to local space (center of cell)
  gridToLocal(gridX: number, gridY: number, gridZ: number): Vector3 {
    const x = (gridX * this.CELL_SIZE) - 10 + (this.CELL_SIZE / 2);
    const y = (gridY * this.CELL_SIZE) - 10 + (this.CELL_SIZE / 2);
    const z = (gridZ * this.CELL_SIZE) - 10 + (this.CELL_SIZE / 2);
    return new Vector3(x, y, z);
  }
}
```

---

## Phase 4: Raycasting & Block Preview

### 4.1 Build Raycaster
**Files to create:**
- `client/src/engine/BuildRaycaster.ts`

**Raycast Targets:**
1. Boundary cube
2. Grid plane
3. Existing placed blocks

**Implementation:**
```typescript
class BuildRaycaster {
  private scene: Scene;
  private camera: Camera;
  
  // Cast ray from camera center
  raycastFromCamera(): RaycastHit | null {
    const ray = this.camera.getForwardRay();
    
    // Priority order:
    // 1. Existing blocks (for placement against them)
    // 2. Grid plane (for initial placement)
    // 3. Boundary cube (for edge placement)
    
    const hits = this.scene.multiPickWithRay(ray, (mesh) => {
      return mesh.name.startsWith('buildBlock_') ||
             mesh.name === 'gridPlane' ||
             mesh.name === 'buildBoundary';
    });
    
    if (hits && hits.length > 0) {
      const closestHit = hits[0];
      return {
        position: closestHit.pickedPoint!,
        normal: closestHit.getNormal()!,
        mesh: closestHit.pickedMesh!
      };
    }
    
    return null;
  }
}
```

### 4.2 Block Placement Logic
**Task:** Calculate placement position from raycast

```typescript
calculatePlacementPosition(hit: RaycastHit, isRemoving: boolean): Vector3Int | null {
  // Convert hit position to local space
  const localPos = this.transforms.worldToLocal(hit.position);
  
  if (isRemoving) {
    // Remove block: use hit position directly
    return this.transforms.localToGrid(localPos);
  } else {
    // Place block: offset by normal (place adjacent)
    const offset = hit.normal.scale(this.CELL_SIZE * 0.6);
    const placementLocal = localPos.add(offset);
    return this.transforms.localToGrid(placementLocal);
  }
}
```

### 4.3 Preview Block
**Files to modify:**
- `client/src/engine/BuildGrid.ts`

**Implementation:**
```typescript
class BuildGrid {
  private previewBlock: Mesh | null = null;
  private previewMaterial: StandardMaterial | null = null;
  
  updatePreview(gridPos: Vector3Int | null, color: Color3): void {
    if (!gridPos) {
      this.hidePreview();
      return;
    }
    
    if (!this.previewBlock) {
      this.createPreviewBlock();
    }
    
    // Update color based on current selection
    if (this.previewMaterial) {
      this.previewMaterial.diffuseColor = color;
    }
    
    // Position at grid cell (local space)
    const localPos = this.transforms.gridToLocal(
      gridPos.x, gridPos.y, gridPos.z
    );
    this.previewBlock.position.copyFrom(localPos);
    this.previewBlock.isVisible = true;
  }
  
  private createPreviewBlock(): void {
    this.previewBlock = MeshBuilder.CreateBox('preview', {
      size: this.CELL_SIZE
    }, this.scene);
    
    this.previewMaterial = new StandardMaterial('previewMat', this.scene);
    this.previewMaterial.diffuseColor = new Color3(1, 1, 1);  // Will be updated
    this.previewMaterial.alpha = 0.5;                          // Semi-transparent
    
    this.previewBlock.material = this.previewMaterial;
    this.previewBlock.parent = this.root;
  }
  
  private hidePreview(): void {
    if (this.previewBlock) {
      this.previewBlock.isVisible = false;
    }
  }
}
```

---

## Phase 5: Block Placement & Removal

### 5.1 Instance Management
**Task:** Use MeshPrimitives for instanced blocks

```typescript
class BuildGrid {
  private primitives: MeshPrimitives;
  
  placeBlock(gridX: number, gridY: number, gridZ: number, color: Color3): void {
    // Check if valid position
    if (!this.isValidGridPos(gridX, gridY, gridZ)) return;
    
    // Check if already occupied
    const index = this.gridToIndex(gridX, gridY, gridZ);
    if (this.voxelData[index] !== 0) return; // Already has block
    
    // Mark as occupied (color index 1-255)
    this.voxelData[index] = 1; // For now, just use 1
    
    // Create instance at position
    const localPos = this.transforms.gridToLocal(gridX, gridY, gridZ);
    const worldPos = Vector3.TransformCoordinates(
      localPos, 
      this.root.getWorldMatrix()
    );
    
    const instance = this.primitives.createBoxInstance(
      `buildBlock_${gridX}_${gridY}_${gridZ}`,
      this.CELL_SIZE, this.CELL_SIZE, this.CELL_SIZE,
      color,
      new Color3(0, 0, 0) // No glow
    );
    
    instance.position.copyFrom(localPos);
    instance.parent = this.instanceContainer;
    
    this.blockInstances.set(index, instance);
  }
  
  removeBlock(gridX: number, gridY: number, gridZ: number): void {
    if (!this.isValidGridPos(gridX, gridY, gridZ)) return;
    
    const index = this.gridToIndex(gridX, gridY, gridZ);
    if (this.voxelData[index] === 0) return; // No block here
    
    // Mark as empty
    this.voxelData[index] = 0;
    
    // Remove instance
    const instance = this.blockInstances.get(index);
    if (instance) {
      instance.dispose();
      this.blockInstances.delete(index);
    }
  }
}
```

### 5.2 Input Handling
**Task:** Wire up mouse clicks and color cycling

```typescript
class BuildModeManager {
  private raycaster: BuildRaycaster;
  private grid: BuildGrid | null = null;
  
  private setupInputHandlers(): void {
    // Keyboard input for color cycling
    window.addEventListener('keydown', (evt) => {
      if (!this.isActive) return;
      
      if (evt.key === '[') {
        this.cycleColorBackward();
        console.log(`[BuildMode] Color: ${this.currentColorIndex}`);
      } else if (evt.key === ']') {
        this.cycleColorForward();
        console.log(`[BuildMode] Color: ${this.currentColorIndex}`);
      }
    });
    
    // Left click - place block
    this.scene.onPointerDown = (evt) => {
      if (!this.isActive || !this.grid) return;
      
      if (evt.button === 0) { // Left mouse
        const hit = this.raycaster.raycastFromCamera();
        if (hit) {
          const gridPos = this.calculatePlacementPosition(hit, false);
          if (gridPos) {
            this.grid.placeBlock(
              gridPos.x, gridPos.y, gridPos.z, 
              this.getCurrentColor()
            );
          }
        }
      } else if (evt.button === 2) { // Right mouse
        const hit = this.raycaster.raycastFromCamera();
        if (hit) {
          const gridPos = this.calculatePlacementPosition(hit, true);
          if (gridPos) {
            this.grid.removeBlock(gridPos.x, gridPos.y, gridPos.z);
          }
        }
      }
    };
  }
  
  cycleColorForward(): void {
    this.currentColorIndex = (this.currentColorIndex + 1) % this.COLOR_PALETTE.length;
  }
  
  cycleColorBackward(): void {
    this.currentColorIndex = (this.currentColorIndex - 1 + this.COLOR_PALETTE.length) % this.COLOR_PALETTE.length;
  }
  
  getCurrentColor(): Color3 {
    return this.COLOR_PALETTE[this.currentColorIndex];
  }
  
  // Update preview every frame
  update(): void {
    if (!this.isActive || !this.grid) return;
    
    const hit = this.raycaster.raycastFromCamera();
    if (hit) {
      const gridPos = this.calculatePlacementPosition(hit, false);
      this.grid.updatePreview(gridPos, this.getCurrentColor());
    } else {
      this.grid.updatePreview(null, this.getCurrentColor());
    }
  }
}
```

---

## Phase 6: Greedy Meshing & Local Finalization

### 6.1 Exit Build Mode (Local Only)
**Files to modify:**
- `client/src/engine/BuildGrid.ts`

```typescript
class BuildGrid {
  exitBuildMode(): void {
    // 1. Run greedy meshing on voxel data
    const mesher = new GreedyMesher();
    const meshData = mesher.mesh(this.voxelData, 160, 160, 160);
    
    // 2. Create optimized mesh
    this.finalMesh = this.createMeshFromData(meshData);
    this.finalMesh.parent = this.root;
    
    // 3. Dispose all instances
    this.blockInstances.forEach(instance => instance.dispose());
    this.blockInstances.clear();
    
    // 4. Hide boundary and grid plane
    this.boundaryCube.isVisible = false;
    this.gridPlane.isVisible = false;
    if (this.previewBlock) {
      this.previewBlock.isVisible = false;
    }
    
    // 5. Mark as finalized
    this.isFinalized = true;
    
    console.log(`[BuildGrid] Finalized with ${meshData.positions.length / 3} vertices`);
  }
  
  private createMeshFromData(meshData: MeshData): Mesh {
    const mesh = new Mesh('finalBuilding', this.scene);
    
    const vertexData = new VertexData();
    vertexData.positions = meshData.positions;
    vertexData.normals = meshData.normals;
    vertexData.colors = meshData.colors;
    vertexData.indices = meshData.indices;
    
    vertexData.applyToMesh(mesh);
    
    const mat = new StandardMaterial('buildingMat', this.scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.emissiveColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    mat.vertexColorEnabled = true;
    
    mesh.material = mat;
    
    return mesh;
  }
  
  isFinalized(): boolean {
    return this.isFinalized;
  }
  
  getFinalMesh(): Mesh | null {
    return this.finalMesh;
  }
  
  dispose(): void {
    // Dispose everything
    this.blockInstances.forEach(instance => instance.dispose());
    this.blockInstances.clear();
    
    if (this.finalMesh) {
      this.finalMesh.dispose();
      this.finalMesh = null;
    }
    
    if (this.previewBlock) {
      this.previewBlock.dispose();
      this.previewBlock = null;
    }
    
    this.boundaryCube.dispose();
    this.gridPlane.dispose();
    this.root.dispose();
  }
}
```

### 6.2 Delete Building (Local Only)
**Files to modify:**
- `client/src/engine/BuildModeManager.ts`

```typescript
class BuildModeManager {
  toggleBuildMode(): void {
    if (!this.isActive) {
      // ENTER build mode
      if (this.currentGrid && this.currentGrid.isFinalized()) {
        // Grid exists and is finalized
        // Check if right-clicking on it to delete
        const hit = this.raycaster.raycastFromCamera();
        if (hit && hit.mesh === this.currentGrid.getFinalMesh()) {
          // Right-clicked on existing building - delete it
          console.log('[BuildMode] Deleting existing building');
          this.currentGrid.dispose();
          this.currentGrid = null;
        }
      }
      
      // Create new grid
      this.currentGrid = new BuildGrid(this.scene);
      this.isActive = true;
      this.currentColorIndex = 0; // Reset color
      
      console.log('[BuildMode] Entered build mode');
      
    } else {
      // EXIT build mode
      if (this.currentGrid) {
        this.currentGrid.exitBuildMode();
      }
      this.isActive = false;
      
      console.log('[BuildMode] Exited build mode - finalized building');
    }
  }
}
```

### 6.2 Rebuild Mode
**Task:** Delete and restart

```typescript
class BuildModeManager {
  toggleBuildMode(): void {
    if (!this.isActive) {
      // ENTER build mode
      if (this.currentGrid && this.currentGrid.isFinalized()) {
        // Grid exists and is finalized - check for right-click delete
        const hit = this.raycaster.raycastFromCamera();
        if (hit && hit.mesh === this.currentGrid.getFinalMesh()) {
          // Right-clicked on existing building - delete it
          this.currentGrid.dispose();
          this.currentGrid = null;
        }
      }
      
      // Create new grid
      this.currentGrid = new BuildGrid(this.scene, this.camera);
      this.isActive = true;
      
      console.log('[BuildMode] Entered build mode');
      
    } else {
      // EXIT build mode
      if (this.currentGrid) {
        this.currentGrid.exitBuildMode();
      }
      this.isActive = false;
      
      console.log('[BuildMode] Exited build mode');
    }
  }
}
```

---

## Phase 7: Integration

### 7.1 Builder View Setup
**File:** `client/src/views/BuilderView.vue`

```vue
<template>
  <div class="builder-view">
    <canvas ref="canvas" class="game-canvas"></canvas>
    
    <div class="build-instructions" v-if="!isInBuildMode">
      <p>Press <kbd>B</kbd> to start building</p>
      <p>Right-click on finished buildings to delete them</p>
    </div>
    
    <div class="build-hud" v-if="isInBuildMode">
      <p>Build Mode Active</p>
      <p>Left Click: Place Block</p>
      <p>Right Click: Remove Block</p>
      <p><kbd>[</kbd> / <kbd>]</kbd>: Cycle Colors</p>
      <p>Current Color: <span :style="{ color: currentColorHex }">█</span></p>
      <p>Press <kbd>B</kbd> to finish and mesh</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { BuildModeManager } from '../engine/BuildModeManager';
import { createEngine, createGameScene } from '../engine/setupScene';

const canvas = ref<HTMLCanvasElement | null>(null);
const isInBuildMode = ref(false);
const currentColorHex = ref('#FFFFFF');

let buildManager: BuildModeManager | null = null;

onMounted(async () => {
  if (!canvas.value) return;
  
  const engine = createEngine(canvas.value);
  const scene = createGameScene(engine);
  
  // Initialize build mode manager (local only - no network!)
  buildManager = new BuildModeManager(scene, scene.activeCamera!);
  
  // Listen for build mode changes
  buildManager.onBuildModeChange((active) => {
    isInBuildMode.value = active;
  });
  
  // Listen for color changes
  buildManager.onColorChange((color) => {
    // Convert Color3 to hex for display
    const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
    currentColorHex.value = `#${r}${g}${b}`;
  });
  
  // Render loop
  engine.runRenderLoop(() => {
    if (buildManager) {
      buildManager.update(); // Update preview
    }
    scene.render();
  });
  
  window.addEventListener('resize', () => {
    engine.resize();
  });
});

onUnmounted(() => {
  buildManager?.dispose();
});
</script>
```

### 7.2 Router Configuration
**File:** `client/src/router/index.ts`

```typescript
{
  path: '/builder',
  name: 'Builder',
  component: () => import('../views/BuilderView.vue')
}
```

---

## File Structure Summary

### New Files to Create (Proof of Concept):

**Client (Frontend) - Local Only:**
1. `client/src/views/BuilderView.vue` - Main builder view
2. `client/src/engine/BuildModeManager.ts` - Build mode controller
3. `client/src/engine/BuildGrid.ts` - Grid and voxel management (local only!)
4. `client/src/engine/BuildGridTransforms.ts` - Coordinate conversions
5. `client/src/engine/BuildRaycaster.ts` - Raycasting logic
6. `client/src/engine/GridMaterial.ts` - Procedural grid line shader

**Total: 6 new files**

### Files to Modify:
1. `client/src/router/index.ts` - Add `/builder` route

**Total: 1 modified file**

---

### Future Phase 2 Files (NOT for proof of concept):
<details>
<summary>Click to see Phase 2 network/ECS files</summary>

7. `client/src/engine/BuildingSystem.ts` - Building mesh renderer (like ItemSystem)
8. `server/src/buildings/BuildingManager.ts` - Server-side building entity creation
9. Component definitions in `shared/src/components/index.ts`
10. Protocol messages in `shared/src/protocol.ts`
11. Message handlers in `server/src/rooms/Room.ts`

</details>

---

## Testing Checklist (Proof of Concept)

### Core Building Experience (Local Only)
- [ ] Builder route loads with flat terrain at `http://localhost:5175/builder`
- [ ] Press 'B' spawns yellow boundary cube and grid plane
- [ ] Grid plane shows 160×160 lines
- [ ] Raycast from camera highlights cells on boundary/plane
- [ ] Preview block appears at cursor position
- [ ] Preview block color matches current selection
- [ ] Press ']' cycles color forward (White → Gray → Black → Red...)
- [ ] Press '[' cycles color backward
- [ ] Current color shows in HUD as colored square
- [ ] Left click places block with current color
- [ ] Placed block is an instance (fast)
- [ ] Right click removes block instance
- [ ] Multiple blocks can be placed in different colors
- [ ] Blocks can be placed adjacent to each other (normal-based placement)
- [ ] Press 'B' again exits build mode
- [ ] Greedy meshing runs (check console for vertex count)
- [ ] All instances disposed
- [ ] Boundary cube and grid plane become invisible
- [ ] Final optimized mesh appears
- [ ] Final mesh preserves all block colors correctly
- [ ] Rotate camera - final mesh visible from all angles
- [ ] Right-click on finished building deletes it entirely
- [ ] Press 'B' after delete starts new grid
- [ ] Color selection resets to white (index 0) on new grid
- [ ] Can build multiple buildings in same session
- [ ] No memory leaks (check browser dev tools)

---

### Future Phase 2 Testing (Network/ECS - NOT for proof of concept):
<details>
<summary>Click to see Phase 2 network sync tests</summary>

- [ ] Press 'B' sends BuildingCreate message to server
- [ ] Server creates building entity in World
- [ ] Server runs greedy meshing on voxel data
- [ ] Server broadcasts BuildingSpawn to all clients
- [ ] Client receives BuildingSpawn and creates mesh
- [ ] Open two browser windows (two clients)
- [ ] Client A builds and finalizes building
- [ ] Client B sees the building appear
- [ ] Client C joins after building created
- [ ] Client C receives existing buildings on join
- [ ] Right-click on building sends BuildingDestroy
- [ ] All clients see building disappear

</details>

---

## Performance Considerations (Proof of Concept)

1. **Instance Limit**: 160³ = 4.1M possible blocks, but realistically thousands
2. **Greedy Meshing**: Reduces vertex count by 90%+ for solid areas
3. **Raycast Optimization**: Only check boundary cube, grid plane, and placed blocks
4. **Memory**: ~4MB for voxel array (acceptable for local storage)

---

## Future Enhancements (Not in this phase)
- Expanded color palette (beyond 16 colors)
- Custom color picker
- Collision detection with finished buildings
- Network sync (save/load buildings)
- Building templates
- Copy/paste functionality
- Undo/redo system
