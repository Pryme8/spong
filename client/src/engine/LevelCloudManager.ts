/**
 * Level cloud manager - generates and places decorative clouds in the sky.
 * Clouds are client-only (not synced) and rendered via CloudPostProcess.
 * Uses thin instances for maximum performance.
 */

import { Scene, Mesh, VertexData, StandardMaterial, Color3, Matrix, Vector3, Quaternion } from '@babylonjs/core';
import {
  generateCloud,
  CloudGreedyMesher,
  SeededRandom,
  CLOUD_GRID_W,
  CLOUD_GRID_D,
  CLOUD_VOXEL_SIZE,
  type CloudQuad
} from '@spong/shared';
import type { CloudPostProcess } from './CloudPostProcess';

const CLOUD_COUNT = 5;
const CLOUD_INSTANCES_MIN = 120;
const CLOUD_INSTANCES_MAX = 300;
const CLOUD_ALTITUDE_MIN = 80;
const CLOUD_ALTITUDE_MAX = 160;
const CLOUD_SPAWN_RADIUS = 1200;
const CLOUD_SCALE_MIN = 3.2;
const CLOUD_SCALE_MAX = 6.0;

export class LevelCloudManager {
  private scene: Scene;
  private levelSeed: string;
  private postProcess: CloudPostProcess;
  private baseMeshes: Mesh[] = [];
  private cloudMaterial: StandardMaterial;

  constructor(scene: Scene, levelSeed: string, postProcess: CloudPostProcess) {
    this.scene = scene;
    this.levelSeed = levelSeed;
    this.postProcess = postProcess;

    this.cloudMaterial = new StandardMaterial('cloudMat', scene);
    this.cloudMaterial.diffuseColor = new Color3(0.95, 0.95, 1.0);
    this.cloudMaterial.emissiveColor = new Color3(0.35, 0.32, 0.25); // Warm sun glow
    this.cloudMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    this.cloudMaterial.backFaceCulling = true;
  }

  async initialize(): Promise<void> {
    console.log(`[CloudManager] Generating ${CLOUD_COUNT} cloud variations...`);

    for (let i = 0; i < CLOUD_COUNT; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 0));

      const grid = generateCloud(`${this.levelSeed}_cloud_${i}`);
      const quads = new CloudGreedyMesher(grid).generateMesh();

      const baseMesh = this.buildMesh(quads, `cloud_base_${i}`);
      this.baseMeshes.push(baseMesh);
    }

    console.log(`[CloudManager] Created ${this.baseMeshes.length} variations, placing thin instances...`);
    this.placeInstances();
  }

  private placeInstances(): void {
    const rng = new SeededRandom(`${this.levelSeed}_cloud_placement`);
    const instanceCount = rng.int(CLOUD_INSTANCES_MIN, CLOUD_INSTANCES_MAX);

    // Distribute instances across base meshes
    const instancesPerMesh: Matrix[][] = this.baseMeshes.map(() => []);

    for (let i = 0; i < instanceCount; i++) {
      const variationId = rng.int(0, this.baseMeshes.length - 1);

      // Random position spread across the full area
      const posX = rng.range(-CLOUD_SPAWN_RADIUS, CLOUD_SPAWN_RADIUS);
      const posY = rng.range(CLOUD_ALTITUDE_MIN, CLOUD_ALTITUDE_MAX);
      const posZ = rng.range(-CLOUD_SPAWN_RADIUS, CLOUD_SPAWN_RADIUS);

      // Random non-uniform scale for variety
      const baseScale = rng.range(CLOUD_SCALE_MIN, CLOUD_SCALE_MAX);
      const scaleX = baseScale * rng.range(0.7, 1.4);
      const scaleY = baseScale * rng.range(0.5, 1.0); // Flatter clouds
      const scaleZ = baseScale * rng.range(0.7, 1.4);

      // Random rotation on all axes
      const rotX = rng.range(-0.15, 0.15); // Slight tilt
      const rotY = rng.range(0, Math.PI * 2); // Full yaw
      const rotZ = rng.range(-0.15, 0.15); // Slight roll

      const rotation = Quaternion.RotationYawPitchRoll(rotY, rotX, rotZ);

      const matrix = Matrix.Compose(
        new Vector3(scaleX, scaleY, scaleZ),
        rotation,
        new Vector3(posX, posY, posZ)
      );

      instancesPerMesh[variationId].push(matrix);
    }

    // Apply thin instances to each base mesh
    let totalInstances = 0;
    for (let i = 0; i < this.baseMeshes.length; i++) {
      const matrices = instancesPerMesh[i];
      if (matrices.length === 0) continue;

      const base = this.baseMeshes[i];

      // Build flat Float32Array of all matrices
      const matrixData = new Float32Array(matrices.length * 16);
      for (let j = 0; j < matrices.length; j++) {
        matrices[j].copyToArray(matrixData, j * 16);
      }

      base.thinInstanceSetBuffer('matrix', matrixData, 16);
      totalInstances += matrices.length;

      // Register the base mesh with the post-process (thin instances render with it)
      this.postProcess.addCloudMesh(base);
    }

    console.log(`[CloudManager] Placed ${totalInstances} thin instances across ${this.baseMeshes.length} meshes`);
  }

  private buildMesh(quads: CloudQuad[], name: string): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vi = 0;

    const vs = CLOUD_VOXEL_SIZE;

    for (const q of quads) {
      let nx = 0, ny = 0, nz = 0;
      let c: number[][];

      switch (q.axis) {
        case 'x':
          nx = q.positive ? 1 : -1;
          c = q.positive
            ? [[q.x,q.y,q.z],[q.x,q.y,q.z+q.width*vs],[q.x,q.y+q.height*vs,q.z+q.width*vs],[q.x,q.y+q.height*vs,q.z]]
            : [[q.x,q.y,q.z+q.width*vs],[q.x,q.y,q.z],[q.x,q.y+q.height*vs,q.z],[q.x,q.y+q.height*vs,q.z+q.width*vs]];
          break;
        case 'y':
          ny = q.positive ? 1 : -1;
          c = q.positive
            ? [[q.x,q.y,q.z],[q.x+q.width*vs,q.y,q.z],[q.x+q.width*vs,q.y,q.z+q.height*vs],[q.x,q.y,q.z+q.height*vs]]
            : [[q.x,q.y,q.z+q.height*vs],[q.x+q.width*vs,q.y,q.z+q.height*vs],[q.x+q.width*vs,q.y,q.z],[q.x,q.y,q.z]];
          break;
        default: // z
          nz = q.positive ? 1 : -1;
          c = q.positive
            ? [[q.x+q.width*vs,q.y,q.z],[q.x,q.y,q.z],[q.x,q.y+q.height*vs,q.z],[q.x+q.width*vs,q.y+q.height*vs,q.z]]
            : [[q.x,q.y,q.z],[q.x+q.width*vs,q.y,q.z],[q.x+q.width*vs,q.y+q.height*vs,q.z],[q.x,q.y+q.height*vs,q.z]];
          break;
      }

      for (const v of c) {
        positions.push(v[0], v[1], v[2]);
        normals.push(nx, ny, nz);
      }
      uvs.push(0,0, q.width,0, q.width,q.height, 0,q.height);
      indices.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
      vi += 4;
    }

    const mesh = new Mesh(name, this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.indices = indices;
    vd.applyToMesh(mesh);

    // Scale 3x and centre at origin
    const gw = CLOUD_GRID_W * CLOUD_VOXEL_SIZE;
    const gd = CLOUD_GRID_D * CLOUD_VOXEL_SIZE;
    mesh.scaling.setAll(3.0);
    mesh.position.set(-gw * 1.5, 0, -gd * 1.5);

    mesh.material = this.cloudMaterial;
    mesh.isPickable = false; // Don't interfere with raycasting for shooting
    return mesh;
  }

  dispose(): void {
    for (const base of this.baseMeshes) {
      this.postProcess.removeCloudMesh(base);
      base.thinInstanceCount = 0;
      base.dispose();
    }
    this.cloudMaterial.dispose();

    this.baseMeshes = [];
    console.log('[CloudManager] Disposed');
  }
}
