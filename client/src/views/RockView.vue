<template>
  <div class="rock-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Game HUD -->
    <GameHud
      title="Rock Editor"
      :is-connected="isConnected"
      :is-in-room="isInRoom"
      :room-id="roomId"
      :my-entity-id="myEntityId"
      :players="players"
      :kill-feed-entries="killFeedEntries"
      :player-health="playerHealth"
      :max-health="maxHealth"
      :player-armor="playerArmor"
      :player-helmet-health="playerHelmetHealth"
      :player-stamina="playerStamina"
      :player-is-exhausted="playerIsExhausted"
      :player-has-infinite-stamina="playerHasInfiniteStamina"
      :player-breath-remaining="playerBreathRemaining"
      :player-max-breath="playerMaxBreath"
      :player-is-underwater="playerIsUnderwater"
      :player-is-in-water="playerIsInWater"
      :has-weapon="hasWeapon"
      :weapon-type="weaponType"
      :current-ammo="currentAmmo"
      :max-capacity="maxCapacity"
      :is-reloading="isReloading"
      :reload-progress="reloadProgress"
      :latency="latency"
      :ping-color-class="pingColorClass"
      :hit-marker-visible="hitMarkerVisible"
    />

    <!-- Rock Generator UI Overlay -->
    <div class="rock-info">
      <v-card class="info-card" elevation="4">
        <v-card-title>Rock Generator</v-card-title>
        <v-card-text>
          <div class="mb-3">
            <strong>Seed:</strong> {{ seed }}
            <div class="mt-1 text-caption">
              <span>Grid: {{ rockGridSize }}×{{ rockGridSize }}×{{ rockGridSize }}</span> |
              <span>{{ getSizeName() }}</span>
            </div>
            <div class="mt-1 text-caption">
              <span>{{ solidCount }} solid voxels</span> | 
              <span>{{ quadCount }} quads</span>
            </div>
            <div class="text-caption">
              <span>Full Mesh: {{ fullTriCount }} tris</span> | 
              <span>Collider: {{ colliderTriCount }} tris</span>
            </div>
            <div class="text-caption">
              Generation: {{ genTimeMs }}ms | Mesh: {{ meshTimeMs }}ms
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <div class="mt-3">
            <v-switch 
              v-model="showFullMesh" 
              label="Show Full Mesh" 
              color="#6B5B47"
              density="compact"
              hide-details
              @update:model-value="updateMeshVisibility"
            ></v-switch>

            <v-switch 
              v-model="showColliderMesh" 
              label="Show Collider Mesh" 
              color="#6B5B47"
              density="compact"
              hide-details
              @update:model-value="updateMeshVisibility"
            ></v-switch>

            <div class="text-caption mb-1 mt-2">
              Grid Resolution: {{ gridResolution }}
            </div>
            <v-slider
              v-model="gridResolution"
              :min="4"
              :max="32"
              :step="1"
              color="#6B5B47"
              density="compact"
              hide-details
              @update:model-value="regenerateColliderMesh"
            ></v-slider>
          </div>

          <v-divider class="my-2"></v-divider>

          <div class="mt-3">
            <v-switch 
              v-model="showColliders" 
              label="Show Legacy AABB Colliders" 
              color="#8B7B67"
              density="compact"
              hide-details
              @update:model-value="updateColliderVisualization"
            ></v-switch>
            
            <div v-if="showColliders" class="mt-2">
              <div class="text-caption mb-1">
                Max Depth: {{ maxDepth }} (auto-merges solid regions)
              </div>
              <v-slider
                v-model="maxDepth"
                :min="1"
                :max="6"
                :step="1"
                color="#6B5B47"
                density="compact"
                hide-details
                @update:model-value="updateColliderVisualization"
              ></v-slider>
              
              <div class="text-caption mb-1 mt-2">
                Fill Threshold: {{ fillThreshold.toFixed(2) }}
              </div>
              <v-slider
                v-model="fillThreshold"
                :min="0.1"
                :max="1.0"
                :step="0.05"
                color="#6B5B47"
                density="compact"
                hide-details
                @update:model-value="updateColliderVisualization"
              ></v-slider>
              
              <div class="text-caption mt-2">
                Collider count: {{ colliderCount }}
              </div>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <div class="mt-3">
            <v-switch 
              v-model="showGround" 
              label="Show Ground Plane" 
              color="#6B5B47"
              density="compact"
              hide-details
              @update:model-value="updateGroundVisibility"
            ></v-switch>
          </div>

          <v-divider class="my-2"></v-divider>

          <div class="mt-3">
            <v-btn @click="regenerateRock" color="#6B5B47" size="small" class="rock-btn mb-2" block>
              Regenerate Rock
            </v-btn>
            <v-btn @click="randomSeed" color="#8B7B67" size="small" class="rock-btn mb-2" block>
              Random Seed
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Back button -->
    <router-link to="/" class="back-button">← Back</router-link>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Scene, Vector3, Color3, MeshBuilder, StandardMaterial, Mesh, VertexData
} from '@babylonjs/core';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import {
  generateRock, RockGreedyMesher, generateRockColliders, ROCK_VOXEL_SIZE,
  RockMeshBuilder, RockMeshDecimator,
  type RockQuad, type RockCollider, type RockVoxelGrid, type RockMesh, type RockColliderMesh
} from '@spong/shared';

const route = useRoute();
const router = useRouter();

const canvasRef = ref<HTMLCanvasElement | null>(null);

// Initialize game session
const session = useGameSession();

// Extract state from session for template binding
const {
  isConnected,
  isInRoom,
  roomId,
  myEntityId,
  players,
  playerHealth,
  playerArmor,
  playerHelmetHealth,
  playerStamina,
  playerIsExhausted,
  playerHasInfiniteStamina,
  playerBreathRemaining,
  playerMaxBreath,
  playerIsUnderwater,
  playerIsInWater,
  hasWeapon,
  weaponType,
  currentAmmo,
  maxCapacity,
  isReloading,
  reloadProgress,
  latency,
  pingColorClass,
  killFeedEntries,
  hitMarkerVisible
} = session;

// Health computed
const maxHealth = PLAYER_MAX_HEALTH;

let scene: Scene | null = null;
let rockMesh: Mesh | null = null;
let colliderVisMesh: Mesh | null = null;
let boundingBoxMesh: Mesh | null = null;
let rockGrid: RockVoxelGrid | null = null;
let colliderMeshes: Mesh[] = [];
let fullMesh: RockMesh | null = null;
let colliderMesh: RockColliderMesh | null = null;

// Single source of truth for rock center offset (computed once from fullMesh bounds)
const rockBoundsCenter = { x: 0, y: 0, z: 0 };
const ROCK_X = 10; // To the right from spawn
const ROCK_SCALE = 0.5; // Match game scaling (same as LevelRockManager)

const seed = ref<string>('');
const rockGridSize = ref(0);
const solidCount = ref(0);
const quadCount = ref(0);
const genTimeMs = ref(0);
const meshTimeMs = ref(0);
const showColliders = ref(false);
const showColliderMesh = ref(false);
const showFullMesh = ref(true);
const showGround = ref(true);
const gridResolution = ref(16);
const maxDepth = ref(3);
const fillThreshold = ref(0.4);
const colliderCount = ref(0);
const fullTriCount = ref(0);
const colliderTriCount = ref(0);

// Watch for when we're in the room and scene is ready
watch([isInRoom, () => {
  const getSceneFn = session.getScene;
  return getSceneFn ? getSceneFn() : null;
}], ([inRoom, newScene]) => {
  if (inRoom && newScene && !scene) {
    scene = newScene;
    // Small delay to ensure scene is fully ready
    setTimeout(() => {
      // Initialize seed and generate rock (also creates bounding box)
      seed.value = (route.query.seed as string) || 'boulder';
      generateAndDisplay();
      
      // Set initial ground visibility
      updateGroundVisibility();
    }, 100);
  }
}, { immediate: true });

function updateGroundVisibility() {
  if (!scene) return;
  const ground = scene.getMeshByName('level');
  if (ground) {
    ground.setEnabled(showGround.value);
  }
}

function getSizeName(): string {
  if (rockGridSize.value === 16) return 'Small';
  if (rockGridSize.value === 24) return 'Medium';
  if (rockGridSize.value === 32) return 'Large';
  return 'Unknown';
}

function generateAndDisplay() {
  if (!scene) {
    return;
  }
  // Generate rock density
  const t0 = performance.now();
  rockGrid = generateRock(seed.value);
  rockGridSize.value = rockGrid.size;
  const t1 = performance.now();
  genTimeMs.value = Math.round(t1 - t0);
  solidCount.value = rockGrid.getSolidCount();

  // Greedy mesh
  const mesher = new RockGreedyMesher(rockGrid);
  const quads = mesher.generateMesh();
  const t2 = performance.now();
  meshTimeMs.value = Math.round(t2 - t1);
  quadCount.value = quads.length;

  // Build full triangle mesh
  const meshBuilder = new RockMeshBuilder();
  fullMesh = meshBuilder.buildFromQuads(quads);
  fullTriCount.value = fullMesh.indices.length / 3;

  // Generate collider mesh
  regenerateColliderMesh();
  // Update existing or create new rock mesh
  if (rockMesh) {
    updateRockMesh(rockMesh, quads);
  } else {
    rockMesh = createRockMesh(quads);
  }

  // Update bounding box for new rock size
  createBoundingBox();

  // Update visibility
  updateMeshVisibility();

  // Update collider visualization if enabled
  if (showColliders.value) {
    updateColliderVisualization();
  }
}

function createRockMesh(quads: RockQuad[]): Mesh {
  // Use RockMeshBuilder so visual mesh and collider share the exact same vertex positions
  const meshBuilder = new RockMeshBuilder();
  const builtMesh = meshBuilder.buildFromQuads(quads);

  // Compute center from built mesh bounds (single source of truth)
  const bounds = builtMesh.bounds;
  rockBoundsCenter.x = (bounds.minX + bounds.maxX) * 0.5;
  rockBoundsCenter.y = (bounds.minY + bounds.maxY) * 0.5;
  rockBoundsCenter.z = (bounds.minZ + bounds.maxZ) * 0.5;

  // Build Babylon vertex data from the built mesh positions
  // We need normals/uvs for the visual mesh, so generate quads the old way for those
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const quad of quads) {
    const verts = generateQuadGeometry(quad);
    positions.push(...verts.positions);
    normals.push(...verts.normals);
    uvs.push(...verts.uvs);

    indices.push(
      vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
      vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
    );
    vertexOffset += 4;
  }

  const mesh = new Mesh('rock', scene!);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);

  // Apply flat shading for sharp facets
  mesh.convertToFlatShadedMesh();

  // Position to the right of player, centered vertically
  mesh.position.set(ROCK_X - rockBoundsCenter.x * ROCK_SCALE, -rockBoundsCenter.y * ROCK_SCALE, -rockBoundsCenter.z * ROCK_SCALE);
  mesh.scaling.setAll(ROCK_SCALE); // Match game scaling

  // Rock material - grayish
  const mat = new StandardMaterial('rockMat', scene!);
  mat.diffuseColor = new Color3(0.4, 0.4, 0.45);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.ambientColor = new Color3(0, 0, 0);
  mat.emissiveColor = new Color3(0, 0, 0);
  mesh.material = mat;
  mesh.receiveShadows = true;

  return mesh;
}

function updateRockMesh(mesh: Mesh, quads: RockQuad[]): void {
  // Recompute bounds center from fullMesh (may have changed on regeneration)
  const bounds = fullMesh!.bounds;
  rockBoundsCenter.x = (bounds.minX + bounds.maxX) * 0.5;
  rockBoundsCenter.y = (bounds.minY + bounds.maxY) * 0.5;
  rockBoundsCenter.z = (bounds.minZ + bounds.maxZ) * 0.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const quad of quads) {
    const verts = generateQuadGeometry(quad);
    positions.push(...verts.positions);
    normals.push(...verts.normals);
    uvs.push(...verts.uvs);

    indices.push(
      vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
      vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
    );
    vertexOffset += 4;
  }

  // Update vertex data
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh, true); // true = updatable
  
  // Reapply flat shading
  mesh.convertToFlatShadedMesh();

  // Update position with new bounds center
  mesh.position.set(ROCK_X - rockBoundsCenter.x * ROCK_SCALE, -rockBoundsCenter.y * ROCK_SCALE, -rockBoundsCenter.z * ROCK_SCALE);
  mesh.scaling.setAll(ROCK_SCALE); // Match game scaling
}

function generateQuadGeometry(quad: RockQuad): {
  positions: number[];
  normals: number[];
  uvs: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const { x, y, z, width, height, axis, positive } = quad;
  const vs = ROCK_VOXEL_SIZE;

  let nx = 0, ny = 0, nz = 0;
  let corners: number[][] = [];

  switch (axis) {
    case 'x':
      nx = positive ? 1 : -1;
      if (positive) {
        corners = [
          [x, y, z],
          [x, y, z + width * vs],
          [x, y + height * vs, z + width * vs],
          [x, y + height * vs, z],
        ];
      } else {
        corners = [
          [x, y, z + width * vs],
          [x, y, z],
          [x, y + height * vs, z],
          [x, y + height * vs, z + width * vs],
        ];
      }
      break;

    case 'y':
      ny = positive ? 1 : -1;
      if (positive) {
        corners = [
          [x, y, z],
          [x + width * vs, y, z],
          [x + width * vs, y, z + height * vs],
          [x, y, z + height * vs],
        ];
      } else {
        corners = [
          [x, y, z + height * vs],
          [x + width * vs, y, z + height * vs],
          [x + width * vs, y, z],
          [x, y, z],
        ];
      }
      break;

    case 'z':
      nz = positive ? 1 : -1;
      if (positive) {
        corners = [
          [x + width * vs, y, z],
          [x, y, z],
          [x, y + height * vs, z],
          [x + width * vs, y + height * vs, z],
        ];
      } else {
        corners = [
          [x, y, z],
          [x + width * vs, y, z],
          [x + width * vs, y + height * vs, z],
          [x, y + height * vs, z],
        ];
      }
      break;
  }

  for (const c of corners) {
    positions.push(c[0], c[1], c[2]);
    normals.push(nx, ny, nz);
  }

  const uvs = [0, 0, width, 0, width, height, 0, height];

  return { positions, normals, uvs };
}

function createBoundingBox() {
  if (!scene || !rockGrid || !fullMesh) return;

  // Dispose old bounding box if it exists
  if (boundingBoxMesh) {
    boundingBoxMesh.dispose();
    boundingBoxMesh = null;
  }

  // Use actual mesh bounds instead of full grid size
  const bounds = fullMesh.bounds;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const depth = bounds.maxZ - bounds.minZ;
  
  const box = MeshBuilder.CreateBox('gridBoundingBox', {
    width,
    height,
    depth
  }, scene);

  // Position at rock center
  box.position.set(ROCK_X, 0, 0);
  box.scaling.setAll(ROCK_SCALE); // Match rock scaling

  const mat = new StandardMaterial('gridBoxMat', scene);
  mat.emissiveColor = new Color3(0.5, 0.4, 0.3);
  mat.wireframe = true;
  mat.alpha = 0.3;
  box.material = mat;

  boundingBoxMesh = box;
}

function regenerateRock() {
  generateAndDisplay();
}

function randomSeed() {
  const s = Math.random().toString(36).substring(2, 10);
  seed.value = s;
  router.push({ path: '/rock/', query: { seed: s } });
  generateAndDisplay();
}

function updateColliderVisualization() {
  if (!scene || !rockGrid || !fullMesh) return;

  // Dispose existing collider meshes
  for (const mesh of colliderMeshes) {
    mesh.dispose();
  }
  colliderMeshes = [];

  if (!showColliders.value) {
    colliderCount.value = 0;
    return;
  }

  // Generate colliders with current parameters
  const colliders = generateRockColliders(rockGrid, maxDepth.value, fillThreshold.value);
  colliderCount.value = colliders.length;
  for (const col of colliders) {
    // Calculate box dimensions
    const width = col.maxX - col.minX;
    const height = col.maxY - col.minY;
    const depth = col.maxZ - col.minZ;
    
    // Create wireframe box
    const box = MeshBuilder.CreateBox('collider', {
      width,
      height,
      depth
    }, scene);
    
    // Position collider relative to the shared rock center
    const centerX = ((col.minX + col.maxX) * 0.5 - rockBoundsCenter.x) * ROCK_SCALE + ROCK_X;
    const centerY = ((col.minY + col.maxY) * 0.5 - rockBoundsCenter.y) * ROCK_SCALE;
    const centerZ = ((col.minZ + col.maxZ) * 0.5 - rockBoundsCenter.z) * ROCK_SCALE;
    box.position.set(centerX, centerY, centerZ);
    box.scaling.setAll(ROCK_SCALE); // Match rock scaling
    
    // Wireframe material - green with transparency
    const mat = new StandardMaterial('colliderMat', scene);
    mat.emissiveColor = new Color3(0.2, 1.0, 0.3);
    mat.wireframe = true;
    mat.alpha = 0.4;
    box.material = mat;
    
    colliderMeshes.push(box);
  }
}

function regenerateColliderMesh() {
  if (!fullMesh) return;

  const decimator = new RockMeshDecimator();
  colliderMesh = decimator.decimate(fullMesh, gridResolution.value);
  colliderTriCount.value = colliderMesh.triangleCount;

  // Recreate collider mesh visualization if visible
  if (showColliderMesh.value && scene) {
    createColliderMeshVisualization();
  }
}

function createColliderMeshVisualization() {
  if (!scene || !colliderMesh || !fullMesh) return;

  // Dispose old collider vis mesh
  if (colliderVisMesh) {
    colliderVisMesh.dispose();
    colliderVisMesh = null;
  }

  const mesh = new Mesh('colliderMesh', scene);
  const vd = new VertexData();
  
  // Convert Float32Array to regular array for Babylon
  vd.positions = Array.from(colliderMesh.vertices);
  vd.indices = Array.from(colliderMesh.indices);
  
  vd.applyToMesh(mesh);

  // Apply flat shading
  mesh.convertToFlatShadedMesh();

  // Use the shared rock center (same reference as visual rock mesh)
  mesh.position.set(ROCK_X - rockBoundsCenter.x * ROCK_SCALE, -rockBoundsCenter.y * ROCK_SCALE, -rockBoundsCenter.z * ROCK_SCALE);
  mesh.scaling.setAll(ROCK_SCALE); // Match rock scaling

  // Wireframe material - yellow/green
  const mat = new StandardMaterial('colliderMeshMat', scene);
  mat.emissiveColor = new Color3(0.8, 1.0, 0.3);
  mat.wireframe = true;
  mat.alpha = 0.6;
  mesh.material = mat;

  colliderVisMesh = mesh;
}

function updateMeshVisibility() {
  if (rockMesh) {
    rockMesh.setEnabled(showFullMesh.value);
  }

  if (showColliderMesh.value && colliderMesh) {
    createColliderMeshVisualization();
  } else if (colliderVisMesh) {
    colliderVisMesh.dispose();
    colliderVisMesh = null;
  }
}

function cleanup() {
  for (const mesh of colliderMeshes) {
    mesh.dispose();
  }
  colliderMeshes = [];
  if (colliderVisMesh) { colliderVisMesh.dispose(); colliderVisMesh = null; }
  if (boundingBoxMesh) { boundingBoxMesh.dispose(); boundingBoxMesh = null; }
  if (rockMesh) { rockMesh.dispose(); rockMesh = null; }
  scene = null;
}

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'rock_editor_1',
    isMobile: false
  });
});

// Cleanup on unmount
onUnmounted(() => {
  cleanup();
  session.dispose();
});
</script>

<style scoped>
.rock-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  outline: none;
}

.rock-info {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}

.info-card {
  background: linear-gradient(135deg, rgba(180, 170, 160, 0.95), rgba(160, 150, 140, 0.95));
  backdrop-filter: blur(10px);
  min-width: 280px;
  max-width: 340px;
  border: 2px solid rgba(120, 100, 80, 0.3);
  box-shadow: 0 4px 20px rgba(80, 60, 40, 0.15) !important;
}

.info-card :deep(.v-card-title) {
  color: #3A3020;
  font-weight: 600;
  border-bottom: 1px solid rgba(120, 100, 80, 0.2);
}

.info-card :deep(.v-card-text) {
  color: #4A4030;
}

.rock-btn {
  color: white !important;
  font-weight: 500 !important;
  text-transform: none;
}

/* Back button */
.back-button {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 4px;
  text-decoration: none;
  font-family: monospace;
  font-size: 13px;
  pointer-events: all;
  z-index: 10;
  transition: background 0.3s;
}

.back-button:hover {
  background: rgba(20, 20, 50, 0.95);
}
</style>
