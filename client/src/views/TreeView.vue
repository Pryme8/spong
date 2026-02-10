<template>
  <div class="tree-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Game HUD -->
    <GameHud
      title="Tree Editor"
      :is-connected="isConnected"
      :is-in-room="isInRoom"
      :room-id="roomId"
      :my-entity-id="myEntityId"
      :players="players"
      :player-health="playerHealth"
      :max-health="maxHealth"
      :player-armor="playerArmor"
      :player-helmet-health="playerHelmetHealth"
      :player-stamina="playerStamina"
      :player-is-exhausted="playerIsExhausted"
      :player-has-infinite-stamina="playerHasInfiniteStamina"
      :has-weapon="hasWeapon"
      :weapon-type="weaponType"
      :current-ammo="currentAmmo"
      :max-capacity="maxCapacity"
      :is-reloading="isReloading"
      :reload-progress="reloadProgress"
      :latency="latency"
      :ping-color-class="pingColorClass"
    />

    <!-- Tree Parameter UI Overlay -->
    <div class="tree-info">
      <v-card class="info-card" elevation="4">
        <v-card-title>Tree Parameters</v-card-title>
        <v-card-text class="params-scroll">
          <!-- Seed and Stats -->
          <div class="mb-3">
            <strong>Seed:</strong> {{ seed }}
            <div class="mt-1 text-caption">
              <span style="color: #6B4423;">🪵 {{ voxelCounts.wood }}</span> • 
              <span style="color: #2D5016;">🍃 {{ voxelCounts.leaf }}</span> • 
              <span style="color: #8B7355;">{{ quadCount }} quads</span>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Visibility Toggles -->
          <div class="param-section">
            <div class="section-title">Visibility</div>
            
            <v-checkbox 
              v-model="showTrunk" 
              label="Show Trunk" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="regenerateTree"
            ></v-checkbox>
            
            <v-checkbox 
              v-model="showBranches" 
              label="Show Branches" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="regenerateTree"
            ></v-checkbox>
            
            <v-checkbox 
              v-model="showRoots" 
              label="Show Roots" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="regenerateTree"
            ></v-checkbox>
            
            <v-checkbox 
              v-model="showLeaves" 
              label="Show Leaves" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="regenerateTree"
            ></v-checkbox>
            
            <v-checkbox 
              v-model="showGround" 
              label="Show Ground Plane" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="updateGroundVisibility"
            ></v-checkbox>
            
            <v-checkbox 
              v-model="showDebugWireframe" 
              label="Debug Wireframe" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="regenerateTree"
            ></v-checkbox>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Trunk Properties -->
          <div class="param-section">
            <div class="section-title">Trunk Properties</div>
            
            <div class="param-item">
              <label>Trunk Segments Before Branch ({{ treeParams.trunkSegments }})</label>
              <v-slider
                v-model="treeParams.trunkSegments"
                :min="12"
                :max="18"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Mid Segments ({{ treeParams.trunkMidSegments }})</label>
              <v-slider
                v-model="treeParams.trunkMidSegments"
                :min="4"
                :max="9"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Top Segments ({{ treeParams.trunkTopSegments }})</label>
              <v-slider
                v-model="treeParams.trunkTopSegments"
                :min="4"
                :max="6"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Trunk Step Length ({{ treeParams.trunkStepLength.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.trunkStepLength"
                :min="0.8"
                :max="1.25"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Trunk Taper ({{ treeParams.trunkTaper.toFixed(3) }})</label>
              <v-slider
                v-model="treeParams.trunkTaper"
                :min="0.960"
                :max="0.980"
                :step="0.002"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Trunk Sway ({{ treeParams.trunkSway.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.trunkSway"
                :min="0"
                :max="1.0"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Trunk Twist ({{ treeParams.trunkTwist.toFixed(2) }} rad/seg)</label>
              <v-slider
                v-model="treeParams.trunkTwist"
                :min="-0.5"
                :max="0.5"
                :step="0.01"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Root Properties -->
          <div class="param-section">
            <div class="section-title">Root Properties</div>
            
            <div class="param-item">
              <label>Root Segments ({{ treeParams.rootSegments }})</label>
              <v-slider
                v-model="treeParams.rootSegments"
                :min="1"
                :max="6"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Root Branches ({{ treeParams.rootBranches }})</label>
              <v-slider
                v-model="treeParams.rootBranches"
                :min="2"
                :max="6"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Root Gravity Droop ({{ treeParams.rootGravityDroop.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.rootGravityDroop"
                :min="0.50"
                :max="0.70"
                :step="0.02"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Angles -->
          <div class="param-section">
            <div class="section-title">🔄 Rotation Angles</div>
            
            <div class="param-item">
              <label>Yaw Angle ({{ treeParams.yawAngle.toFixed(2) }} rad)</label>
              <v-slider
                v-model="treeParams.yawAngle"
                :min="0.55"
                :max="1.4"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Yaw Deviation ({{ treeParams.yawDeviation.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.yawDeviation"
                :min="0.15"
                :max="0.6"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Pitch Angle ({{ treeParams.pitchAngle.toFixed(2) }} rad)</label>
              <v-slider
                v-model="treeParams.pitchAngle"
                :min="0.80"
                :max="1.2"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Pitch Deviation ({{ treeParams.pitchDeviation.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.pitchDeviation"
                :min="0.10"
                :max="0.4"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Branch Properties -->
          <div class="param-section">
            <div class="section-title">Branch Properties</div>
            
            <div class="param-item">
              <label>Step Length ({{ treeParams.stepLength.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.stepLength"
                :min="0.45"
                :max="1.1"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Step Deviation ({{ treeParams.stepDeviation.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.stepDeviation"
                :min="0.2"
                :max="0.40"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Thickness Decay ({{ treeParams.thicknessDecay.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.thicknessDecay"
                :min="0.6"
                :max="0.70"
                :step="0.01"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Min Thickness ({{ treeParams.minThickness.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.minThickness"
                :min="0.4"
                :max="0.70"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Gravity Droop ({{ treeParams.gravityDroop.toFixed(2) }})</label>
              <v-slider
                v-model="treeParams.gravityDroop"
                :min="-0.3"
                :max="1.2"
                :step="0.05"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Complexity -->
          <div class="param-section">
            <div class="section-title">Complexity</div>
            
            <div class="param-item">
              <label>Iterations ({{ treeParams.iterations }})</label>
              <v-slider
                v-model="treeParams.iterations"
                :min="1"
                :max="6"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Collider Debug -->
          <div class="param-section">
            <div class="section-title">Collider Debug</div>
            
            <v-checkbox 
              v-model="showColliderMesh" 
              label="Show Collider Mesh" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="updateColliderVisibility"
            ></v-checkbox>
            
            <div class="text-caption mb-2">
              Collider Triangles: {{ colliderTriCount }}
            </div>
            
            <div class="param-item">
              <label>Collider Resolution ({{ colliderResolution }})</label>
              <v-slider
                v-model="colliderResolution"
                :min="4"
                :max="64"
                :step="2"
                density="compact"
                hide-details
                @end="regenerateCollider"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Leaf Collider Debug -->
          <div class="param-section">
            <div class="section-title">Leaf Collider (Trigger)</div>
            
            <v-checkbox 
              v-model="showLeafColliderMesh" 
              label="Show Leaf Collider Mesh" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="updateLeafColliderVisibility"
            ></v-checkbox>
            
            <div class="text-caption mb-2">
              Leaf Collider Triangles: {{ leafColliderTriCount }}
            </div>
            
            <div class="param-item">
              <label>Leaf Collider Resolution ({{ leafColliderResolution }})</label>
              <v-slider
                v-model="leafColliderResolution"
                :min="4"
                :max="64"
                :step="2"
                density="compact"
                hide-details
                @end="regenerateLeafCollider"
              ></v-slider>
            </div>

            <div class="text-caption mt-2" :style="{ color: isCameraInLeaves ? '#4CAF50' : '#666' }">
              {{ isCameraInLeaves ? '🌿 Camera in leaves' : '○ Camera outside leaves' }}
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Leaves -->
          <div class="param-section">
            <div class="section-title">Leaves</div>
            
            <div class="param-item">
              <label>Leaf Radius ({{ treeParams.leafRadius.toFixed(1) }})</label>
              <v-slider
                v-model="treeParams.leafRadius"
                :min="4"
                :max="6"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Leaf Radius Variation ({{ treeParams.leafRadiusVariation.toFixed(1) }})</label>
              <v-slider
                v-model="treeParams.leafRadiusVariation"
                :min="0"
                :max="1"
                :step="0.1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>

            <div class="param-item">
              <label>Leaf Blobs ({{ treeParams.leafBlobs }})</label>
              <v-slider
                v-model="treeParams.leafBlobs"
                :min="1"
                :max="4"
                :step="1"
                density="compact"
                hide-details
                @end="regenerateTree"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-3"></v-divider>

          <!-- Action Buttons -->
          <div class="mt-3">
            <v-btn @click="regenerateTree" color="#6B8E23" size="small" class="nature-btn mb-2" block>
              Regenerate Tree
            </v-btn>
            <v-btn @click="randomSeed" color="#8B7355" size="small" class="nature-btn mb-2" block>
              Random Seed
            </v-btn>
            <v-btn @click="resetParams" color="#654321" size="small" class="nature-btn" block variant="outlined">
              Reset to Defaults
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
import { Scene, Vector3, Color3, MeshBuilder, StandardMaterial, LinesBuilder, Mesh, VertexData, PostProcess, Effect } from '@babylonjs/core';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import { TreeMesh } from '../engine/TreeMesh';
import { AudioManager } from '../engine/AudioManager';
import { BushLeafEffect } from '../engine/BushLeafEffect';
import { generateTree, TreeGreedyMesher, TreeMeshBuilder, TreeLeafMeshBuilder, TreeMeshDecimator, TREE_GRID_SIZE, TREE_GRID_H, TREE_VOXEL_SIZE, type DebugSegment, type TreeColliderMesh } from '@spong/shared';

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
  hasWeapon,
  weaponType,
  currentAmmo,
  maxCapacity,
  isReloading,
  reloadProgress,
  latency,
  pingColorClass
} = session;

// Health computed
const maxHealth = PLAYER_MAX_HEALTH;

let scene: Scene | null = null;

const showGround = ref(false);
const seed = ref<string>('');
const voxelCounts = ref({ wood: 0, leaf: 0 });
const quadCount = ref(0);

// Visibility toggles
const showTrunk = ref(true);
const showBranches = ref(true);
const showRoots = ref(true);
const showLeaves = ref(true);
const showDebugWireframe = ref(false);
const showColliderMesh = ref(false);

let debugSegments: DebugSegment[] = [];
let colliderMesh: TreeColliderMesh | null = null;
let colliderVisMesh: Mesh | null = null;
let leafColliderMesh: TreeColliderMesh | null = null;
let leafColliderVisMesh: Mesh | null = null;
let leafColliderTriggerMesh: Mesh | null = null;
let wasInLeavesLastFrame = false;
let leafEntryX = 0;
let leafEntryY = 0;
let leafEntryZ = 0;
let selectedTextureIndex1 = 0;
let selectedTextureIndex2 = 1;
let leafEffect: BushLeafEffect | null = null;

const TREE_X = -10; // Tree positioned to the left of spawn

// Tree generation parameters (reactive)
const treeParams = ref({
  // Rotation angles
  yawAngle: 0.975,
  yawDeviation: 0.375,
  pitchAngle: 1.0,
  pitchDeviation: 0.25,
  
  // Branch properties
  stepLength: 0.775,
  stepDeviation: 0.30,
  thicknessDecay: 0.65,
  startThickness: 3.0,
  minThickness: 0.55,
  gravityDroop: -0.12,
  
  // Complexity
  iterations: 2,
  
  // Leaves
  leafRadius: 5,
  leafRadiusVariation: 0.5,
  leafBlobs: 2,
  
  // Trunk properties
  trunkSegments: 15,
  trunkMidSegments: 6,
  trunkTopSegments: 5,
  trunkStepLength: 1.0,
  trunkTaper: 0.97,
  trunkSway: 0.0,
  trunkTwist: 0.0,
  
  // Root properties
  rootSegments: 3,
  rootBranches: 4,
  rootGravityDroop: 0.60,
  
  // Toggle flags (bound to refs)
  skipTrunk: false,
  skipBranches: false,
  skipRoots: false,
});

const colliderResolution = ref(32);
const colliderTriCount = ref(0);
const leafColliderResolution = ref(12);
const leafColliderTriCount = ref(0);
const showLeafColliderMesh = ref(false);
const isCameraInLeaves = ref(false);
const leafTexturesReady = ref(false);
let leafTriggerPost: PostProcess | null = null;

// Grid world-space size (before scaling)
const gridWorldSize = TREE_GRID_SIZE * TREE_VOXEL_SIZE; // 50 * 0.5 = 25 units (width/depth)
const gridWorldHeight = TREE_GRID_H * TREE_VOXEL_SIZE; // 80 * 0.5 = 40 units (height)

// Watch for when we're in the room and scene is ready
watch([isInRoom, () => {
  const getSceneFn = session.getScene;
  return getSceneFn ? getSceneFn() : null;
}], ([inRoom, newScene]) => {
  if (inRoom && newScene && !scene) {
    scene = newScene;
    console.log('[TreeView] Scene available and in room, initializing tree generation');
    
    // Small delay to ensure scene is fully ready
    setTimeout(() => {
      // Initialize seed and generate tree
      seed.value = (route.query.seed as string) || 'default';
      generateAndDisplayTree();
      
      // Set initial ground visibility
      updateGroundVisibility();
    }, 100);
  }
}, { immediate: true });

function updateGroundVisibility() {
  if (!scene) return;
  const ground = scene.getMeshByName('rangeGround');
  if (ground) {
    ground.setEnabled(showGround.value);
  }
}

/**
 * Generate tree from seed and display it.
 */
function generateAndDisplayTree() {
  if (!scene) {
    console.warn('[TreeView] Scene not available, cannot generate tree');
    return;
  }

  // Sync toggle flags to tree params
  treeParams.value.skipTrunk = !showTrunk.value;
  treeParams.value.skipBranches = !showBranches.value;
  treeParams.value.skipRoots = !showRoots.value;

  console.log('[TreeView] Starting tree generation with seed:', seed.value);

  // Clear existing tree meshes
  const existingTrunk = scene.getMeshByName('trunk');
  const existingLeaves = scene.getMeshByName('leaves');
  if (existingTrunk) existingTrunk.dispose();
  if (existingLeaves) existingLeaves.dispose();

  // Clear existing debug visualizations
  const existingBox = scene.getMeshByName('gridBoundingBox');
  if (existingBox) existingBox.dispose();
  
  const existingWireframe = scene.getMeshByName('debugWireframe');
  if (existingWireframe) existingWireframe.dispose();

  console.time('tree-generate');
  
  // Generate tree using L-system with custom parameters (skip leaves if toggled off)
  const result = generateTree(seed.value, treeParams.value, !showLeaves.value);
  const grid = result.grid;
  debugSegments = result.debugSegments;

  console.timeEnd('tree-generate');

  // Get voxel counts for UI
  const counts = grid.getMaterialCounts();
  voxelCounts.value = counts;

  console.time('tree-mesh');

  // Greedy mesh the tree
  const mesher = new TreeGreedyMesher(grid);
  const quads = mesher.generateMesh();
  quadCount.value = quads.length;

  console.timeEnd('tree-mesh');

  console.log(`Generated ${quads.length} quads (${counts.wood} wood, ${counts.leaf} leaf voxels)`);
  console.log(`Debug segments: ${debugSegments.length}`);

  // Build collider mesh (wood only)
  const meshBuilder = new TreeMeshBuilder();
  const fullMesh = meshBuilder.buildFromQuads(quads);
  
  // Decimate for collision
  const decimator = new TreeMeshDecimator();
  colliderMesh = decimator.decimate(fullMesh, colliderResolution.value);
  colliderTriCount.value = colliderMesh.triangleCount;
  console.log(`[TreeView] Collider mesh: ${colliderMesh.triangleCount} triangles`);

  // Build leaf collider mesh (leaves only, for trigger detection)
  const leafMeshBuilder = new TreeLeafMeshBuilder();
  const fullLeafMesh = leafMeshBuilder.buildFromQuads(quads);
  
  // Decimate for leaf trigger
  const leafDecimator = new TreeMeshDecimator();
  leafColliderMesh = leafDecimator.decimate(fullLeafMesh, leafColliderResolution.value);
  leafColliderTriCount.value = leafColliderMesh.triangleCount;
  console.log(`[TreeView] Leaf collider mesh: ${leafColliderMesh.triangleCount} triangles`);

  // Create Babylon.js meshes
  // TreeMesh internally positions at (-halfGrid, 0, -halfGrid) and scales 2x
  // This centers the tree at origin. We just need to move it to TREE_X.
  const treeMesh = new TreeMesh(scene);
  const meshes = treeMesh.createFromQuads(quads);
  
  // Position tree at TREE_X (tree is centered at origin by TreeMesh)
  for (const mesh of meshes) {
    mesh.position.set(TREE_X, 0, 0);
  }

  // Create debug visualizations
  createDebugBoundingBox();
  
  if (showDebugWireframe.value) {
    createDebugWireframe();
  }
  
  // Update collider mesh visualization
  updateColliderVisibility();
  
  // Create leaf trigger mesh and update visibility
  createLeafColliderTriggerMesh();
  updateLeafColliderVisibility();
  
  // Initialize leaf effect if not already done
  if (!leafEffect) {
    initializeLeafEffect();
  }
}

function regenerateCollider() {
  if (!scene) return;
  
  // Find existing quads from the current tree
  const existingTrunk = scene.getMeshByName('trunk');
  if (!existingTrunk) return; // No tree generated yet
  
  // Re-run mesher on current grid (stored globally? Need to fix this)
  // For now, just regenerate if collider mesh exists
  if (colliderMesh) {
    const result = generateTree(seed.value, treeParams.value, !showLeaves.value);
    const mesher = new TreeGreedyMesher(result.grid);
    const quads = mesher.generateMesh();
    
    const meshBuilder = new TreeMeshBuilder();
    const fullMesh = meshBuilder.buildFromQuads(quads);
    
    const decimator = new TreeMeshDecimator();
    colliderMesh = decimator.decimate(fullMesh, colliderResolution.value);
    colliderTriCount.value = colliderMesh.triangleCount;
    
    console.log(`[TreeView] Regenerated collider mesh: ${colliderMesh.triangleCount} triangles`);
    
    if (showColliderMesh.value) {
      createColliderMeshVisualization();
    }
  }
}

function updateColliderVisibility() {
  if (showColliderMesh.value && colliderMesh && scene) {
    createColliderMeshVisualization();
  } else if (colliderVisMesh) {
    colliderVisMesh.dispose();
    colliderVisMesh = null;
  }
}

function createColliderMeshVisualization() {
  if (!scene || !colliderMesh) return;

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

  // Position at TREE_X to match tree
  // Trees are scaled 0.4x after mesh building
  // Apply the same centering and scale as TreeMesh does
  const halfGrid = TREE_GRID_SIZE * TREE_VOXEL_SIZE * 0.5;
  const yOffset = 2 * TREE_VOXEL_SIZE;
  const TREE_SCALE = 0.4;
  
  mesh.position.set(
    (-halfGrid) * TREE_SCALE + TREE_X,
    (-yOffset) * TREE_SCALE,
    (-halfGrid) * TREE_SCALE
  );
  mesh.scaling.setAll(TREE_SCALE);

  // Wireframe material - yellow/green
  const mat = new StandardMaterial('colliderMeshMat', scene);
  mat.emissiveColor = new Color3(0.8, 1.0, 0.3);
  mat.wireframe = true;
  mat.alpha = 0.6;
  mesh.material = mat;

  colliderVisMesh = mesh;
}

function regenerateLeafCollider() {
  if (!scene) return;
  
  const existingTrunk = scene.getMeshByName('trunk');
  if (!existingTrunk) return;
  
  if (leafColliderMesh) {
    const result = generateTree(seed.value, treeParams.value, !showLeaves.value);
    const mesher = new TreeGreedyMesher(result.grid);
    const quads = mesher.generateMesh();
    
    const leafMeshBuilder = new TreeLeafMeshBuilder();
    const fullLeafMesh = leafMeshBuilder.buildFromQuads(quads);
    
    const leafDecimator = new TreeMeshDecimator();
    leafColliderMesh = leafDecimator.decimate(fullLeafMesh, leafColliderResolution.value);
    leafColliderTriCount.value = leafColliderMesh.triangleCount;
    
    console.log(`[TreeView] Regenerated leaf collider mesh: ${leafColliderMesh.triangleCount} triangles`);
    
    createLeafColliderTriggerMesh();
    
    if (showLeafColliderMesh.value) {
      createLeafColliderMeshVisualization();
    }
  }
}

function updateLeafColliderVisibility() {
  if (showLeafColliderMesh.value && leafColliderMesh && scene) {
    createLeafColliderMeshVisualization();
  } else if (leafColliderVisMesh) {
    leafColliderVisMesh.dispose();
    leafColliderVisMesh = null;
  }
}

function createLeafColliderMeshVisualization() {
  if (!scene || !leafColliderMesh) return;

  if (leafColliderVisMesh) {
    leafColliderVisMesh.dispose();
    leafColliderVisMesh = null;
  }

  const mesh = new Mesh('leafColliderMesh', scene);
  const vd = new VertexData();
  
  vd.positions = Array.from(leafColliderMesh.vertices);
  vd.indices = Array.from(leafColliderMesh.indices);
  
  vd.applyToMesh(mesh);

  const halfGrid = (TREE_GRID_SIZE * TREE_VOXEL_SIZE) * 0.5;
  const yOffset = 2 * TREE_VOXEL_SIZE;
  const TREE_SCALE = 0.4;
  
  mesh.position.set(
    (-halfGrid) * TREE_SCALE + TREE_X,
    (-yOffset) * TREE_SCALE,
    (-halfGrid) * TREE_SCALE
  );
  mesh.scaling.setAll(TREE_SCALE);

  const mat = new StandardMaterial('leafColliderMeshMat', scene);
  mat.emissiveColor = new Color3(0.3, 1.0, 0.4);
  mat.wireframe = true;
  mat.alpha = 0.6;
  mesh.material = mat;

  leafColliderVisMesh = mesh;
}

function createLeafColliderTriggerMesh() {
  if (!scene || !leafColliderMesh) return;

  if (leafColliderTriggerMesh) {
    leafColliderTriggerMesh.dispose();
    leafColliderTriggerMesh = null;
  }

  const mesh = new Mesh('leafColliderTrigger', scene);
  const vd = new VertexData();
  
  vd.positions = Array.from(leafColliderMesh.vertices);
  vd.indices = Array.from(leafColliderMesh.indices);
  
  vd.applyToMesh(mesh);

  const halfGrid = (TREE_GRID_SIZE * TREE_VOXEL_SIZE) * 0.5;
  const yOffset = 2 * TREE_VOXEL_SIZE;
  const TREE_SCALE = 0.4;
  
  mesh.position.set(
    (-halfGrid) * TREE_SCALE + TREE_X,
    (-yOffset) * TREE_SCALE,
    (-halfGrid) * TREE_SCALE
  );
  mesh.scaling.setAll(TREE_SCALE);

  mesh.isVisible = false;
  mesh.isPickable = true;

  leafColliderTriggerMesh = mesh;
}

function checkCameraInLeaves() {
  if (!leafColliderTriggerMesh || !leafColliderMesh || !scene || !scene.activeCamera || !leafTexturesReady.value) {
    isCameraInLeaves.value = false;
    return;
  }

  const camPos = scene.activeCamera.position;

  const triggerBounds = leafColliderTriggerMesh.getBoundingInfo().boundingBox;
  const worldMin = triggerBounds.minimumWorld;
  const worldMax = triggerBounds.maximumWorld;

  const triggerMargin = 0.5;

  const inLeaves = 
    camPos.x >= (worldMin.x - triggerMargin) && camPos.x <= (worldMax.x + triggerMargin) &&
    camPos.y >= (worldMin.y - triggerMargin) && camPos.y <= (worldMax.y + triggerMargin) &&
    camPos.z >= (worldMin.z - triggerMargin) && camPos.z <= (worldMax.z + triggerMargin);

  if (inLeaves && !wasInLeavesLastFrame) {
    onLeavesEnter();
  } else if (!inLeaves && wasInLeavesLastFrame) {
    onLeavesLeave();
  }

  wasInLeavesLastFrame = inLeaves;
  isCameraInLeaves.value = inLeaves;
}

function onLeavesEnter() {
  console.log('[TreeView] Camera entered leaves');
  
  if (scene && scene.activeCamera) {
    const camPos = scene.activeCamera.position;
    leafEntryX = camPos.x;
    leafEntryY = camPos.y;
    leafEntryZ = camPos.z;
  }
  
  try {
    const audioManager = AudioManager.getInstance();
    audioManager.play('rustle', { volume: 0.5 });
  } catch (e) {
    console.warn('[TreeView] AudioManager not initialized yet');
  }
}

function onLeavesLeave() {
  console.log('[TreeView] Camera left leaves');
  
  selectedTextureIndex1 = Math.floor(Math.random() * 3);
  selectedTextureIndex2 = Math.floor(Math.random() * 3);
  
  while (selectedTextureIndex2 === selectedTextureIndex1) {
    selectedTextureIndex2 = Math.floor(Math.random() * 3);
  }
  
  console.log(`[TreeView] Next leaf entry will use texture sets ${selectedTextureIndex1} and ${selectedTextureIndex2}`);
  
  try {
    const audioManager = AudioManager.getInstance();
    audioManager.play('rustle', { volume: 0.4 });
  } catch (e) {
    console.warn('[TreeView] AudioManager not initialized yet');
  }
}

async function initializeLeafEffect() {
  if (!scene || leafEffect) return;

  console.log('[TreeView] Initializing leaf effect...');
  leafEffect = new BushLeafEffect(scene);
  
  try {
    await leafEffect.generate();
    console.log('[TreeView] Leaf textures generated successfully');
    
    selectedTextureIndex1 = Math.floor(Math.random() * 3);
    selectedTextureIndex2 = Math.floor(Math.random() * 3);
    while (selectedTextureIndex2 === selectedTextureIndex1) {
      selectedTextureIndex2 = Math.floor(Math.random() * 3);
    }
    console.log(`[TreeView] Initial texture sets selected: ${selectedTextureIndex1} and ${selectedTextureIndex2}`);
    
    // Initialize wasInLeavesLastFrame to current state before starting checks
    if (scene && scene.activeCamera && leafColliderTriggerMesh && leafColliderMesh) {
      const camPos = scene.activeCamera.position;
      const triggerBounds = leafColliderTriggerMesh.getBoundingInfo().boundingBox;
      const worldMin = triggerBounds.minimumWorld;
      const worldMax = triggerBounds.maximumWorld;
      const triggerMargin = 0.5;
      
      wasInLeavesLastFrame = 
        camPos.x >= (worldMin.x - triggerMargin) && camPos.x <= (worldMax.x + triggerMargin) &&
        camPos.y >= (worldMin.y - triggerMargin) && camPos.y <= (worldMax.y + triggerMargin) &&
        camPos.z >= (worldMin.z - triggerMargin) && camPos.z <= (worldMax.z + triggerMargin);
      
      isCameraInLeaves.value = wasInLeavesLastFrame;
      
      if (wasInLeavesLastFrame) {
        leafEntryX = camPos.x;
        leafEntryY = camPos.y;
        leafEntryZ = camPos.z;
      }
    }
    
    setupLeafTriggerDetection();
    
    // Mark textures as ready AFTER initialization
    leafTexturesReady.value = true;
  } catch (error) {
    console.error('[TreeView] Failed to generate leaf textures:', error);
  }
}

function setupLeafTriggerDetection() {
  if (!scene) return;

  // Create leaf overlay post-process with mask-based alpha and parallax movement
  Effect.ShadersStore['leafTriggerFragmentShader'] = `
    precision highp float;
    
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform sampler2D leafColorTexture1;
    uniform sampler2D leafMaskTexture1;
    uniform sampler2D leafColorTexture2;
    uniform sampler2D leafMaskTexture2;
    uniform float intensity;
    uniform vec2 screenSize;
    uniform vec2 textureSize;
    uniform vec3 cameraOffset;
    
    void main() {
      vec4 sceneColor = texture2D(textureSampler, vUV);
      
      if (intensity < 0.01) {
        gl_FragColor = sceneColor;
        return;
      }
      
      // Calculate uniform scale to fit texture to screen (cover largest dimension)
      float screenAspect = screenSize.x / screenSize.y;
      float textureAspect = textureSize.x / textureSize.y;
      
      vec2 scale;
      if (screenAspect > textureAspect) {
        // Screen is wider - fit to width
        scale = vec2(1.0, screenAspect / textureAspect);
      } else {
        // Screen is taller - fit to height
        scale = vec2(textureAspect / screenAspect, 1.0);
      }
      
      // Add overdraw for parallax movement (scale up slightly)
      float overdrawScale = 1.032; // ~16 pixels per side at 1024px
      scale *= overdrawScale;
      
      // Parallax offset from camera movement
      vec2 parallaxOffset1 = vec2(cameraOffset.x * 0.02, cameraOffset.z * 0.02);
      vec2 parallaxOffset2 = vec2(-cameraOffset.x * 0.015, cameraOffset.z * 0.025);
      
      // Layer 1: 65% opacity with first parallax offset and first texture set
      vec2 leafUV1 = (vUV - 0.5) / scale + 0.5 + parallaxOffset1;
      vec4 leafColor1 = texture2D(leafColorTexture1, leafUV1);
      float leafMask1 = texture2D(leafMaskTexture1, leafUV1).r;
      vec3 darkenedLeaf1 = leafColor1.rgb * 0.3;
      float mixAmount1 = leafMask1 * intensity * 0.65;
      
      // Layer 2: 100% opacity with second parallax offset and second texture set
      vec2 leafUV2 = (vUV - 0.5) / scale + 0.5 + parallaxOffset2;
      vec4 leafColor2 = texture2D(leafColorTexture2, leafUV2);
      float leafMask2 = texture2D(leafMaskTexture2, leafUV2).r;
      vec3 darkenedLeaf2 = leafColor2.rgb * 0.3;
      float mixAmount2 = leafMask2 * intensity;
      
      // Composite both layers over scene
      vec3 result = sceneColor.rgb;
      result = mix(result, darkenedLeaf1, mixAmount1);
      result = mix(result, darkenedLeaf2, mixAmount2);
      
      gl_FragColor = vec4(result, sceneColor.a);
    }
  `;

  const camera = scene.activeCamera;
  if (camera) {
    leafTriggerPost = new PostProcess(
      'leafTrigger',
      'leafTrigger',
      ['intensity', 'screenSize', 'textureSize', 'cameraOffset'],
      ['leafColorTexture1', 'leafMaskTexture1', 'leafColorTexture2', 'leafMaskTexture2'],
      1.0,
      camera
    );

    leafTriggerPost.onApply = (effect) => {
      const isInLeaves = isCameraInLeaves.value;
      
      if (leafEffect && leafEffect.ready()) {
        const colorTexture1 = leafEffect.getColorTexture(selectedTextureIndex1);
        const maskTexture1 = leafEffect.getMaskTexture(selectedTextureIndex1);
        const colorTexture2 = leafEffect.getColorTexture(selectedTextureIndex2);
        const maskTexture2 = leafEffect.getMaskTexture(selectedTextureIndex2);
        
        if (colorTexture1 && maskTexture1 && colorTexture2 && maskTexture2 && scene && scene.activeCamera) {
          effect.setTexture('leafColorTexture1', colorTexture1);
          effect.setTexture('leafMaskTexture1', maskTexture1);
          effect.setTexture('leafColorTexture2', colorTexture2);
          effect.setTexture('leafMaskTexture2', maskTexture2);
          
          const engine = scene.getEngine();
          effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
          effect.setFloat2('textureSize', 1024, 1024);
          
          const camPos = scene.activeCamera.position;
          const offsetX = camPos.x - leafEntryX;
          const offsetY = camPos.y - leafEntryY;
          const offsetZ = camPos.z - leafEntryZ;
          effect.setFloat3('cameraOffset', offsetX, offsetY, offsetZ);
          
          effect.setFloat('intensity', isInLeaves ? 1.0 : 0.0);
        } else {
          effect.setFloat('intensity', 0.0);
        }
      } else {
        effect.setFloat('intensity', 0.0);
      }
    };
  }

  // Add camera check to render loop
  scene.onBeforeRenderObservable.add(checkCameraInLeaves);
  
  console.log('[TreeView] Leaf trigger detection and post-process set up');
}

/**
 * Create wireframe bounding box to visualize the single grid extent.
 */
function createDebugBoundingBox() {
  if (!scene) return;

  // Grid world-space dimensions (before scaling)
  // Grid is 50x80x50 voxels * 0.5 = 25x40x25 units
  const boxWidth = gridWorldSize; // 25 units
  const boxHeight = gridWorldHeight; // 40 units
  const boxDepth = gridWorldSize; // 25 units

  const box = MeshBuilder.CreateBox('gridBoundingBox', {
    width: boxWidth,
    height: boxHeight,
    depth: boxDepth
  }, scene);

  // Position at tree location (TREE_X)
  // Tree is scaled 0.4x, so final size is 10x16x10 units
  const TREE_SCALE = 0.4;
  const scaledHeight = boxHeight * TREE_SCALE; // 40 * 0.4 = 16 units
  box.position.set(TREE_X, scaledHeight * 0.5, 0); // Center at half height (8 units)
  box.scaling.setAll(TREE_SCALE); // Match tree scaling

  // Subtle earthy wireframe
  const mat = new StandardMaterial('gridBoxMat', scene);
  mat.emissiveColor = new Color3(0.6, 0.5, 0.35); // Warm tan/earth tone
  mat.wireframe = true;
  mat.alpha = 0.3;
  box.material = mat;
}

/**
 * Regenerate tree with current seed.
 */
function regenerateTree() {
  generateAndDisplayTree();
}

/**
 * Generate a random seed and randomize all parameters within their slider ranges.
 */
function randomSeed() {
  const randomSeedValue = Math.random().toString(36).substring(2, 10);
  seed.value = randomSeedValue;
  
  // Randomize trunk parameters
  treeParams.value.trunkSegments = Math.floor(Math.random() * (18 - 8 + 1)) + 8;
  treeParams.value.trunkMidSegments = Math.floor(Math.random() * (9 - 4 + 1)) + 4;
  treeParams.value.trunkTopSegments = Math.floor(Math.random() * (6 - 4 + 1)) + 4;
  treeParams.value.trunkStepLength = Math.random() * (1.25 - 0.8) + 0.8;
  treeParams.value.trunkTaper = Math.random() * (0.980 - 0.960) + 0.960;
  treeParams.value.trunkSway = Math.random() * 1.0;
  treeParams.value.trunkTwist = Math.random() * 1.0 - 0.5;
  
  // Randomize rotation angles
  treeParams.value.yawAngle = Math.random() * (1.4 - 0.55) + 0.55;
  treeParams.value.yawDeviation = Math.random() * (0.6 - 0.15) + 0.15;
  treeParams.value.pitchAngle = Math.random() * (1.2 - 0.80) + 0.80;
  treeParams.value.pitchDeviation = Math.random() * (0.4 - 0.10) + 0.10;
  
  // Randomize branch properties
  treeParams.value.stepLength = Math.random() * (1.1 - 0.45) + 0.45;
  treeParams.value.stepDeviation = Math.random() * (0.40 - 0.2) + 0.2;
  treeParams.value.thicknessDecay = Math.random() * (0.70 - 0.6) + 0.6;
  treeParams.value.minThickness = Math.random() * (0.70 - 0.4) + 0.4;
  
  // Randomize leaf properties
  treeParams.value.leafRadius = Math.floor(Math.random() * (6 - 4 + 1)) + 4;
  treeParams.value.leafRadiusVariation = Math.random() * 1.0;
  treeParams.value.leafBlobs = Math.floor(Math.random() * (4 - 1 + 1)) + 1;
  
  // Randomize gravity droop (-0.12 to 0.12 range)
  treeParams.value.gravityDroop = Math.random() * (0.12 - (-0.12)) + (-0.12);
  
  // Randomize root properties
  treeParams.value.rootSegments = Math.floor(Math.random() * (6 - 1 + 1)) + 1;
  treeParams.value.rootBranches = Math.floor(Math.random() * (6 - 2 + 1)) + 2;
  treeParams.value.rootGravityDroop = Math.random() * (0.70 - 0.50) + 0.50;
  
  // Note: Iterations not randomized - user can adjust manually
  
  // Update URL
  router.push({ path: '/tree/', query: { seed: randomSeedValue } });
  
  generateAndDisplayTree();
}


/**
 * Create debug wireframe showing the L-system turtle path.
 * Matches tree scale (0.4x), positioned at TREE_X.
 */
function createDebugWireframe() {
  if (!scene) return;

  const TREE_SCALE = 0.4;
  const lines: Vector3[][] = [];
  
  // Center offsets
  const halfGrid = TREE_GRID_SIZE * TREE_VOXEL_SIZE * 0.5;
  const yOffset = 2 * TREE_VOXEL_SIZE;

  // Convert each debug segment to a line
  for (const seg of debugSegments) {
    const start = new Vector3(
      (seg.startX * TREE_VOXEL_SIZE - halfGrid) * TREE_SCALE + TREE_X,
      (seg.startY * TREE_VOXEL_SIZE - yOffset) * TREE_SCALE,
      (seg.startZ * TREE_VOXEL_SIZE - halfGrid) * TREE_SCALE
    );
    const end = new Vector3(
      (seg.endX * TREE_VOXEL_SIZE - halfGrid) * TREE_SCALE + TREE_X,
      (seg.endY * TREE_VOXEL_SIZE - yOffset) * TREE_SCALE,
      (seg.endZ * TREE_VOXEL_SIZE - halfGrid) * TREE_SCALE
    );
    
    lines.push([start, end]);
  }

  // Create line system showing all segments
  const wireframe = LinesBuilder.CreateLineSystem('debugWireframe', { lines }, scene);
  
  // Bright yellow wireframe for visibility
  wireframe.color = new Color3(1, 1, 0);
  
  console.log(`Debug wireframe: ${lines.length} segments, scaled to match tree (0.4x)`);
}

/**
 * Reset parameters to default values.
 */
function resetParams() {
  treeParams.value = {
    yawAngle: 0.975,
    yawDeviation: 0.375,
    pitchAngle: 1.0,
    pitchDeviation: 0.25,
    stepLength: 0.775,
    stepDeviation: 0.30,
    thicknessDecay: 0.65,
    startThickness: 3.0,
    minThickness: 0.55,
    iterations: 2,
    gravityDroop: -0.12,
    leafRadius: 5,
    leafRadiusVariation: 0.5,
    leafBlobs: 2,
    trunkSegments: 15,
    trunkMidSegments: 6,
    trunkTopSegments: 5,
    trunkStepLength: 1.0,
    trunkTaper: 0.97,
    trunkSway: 0.0,
    trunkTwist: 0.0,
    rootSegments: 3,
    rootBranches: 4,
    rootGravityDroop: 0.60,
    skipTrunk: false,
    skipBranches: false,
    skipRoots: false,
  };
  showTrunk.value = true;
  showBranches.value = true;
  showRoots.value = true;
  showLeaves.value = true;
  regenerateTree();
}

/**
 * Cleanup on unmount.
 */
function cleanup() {
  if (colliderVisMesh) {
    colliderVisMesh.dispose();
    colliderVisMesh = null;
  }
  if (leafColliderVisMesh) {
    leafColliderVisMesh.dispose();
    leafColliderVisMesh = null;
  }
  if (leafColliderTriggerMesh) {
    leafColliderTriggerMesh.dispose();
    leafColliderTriggerMesh = null;
  }
  if (leafTriggerPost) {
    leafTriggerPost.dispose();
    leafTriggerPost = null;
  }
  if (leafEffect) {
    leafEffect = null;
  }
  scene = null;
}

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'tree_editor_1',
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
.tree-view {
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

.tree-info {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}

.info-card {
  background: linear-gradient(135deg, rgba(245, 235, 220, 0.95), rgba(230, 220, 200, 0.95));
  backdrop-filter: blur(10px);
  min-width: 320px;
  max-width: 380px;
  max-height: 90vh;
  border: 2px solid rgba(139, 115, 85, 0.3);
  box-shadow: 0 4px 20px rgba(101, 67, 33, 0.15) !important;
  display: flex;
  flex-direction: column;
}

.info-card :deep(.v-card-title) {
  color: #4A3728;
  font-weight: 600;
  border-bottom: 1px solid rgba(139, 115, 85, 0.2);
  flex-shrink: 0;
}

.params-scroll {
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(90vh - 80px);
}

.params-scroll::-webkit-scrollbar {
  width: 8px;
}

.params-scroll::-webkit-scrollbar-track {
  background: rgba(139, 115, 85, 0.1);
  border-radius: 4px;
}

.params-scroll::-webkit-scrollbar-thumb {
  background: rgba(139, 115, 85, 0.4);
  border-radius: 4px;
}

.params-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 115, 85, 0.6);
}

.info-card :deep(.v-card-text) {
  color: #5D4E37;
}

.param-section {
  margin: 8px 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #4A3728;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-item {
  margin-bottom: 12px;
}

.param-item label {
  font-size: 12px;
  color: #5D4E37;
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.info-card :deep(.v-slider) {
  margin-top: 4px;
}

.info-card :deep(.v-slider .v-slider-track__fill) {
  background-color: #6B8E23;
}

.info-card :deep(.v-slider-thumb) {
  background-color: #6B8E23 !important;
  width: 14px !important;
  height: 14px !important;
}

.info-card :deep(.v-slider-thumb__surface) {
  width: 14px !important;
  height: 14px !important;
}

.info-card :deep(.v-slider-thumb::before) {
  display: none !important;
}

.info-card :deep(.v-btn) {
  text-transform: none;
  font-weight: 500;
}

.info-card :deep(.v-btn.v-btn--variant-elevated) {
  box-shadow: 0 2px 8px rgba(101, 67, 33, 0.2);
}

.info-card :deep(.v-btn.v-btn--variant-outlined) {
  border-color: #654321;
  color: #654321;
}

.info-card :deep(.v-checkbox .v-label) {
  color: #5D4E37;
  font-size: 14px;
}

.nature-btn {
  color: white !important;
  font-weight: 500 !important;
  letter-spacing: 0.3px;
}

.nature-btn:hover {
  filter: brightness(1.1);
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
