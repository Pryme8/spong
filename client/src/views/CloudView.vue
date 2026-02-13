<template>
  <div class="cloud-view">
    <canvas ref="canvasRef" class="babylon-canvas"></canvas>
    
    <!-- UI Overlay -->
    <div class="cloud-info">
      <v-card class="info-card" elevation="4">
        <v-card-title>Cloud Generator</v-card-title>
        <v-card-text>
          <div class="mb-3">
            <strong>Seed:</strong> {{ seed }}
            <div class="mt-1 text-caption">
              <span>{{ solidCount }} solid voxels</span> | 
              <span>{{ quadCount }} quads</span>
            </div>
            <div class="text-caption">
              Generation: {{ genTimeMs }}ms | Mesh: {{ meshTimeMs }}ms
            </div>
          </div>

          <v-divider class="my-2"></v-divider>

          <div class="mt-3">
            <v-btn @click="regenerateCloud" color="#5C8DAE" size="small" class="cloud-btn mb-2" block>
              Regenerate Cloud
            </v-btn>
            <v-btn @click="randomSeed" color="#7BA7C2" size="small" class="cloud-btn mb-2" block>
              Random Seed
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight,
  Color4, Color3, StandardMaterial, Mesh, VertexData
} from '@babylonjs/core';
import { createEngine } from '../engine/setup/setupScene';
import { CloudPostProcess } from '../engine/rendering/postprocess/CloudPostProcess';
import {
  generateCloud, CloudGreedyMesher,
  CLOUD_GRID_W, CLOUD_GRID_H, CLOUD_GRID_D, CLOUD_VOXEL_SIZE,
  type CloudQuad
} from '@spong/shared';

const route = useRoute();
const router = useRouter();

const canvasRef = ref<HTMLCanvasElement | null>(null);

let engine: Engine | null = null;
let scene: Scene | null = null;
let camera: ArcRotateCamera | null = null;
let cloudMesh: Mesh | null = null;
let cloudPostProcess: CloudPostProcess | null = null;

const seed = ref<string>('');
const solidCount = ref(0);
const quadCount = ref(0);
const genTimeMs = ref(0);
const meshTimeMs = ref(0);

// Grid world-space size
const gridW = CLOUD_GRID_W * CLOUD_VOXEL_SIZE;
const gridH = CLOUD_GRID_H * CLOUD_VOXEL_SIZE;
const gridD = CLOUD_GRID_D * CLOUD_VOXEL_SIZE;

async function initializeScene() {
  if (!canvasRef.value) return;

  engine = await createEngine(canvasRef.value);

  scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.45, 0.65, 0.9, 1); // Soft sky blue

  // Camera targeting cloud center
  camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    Math.PI / 4,
    200,
    new Vector3(0, gridH * 0.4, 0),
    scene
  );
  camera.attachControl(canvasRef.value, true);
  camera.lowerRadiusLimit = 30;
  camera.upperRadiusLimit = 400;
  camera.lowerBetaLimit = 0.05;
  camera.upperBetaLimit = Math.PI - 0.05;

  // Initialize cloud post-processing
  cloudPostProcess = new CloudPostProcess(scene, camera);

  // Soft sky lighting
  const light = new HemisphericLight('light', new Vector3(0.3, 1, 0.1), scene);
  light.intensity = 1.2;
  light.diffuse = new Color3(1, 0.98, 0.95);
  light.groundColor = new Color3(0.6, 0.7, 0.85);


  seed.value = (route.query.seed as string) || 'cumulus';
  generateAndDisplay();

  engine.runRenderLoop(() => {
    if (scene) scene.render();
  });

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
}

async function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'i' && scene) {
    if (scene.debugLayer.isVisible()) {
      scene.debugLayer.hide();
    } else {
      await import('@babylonjs/inspector');
      scene.debugLayer.show({ embedMode: true });
    }
  }
}

function generateAndDisplay() {
  if (!scene) return;

  // Generate cloud density
  const t0 = performance.now();
  const grid = generateCloud(seed.value);
  const t1 = performance.now();
  genTimeMs.value = Math.round(t1 - t0);
  solidCount.value = grid.getSolidCount();

  // Greedy mesh
  const mesher = new CloudGreedyMesher(grid);
  const quads = mesher.generateMesh();
  const t2 = performance.now();
  meshTimeMs.value = Math.round(t2 - t1);
  quadCount.value = quads.length;
  // Update existing or create new cloud mesh
  if (cloudMesh) {
    updateCloudMesh(cloudMesh, quads);
  } else {
    cloudMesh = createCloudMesh(quads);
    // Register with post-process (it handles enable/disable each frame)
    cloudPostProcess?.addCloudMesh(cloudMesh);
  }
}

function createCloudMesh(quads: CloudQuad[]): Mesh {
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

  const mesh = new Mesh('cloud', scene!);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);

  // Scale mesh by 3x
  mesh.scaling.setAll(3.0);

  // Center the scaled mesh at origin
  // Grid goes 0 to gridW, after 3x scaling it goes 0 to gridW*3
  // So offset by -gridW*1.5 to center it
  mesh.position.set(-gridW * 1.5, 0, -gridD * 1.5);

  // Cloud material - soft grayish-blue diffuse, minimal emissive
  const mat = new StandardMaterial('cloudMat', scene!);
  mat.diffuseColor = new Color3(0.88, 0.92, 0.98);
  mat.emissiveColor = new Color3(0.05, 0.06, 0.08);
  mat.specularColor = new Color3(0.3, 0.3, 0.35);
  mat.backFaceCulling = true;
  mesh.material = mat;

  return mesh;
}

function updateCloudMesh(mesh: Mesh, quads: CloudQuad[]): void {
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
}

function generateQuadGeometry(quad: CloudQuad): {
  positions: number[];
  normals: number[];
  uvs: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const { x, y, z, width, height, axis, positive } = quad;
  const vs = CLOUD_VOXEL_SIZE;

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


function regenerateCloud() {
  generateAndDisplay();
}

function randomSeed() {
  const s = Math.random().toString(36).substring(2, 10);
  seed.value = s;
  router.push({ path: '/cloud/', query: { seed: s } });
  generateAndDisplay();
}

function onResize() {
  if (engine) engine.resize();
}

function cleanup() {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeyDown);
  if (cloudMesh) { cloudMesh.dispose(); cloudMesh = null; }
  if (cloudPostProcess) { cloudPostProcess.dispose(); cloudPostProcess = null; }
  if (scene) { scene.dispose(); scene = null; }
  if (engine) { engine.dispose(); engine = null; }
}

onMounted(() => { initializeScene(); });
onUnmounted(() => { cleanup(); });
</script>

<style scoped>
.cloud-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.babylon-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.cloud-info {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}

.info-card {
  background: linear-gradient(135deg, rgba(220, 230, 245, 0.95), rgba(200, 215, 240, 0.95));
  backdrop-filter: blur(10px);
  min-width: 280px;
  max-width: 340px;
  border: 2px solid rgba(100, 140, 190, 0.3);
  box-shadow: 0 4px 20px rgba(50, 80, 120, 0.15) !important;
}

.info-card :deep(.v-card-title) {
  color: #2A4060;
  font-weight: 600;
  border-bottom: 1px solid rgba(100, 140, 190, 0.2);
}

.info-card :deep(.v-card-text) {
  color: #3A5575;
}

.cloud-btn {
  color: white !important;
  font-weight: 500 !important;
  text-transform: none;
}
</style>
