<template>
  <div class="bush-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Game HUD -->
    <GameHud
      title="Bush Editor"
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

    <!-- Bush Parameter UI Overlay -->
    <div class="bush-info">
      <v-card class="info-card" elevation="4">
        <v-card-title>Bush Parameters</v-card-title>
        <v-card-text class="params-scroll">
          <!-- Seed and Stats -->
          <div class="mb-3">
            <strong>Seed:</strong> {{ seed }}
            <div class="mt-1 text-caption">
              <span style="color: #2D5016;">{{ solidCount }} solid voxels</span> • 
              <span style="color: #5B8C3A;">{{ quadCount }} quads</span>
            </div>
            <div class="text-caption">
              Generation: {{ genTimeMs }}ms | Mesh: {{ meshTimeMs }}ms
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <!-- Visibility -->
          <div class="param-section">
            <div class="section-title">Visibility</div>
            
            <v-checkbox 
              v-model="showGround" 
              label="Show Ground Plane" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="updateGroundVisibility"
            ></v-checkbox>

            <v-checkbox 
              v-model="showBoundingBox" 
              label="Show Bounding Box" 
              density="compact"
              hide-details
              class="mb-1"
              @update:model-value="updateBoundingBoxVisibility"
            ></v-checkbox>
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
                :max="32"
                :step="2"
                density="compact"
                hide-details
                @end="regenerateCollider"
              ></v-slider>
            </div>
          </div>

          <v-divider class="my-3"></v-divider>

          <!-- Action Buttons -->
          <div class="mt-3">
            <v-btn @click="regenerateBush" color="#3A7D44" size="small" class="nature-btn mb-2" block>
              Regenerate Bush
            </v-btn>
            <v-btn @click="randomSeed" color="#5B9A3A" size="small" class="nature-btn mb-2" block>
              Random Seed
            </v-btn>
            <v-btn 
              @click="showLeafTextures = !showLeafTextures" 
              color="#4A6D3A" 
              size="small" 
              class="nature-btn" 
              block
              :disabled="!leafTexturesReady"
            >
              {{ showLeafTextures ? 'Hide' : 'Show' }} Leaf Textures
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Back button -->
    <router-link to="/" class="back-button">← Back</router-link>

    <!-- Leaf Texture Preview Overlay -->
    <div v-if="showLeafTextures && leafTexturesReady" class="leaf-texture-preview">
      <v-card class="preview-card" elevation="8">
        <v-card-title>
          Leaf Texture Preview
          <v-btn icon size="small" @click="showLeafTextures = false" class="close-btn">
            <span>✕</span>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <div class="texture-grid">
            <div v-for="i in 3" :key="i" class="texture-pair">
              <div class="texture-label">Texture {{ i }}</div>
              <div class="texture-images">
                <canvas :ref="el => setColorCanvas(el, i - 1)" class="texture-canvas" width="256" height="256"></canvas>
                <canvas :ref="el => setMaskCanvas(el, i - 1)" class="texture-canvas" width="256" height="256"></canvas>
              </div>
              <div class="texture-sublabels">
                <span>Color</span>
                <span>Mask</span>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Scene, Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh, VertexData, PostProcess, Effect, Ray } from '@babylonjs/core';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import { BushLeafEffect } from '../engine/BushLeafEffect';
import { AudioManager } from '../engine/AudioManager';
import GameHud from '../components/GameHud.vue';
import {
  generateBush, BushGreedyMesher, BushMeshBuilder, BushMeshDecimator,
  BUSH_GRID_W, BUSH_GRID_H, BUSH_GRID_D, BUSH_VOXEL_SIZE,
  type BushQuad, type BushColliderMesh
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
  playerX,
  playerY,
  playerZ,
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

const showGround = ref(true);
const showBoundingBox = ref(true);
const showColliderMesh = ref(false);
const seed = ref<string>('');
const solidCount = ref(0);
const quadCount = ref(0);
const genTimeMs = ref(0);
const meshTimeMs = ref(0);

let bushMesh: Mesh | null = null;
let boundingBoxMesh: Mesh | null = null;
let colliderMesh: BushColliderMesh | null = null;
let colliderVisMesh: Mesh | null = null;
let colliderTriggerMesh: Mesh | null = null; // Invisible mesh for trigger detection
let bushTriggerPost: PostProcess | null = null;
let leafEffect: BushLeafEffect | null = null;

const colliderResolution = ref(18);
const colliderTriCount = ref(0);
const isCameraInBush = ref(false);
const showLeafTextures = ref(false);
const leafTexturesReady = ref(false);
let wasInBushLastFrame = false;
let bushEntryX = 0;
let bushEntryY = 0;
let bushEntryZ = 0;
let selectedTextureIndex1 = 0;
let selectedTextureIndex2 = 1;

// Canvas refs for texture preview
const colorCanvases: (HTMLCanvasElement | null)[] = new Array(3).fill(null);
const maskCanvases: (HTMLCanvasElement | null)[] = new Array(3).fill(null);

const BUSH_X = -10; // Bush positioned to the left of spawn
const BUSH_SCALE = 0.5; // Scale factor for the bush mesh

// Grid world-space size (before scaling)
const gridWorldW = BUSH_GRID_W * BUSH_VOXEL_SIZE;
const gridWorldH = BUSH_GRID_H * BUSH_VOXEL_SIZE;
const gridWorldD = BUSH_GRID_D * BUSH_VOXEL_SIZE;

// Watch for when we're in the room and scene is ready
watch([isInRoom, () => {
  const getSceneFn = session.getScene;
  return getSceneFn ? getSceneFn() : null;
}], ([inRoom, newScene]) => {
  if (inRoom && newScene && !scene) {
    scene = newScene;
    console.log('[BushView] Scene available and in room, initializing bush generation');
    
    // Small delay to ensure scene is fully ready
    setTimeout(() => {
      // Initialize seed and generate bush
      seed.value = (route.query.seed as string) || 'shrub';
      generateAndDisplayBush();
      
      // Set initial ground visibility
      updateGroundVisibility();
    }, 100);
  }
}, { immediate: true });

// Watch for texture preview visibility changes
watch(showLeafTextures, (show) => {
  if (show && leafTexturesReady.value) {
    // Update all previews when shown
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        updateTexturePreview(i);
      }
    }, 50);
  }
});

function updateGroundVisibility() {
  if (!scene) return;
  const ground = scene.getMeshByName('rangeGround');
  if (ground) {
    ground.setEnabled(showGround.value);
  }
}

function updateBoundingBoxVisibility() {
  if (boundingBoxMesh) {
    boundingBoxMesh.setEnabled(showBoundingBox.value);
  }
}

/**
 * Generate bush from seed and display it.
 */
function generateAndDisplayBush() {
  if (!scene) {
    console.warn('[BushView] Scene not available, cannot generate bush');
    return;
  }

  console.log('[BushView] Starting bush generation with seed:', seed.value);

  // Clear existing bush mesh
  if (bushMesh) {
    bushMesh.dispose();
    bushMesh = null;
  }

  // Clear existing trigger mesh
  if (colliderTriggerMesh) {
    colliderTriggerMesh.dispose();
    colliderTriggerMesh = null;
  }

  // Clear existing bounding box
  if (boundingBoxMesh) {
    boundingBoxMesh.dispose();
    boundingBoxMesh = null;
  }

  console.time('bush-generate');

  const grid = generateBush(seed.value);

  console.timeEnd('bush-generate');

  const t0 = performance.now();
  solidCount.value = grid.getSolidCount();

  console.time('bush-mesh');

  // Greedy mesh the bush
  const mesher = new BushGreedyMesher(grid);
  const quads = mesher.generateMesh();
  quadCount.value = quads.length;

  console.timeEnd('bush-mesh');

  const t1 = performance.now();
  genTimeMs.value = Math.round(t1 - t0);
  meshTimeMs.value = Math.round(t1 - t0);

  console.log(`[BushView] Generated ${quads.length} quads (${solidCount.value} solid voxels)`);

  // Build collider mesh
  const meshBuilder = new BushMeshBuilder();
  const fullMesh = meshBuilder.buildFromQuads(quads);
  
  // Decimate for collision
  const decimator = new BushMeshDecimator();
  colliderMesh = decimator.decimate(fullMesh, colliderResolution.value);
  colliderTriCount.value = colliderMesh.triangleCount;
  console.log(`[BushView] Collider mesh: ${colliderMesh.triangleCount} triangles`);

  // Create Babylon.js mesh from quads
  bushMesh = createBushMesh(quads);

  // Create invisible trigger mesh from collider
  createColliderTriggerMesh();

  // Create bounding box
  createDebugBoundingBox();
  
  // Update collider mesh visualization
  updateColliderVisibility();
  
  // Generate leaf textures first, then set up trigger detection
  initializeLeafEffect();
}

/**
 * Build a Babylon Mesh from greedy-meshed quads.
 */
function createBushMesh(quads: BushQuad[]): Mesh {
  if (!scene) return null!;

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

  const mesh = new Mesh('bushMesh', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);

  // Center and scale the bush
  const halfW = gridWorldW * 0.5;
  const halfD = gridWorldD * 0.5;
  mesh.position.set(
    -halfW * BUSH_SCALE + BUSH_X,
    0,
    -halfD * BUSH_SCALE
  );
  mesh.scaling.setAll(BUSH_SCALE);

  // Bush material — green foliage
  const mat = new StandardMaterial('bushMat', scene);
  mat.diffuseColor = new Color3(0.28, 0.52, 0.22);
  mat.emissiveColor = new Color3(0.04, 0.08, 0.03);
  mat.specularColor = new Color3(0.1, 0.15, 0.08);
  mat.backFaceCulling = true;
  mesh.material = mat;

  return mesh;
}

function generateQuadGeometry(quad: BushQuad): {
  positions: number[];
  normals: number[];
  uvs: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const { x, y, z, width, height, axis, positive } = quad;
  const vs = BUSH_VOXEL_SIZE;

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

/**
 * Create wireframe bounding box to visualize the grid extent.
 */
function createDebugBoundingBox() {
  if (!scene) return;

  const box = MeshBuilder.CreateBox('bushBoundingBox', {
    width: gridWorldW,
    height: gridWorldH,
    depth: gridWorldD
  }, scene);

  // Match bush scaling and position
  const scaledHeight = gridWorldH * BUSH_SCALE;
  box.position.set(BUSH_X, scaledHeight * 0.5, 0);
  box.scaling.setAll(BUSH_SCALE);

  // Subtle green wireframe
  const mat = new StandardMaterial('bushBoxMat', scene);
  mat.emissiveColor = new Color3(0.3, 0.55, 0.3);
  mat.wireframe = true;
  mat.alpha = 0.3;
  box.material = mat;

  boundingBoxMesh = box;
  box.setEnabled(showBoundingBox.value);
}

function regenerateCollider() {
  if (!scene) return;
  
  // Find existing mesh
  const existingBush = scene.getMeshByName('bushMesh');
  if (!existingBush) return; // No bush generated yet
  
  // Re-run mesher on current grid
  if (colliderMesh) {
    const grid = generateBush(seed.value);
    const mesher = new BushGreedyMesher(grid);
    const quads = mesher.generateMesh();
    
    const meshBuilder = new BushMeshBuilder();
    const fullMesh = meshBuilder.buildFromQuads(quads);
    
    const decimator = new BushMeshDecimator();
    colliderMesh = decimator.decimate(fullMesh, colliderResolution.value);
    colliderTriCount.value = colliderMesh.triangleCount;
    
    console.log(`[BushView] Regenerated collider mesh: ${colliderMesh.triangleCount} triangles`);
    
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

  // Position and scale to match bush mesh
  const halfW = gridWorldW * 0.5;
  const halfD = gridWorldD * 0.5;
  mesh.position.set(
    -halfW * BUSH_SCALE + BUSH_X,
    0,
    -halfD * BUSH_SCALE
  );
  mesh.scaling.setAll(BUSH_SCALE);

  // Wireframe material - bright green
  const mat = new StandardMaterial('colliderMeshMat', scene);
  mat.emissiveColor = new Color3(0.3, 1.0, 0.3);
  mat.wireframe = true;
  mat.alpha = 0.7;
  mesh.material = mat;

  colliderVisMesh = mesh;
}

/**
 * Create invisible trigger mesh from collider data.
 */
function createColliderTriggerMesh() {
  if (!scene || !colliderMesh) return;

  // Dispose old trigger mesh
  if (colliderTriggerMesh) {
    colliderTriggerMesh.dispose();
    colliderTriggerMesh = null;
  }

  const mesh = new Mesh('bushTrigger', scene);
  const vd = new VertexData();
  
  vd.positions = Array.from(colliderMesh.vertices);
  vd.indices = Array.from(colliderMesh.indices);
  
  vd.applyToMesh(mesh);

  // Position and scale to match bush mesh
  const halfW = gridWorldW * 0.5;
  const halfD = gridWorldD * 0.5;
  mesh.position.set(
    -halfW * BUSH_SCALE + BUSH_X,
    0,
    -halfD * BUSH_SCALE
  );
  mesh.scaling.setAll(BUSH_SCALE);

  // Make invisible but keep enabled for ray picking
  mesh.isVisible = false;
  mesh.isPickable = true;

  colliderTriggerMesh = mesh;
}

/**
 * Set up bush trigger detection - check if camera is inside bush bounds.
 */
function setupBushTriggerDetection() {
  if (!scene) return;

  // Create leaf overlay post-process with mask-based alpha and parallax movement
  Effect.ShadersStore['bushTriggerFragmentShader'] = `
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
    bushTriggerPost = new PostProcess(
      'bushTrigger',
      'bushTrigger',
      ['intensity', 'screenSize', 'textureSize', 'cameraOffset'],
      ['leafColorTexture1', 'leafMaskTexture1', 'leafColorTexture2', 'leafMaskTexture2'],
      1.0,
      camera
    );

    bushTriggerPost.onApply = (effect) => {
      const isInBush = isCameraInBush.value;
      
      if (leafEffect && leafEffect.ready()) {
        // Always bind textures (even when intensity is 0)
        const colorTexture1 = leafEffect.getColorTexture(selectedTextureIndex1);
        const maskTexture1 = leafEffect.getMaskTexture(selectedTextureIndex1);
        const colorTexture2 = leafEffect.getColorTexture(selectedTextureIndex2);
        const maskTexture2 = leafEffect.getMaskTexture(selectedTextureIndex2);
        
        if (colorTexture1 && maskTexture1 && colorTexture2 && maskTexture2 && scene && scene.activeCamera) {
          effect.setTexture('leafColorTexture1', colorTexture1);
          effect.setTexture('leafMaskTexture1', maskTexture1);
          effect.setTexture('leafColorTexture2', colorTexture2);
          effect.setTexture('leafMaskTexture2', maskTexture2);
          
          // Pass screen and texture dimensions
          const engine = scene.getEngine();
          effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
          effect.setFloat2('textureSize', 1024, 1024);
          
          // Calculate camera offset from bush entry position for parallax movement
          const camPos = scene.activeCamera.position;
          const offsetX = camPos.x - bushEntryX;
          const offsetY = camPos.y - bushEntryY;
          const offsetZ = camPos.z - bushEntryZ;
          effect.setFloat3('cameraOffset', offsetX, offsetY, offsetZ);
          
          // Set intensity based on whether camera is in bush
          effect.setFloat('intensity', isInBush ? 1.0 : 0.0);
        } else {
          effect.setFloat('intensity', 0.0);
        }
      } else {
        effect.setFloat('intensity', 0.0);
      }
    };
  }

  // Start checking camera position every frame
  scene.onBeforeRenderObservable.add(() => {
    checkCameraInBush();
  });
}

/**
 * Check if camera position is inside the bush trigger collider.
 * Uses world-space AABB bounds check for reliable trigger detection.
 */
function checkCameraInBush() {
  if (!colliderTriggerMesh || !colliderMesh || !scene || !scene.activeCamera) {
    isCameraInBush.value = false;
    return;
  }

  // Get camera position
  const camPos = scene.activeCamera.position;

  // Get trigger mesh world bounds
  const triggerBounds = colliderTriggerMesh.getBoundingInfo().boundingBox;
  const worldMin = triggerBounds.minimumWorld;
  const worldMax = triggerBounds.maximumWorld;

  // Add margin to expand trigger radius (in world units)
  const triggerMargin = 0.5;

  // Check if camera is inside expanded world-space AABB
  const inBush = 
    camPos.x >= (worldMin.x - triggerMargin) && camPos.x <= (worldMax.x + triggerMargin) &&
    camPos.y >= (worldMin.y - triggerMargin) && camPos.y <= (worldMax.y + triggerMargin) &&
    camPos.z >= (worldMin.z - triggerMargin) && camPos.z <= (worldMax.z + triggerMargin);

  // Check for enter/leave events
  if (inBush && !wasInBushLastFrame) {
    onBushEnter();
  } else if (!inBush && wasInBushLastFrame) {
    onBushLeave();
  }

  wasInBushLastFrame = inBush;
  isCameraInBush.value = inBush;

  // Hide/show bush mesh based on whether camera is inside
  if (bushMesh) {
    bushMesh.setEnabled(!inBush);
  }
}

/**
 * Called when camera enters bush trigger.
 */
function onBushEnter() {
  console.log('[BushView] Camera entered bush');
  
  // Store entry position for parallax reference
  if (scene && scene.activeCamera) {
    const camPos = scene.activeCamera.position;
    bushEntryX = camPos.x;
    bushEntryY = camPos.y;
    bushEntryZ = camPos.z;
  }
  
  try {
    const audioManager = AudioManager.getInstance();
    audioManager.play('rustle', { volume: 0.5 });
  } catch (e) {
    console.warn('[BushView] AudioManager not initialized yet');
  }
}

/**
 * Called when camera leaves bush trigger.
 */
function onBushLeave() {
  console.log('[BushView] Camera left bush');
  
  // Pre-select next two random texture sets for next entry (no delay on entry)
  selectedTextureIndex1 = Math.floor(Math.random() * 3);
  selectedTextureIndex2 = Math.floor(Math.random() * 3);
  
  // Ensure they're different
  while (selectedTextureIndex2 === selectedTextureIndex1) {
    selectedTextureIndex2 = Math.floor(Math.random() * 3);
  }
  
  console.log(`[BushView] Next bush entry will use texture sets ${selectedTextureIndex1} and ${selectedTextureIndex2}`);
  
  try {
    const audioManager = AudioManager.getInstance();
    audioManager.play('rustle', { volume: 0.4 });
  } catch (e) {
    console.warn('[BushView] AudioManager not initialized yet');
  }
}

/**
 * Initialize leaf effect and generate textures.
 */
async function initializeLeafEffect() {
  if (!scene) return;

  console.log('[BushView] Initializing leaf effect...');
  leafEffect = new BushLeafEffect(scene);
  
  try {
    await leafEffect.generate();
    leafTexturesReady.value = true;
    console.log('[BushView] Leaf textures generated successfully');
    
    // Initialize random texture selection for first bush entry
    selectedTextureIndex1 = Math.floor(Math.random() * 3);
    selectedTextureIndex2 = Math.floor(Math.random() * 3);
    while (selectedTextureIndex2 === selectedTextureIndex1) {
      selectedTextureIndex2 = Math.floor(Math.random() * 3);
    }
    console.log(`[BushView] Initial texture sets selected: ${selectedTextureIndex1} and ${selectedTextureIndex2}`);
    
    // Set up bush trigger detection after textures are ready
    setupBushTriggerDetection();
  } catch (error) {
    console.error('[BushView] Failed to generate leaf textures:', error);
  }
}

/**
 * Set color canvas ref.
 */
function setColorCanvas(el: any, index: number) {
  if (el instanceof HTMLCanvasElement) {
    colorCanvases[index] = el;
    updateTexturePreview(index);
  }
}

/**
 * Set mask canvas ref.
 */
function setMaskCanvas(el: any, index: number) {
  if (el instanceof HTMLCanvasElement) {
    maskCanvases[index] = el;
    updateTexturePreview(index);
  }
}

/**
 * Update texture preview for a specific index.
 */
function updateTexturePreview(index: number) {
  if (!leafEffect || !leafEffect.ready()) return;

  const colorCanvas = colorCanvases[index];
  const maskCanvas = maskCanvases[index];

  if (colorCanvas && maskCanvas) {
    const colorTexture = leafEffect.getColorTexture(index);
    const maskTexture = leafEffect.getMaskTexture(index);

    if (colorTexture && maskTexture) {
      // Draw color texture to preview canvas
      const colorCtx = colorCanvas.getContext('2d');
      if (colorCtx) {
        const colorData = colorTexture.getContext().getImageData(0, 0, 1024, 1024);
        colorCtx.clearRect(0, 0, 256, 256);
        
        // Create temp canvas at full res then scale down
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1024;
        tempCanvas.height = 1024;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.putImageData(colorData, 0, 0);
        
        colorCtx.drawImage(tempCanvas, 0, 0, 1024, 1024, 0, 0, 256, 256);
      }

      // Draw mask texture to preview canvas
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        const maskData = maskTexture.getContext().getImageData(0, 0, 1024, 1024);
        maskCtx.clearRect(0, 0, 256, 256);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1024;
        tempCanvas.height = 1024;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.putImageData(maskData, 0, 0);
        
        maskCtx.drawImage(tempCanvas, 0, 0, 1024, 1024, 0, 0, 256, 256);
      }
    }
  }
}

/**
 * Regenerate bush with current seed.
 */
function regenerateBush() {
  generateAndDisplayBush();
}

/**
 * Generate a random seed.
 */
function randomSeed() {
  const randomSeedValue = Math.random().toString(36).substring(2, 10);
  seed.value = randomSeedValue;
  
  // Update URL
  router.push({ path: '/bush/', query: { seed: randomSeedValue } });
  
  generateAndDisplayBush();
}

/**
 * Cleanup on unmount.
 */
function cleanup() {
  if (bushMesh) {
    bushMesh.dispose();
    bushMesh = null;
  }
  if (colliderTriggerMesh) {
    colliderTriggerMesh.dispose();
    colliderTriggerMesh = null;
  }
  if (boundingBoxMesh) {
    boundingBoxMesh.dispose();
    boundingBoxMesh = null;
  }
  if (colliderVisMesh) {
    colliderVisMesh.dispose();
    colliderVisMesh = null;
  }
  if (bushTriggerPost) {
    bushTriggerPost.dispose();
    bushTriggerPost = null;
  }
  if (leafEffect) {
    leafEffect.dispose();
    leafEffect = null;
  }
  scene = null;
}

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'bush_editor_1',
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
.bush-view {
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

.bush-info {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}

.info-card {
  background: linear-gradient(135deg, rgba(220, 240, 215, 0.95), rgba(195, 225, 190, 0.95));
  backdrop-filter: blur(10px);
  min-width: 320px;
  max-width: 380px;
  max-height: 90vh;
  border: 2px solid rgba(58, 125, 68, 0.3);
  box-shadow: 0 4px 20px rgba(30, 80, 40, 0.15) !important;
  display: flex;
  flex-direction: column;
}

.info-card :deep(.v-card-title) {
  color: #2A5030;
  font-weight: 600;
  border-bottom: 1px solid rgba(58, 125, 68, 0.2);
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
  background: rgba(58, 125, 68, 0.1);
  border-radius: 4px;
}

.params-scroll::-webkit-scrollbar-thumb {
  background: rgba(58, 125, 68, 0.4);
  border-radius: 4px;
}

.params-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(58, 125, 68, 0.6);
}

.info-card :deep(.v-card-text) {
  color: #3A6545;
}

.param-section {
  margin: 8px 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #2A5030;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-item {
  margin-bottom: 12px;
}

.param-item label {
  font-size: 12px;
  color: #3A6545;
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.info-card :deep(.v-slider) {
  margin-top: 4px;
}

.info-card :deep(.v-slider .v-slider-track__fill) {
  background-color: #3A7D44;
}

.info-card :deep(.v-slider-thumb) {
  background-color: #3A7D44 !important;
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
  box-shadow: 0 2px 8px rgba(30, 80, 40, 0.2);
}

.info-card :deep(.v-btn.v-btn--variant-outlined) {
  border-color: #3A7D44;
  color: #3A7D44;
}

.info-card :deep(.v-checkbox .v-label) {
  color: #3A6545;
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

/* Leaf Texture Preview */
.leaf-texture-preview {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.preview-card {
  background: rgba(245, 245, 245, 0.98) !important;
  max-width: 1200px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.preview-card :deep(.v-card-title) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #2A5030;
  font-weight: 600;
  border-bottom: 2px solid rgba(58, 125, 68, 0.3);
  position: sticky;
  top: 0;
  background: rgba(245, 245, 245, 0.98);
  z-index: 1;
}

.close-btn {
  margin-left: auto;
}

.texture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  padding: 10px;
}

.texture-pair {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.texture-label {
  font-weight: 600;
  color: #2A5030;
  margin-bottom: 10px;
  font-size: 14px;
}

.texture-images {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
}

.texture-canvas {
  border: 2px solid rgba(58, 125, 68, 0.3);
  border-radius: 4px;
  background: white;
  image-rendering: pixelated;
}

.texture-sublabels {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #666;
  width: 100%;
  justify-content: space-around;
}

.texture-sublabels span {
  flex: 1;
  text-align: center;
}
</style>
