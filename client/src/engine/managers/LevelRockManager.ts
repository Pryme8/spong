/**
 * Level rock manager - handles rock mesh generation and instancing for levels.
 * Rocks use a simple gray material; striation texture generator is available in RockStriationTexture but not bound here.
 */

import { Scene, Mesh, StandardMaterial, Color3, VertexData, Vector3 } from '@babylonjs/core';
import { generateRockVariations, ROCK_VOXEL_SIZE, type RockVariation, type RockInstance, type RockColliderMesh, type RockTransform } from '@spong/shared';
import { ShadowManager } from '../systems/ShadowManager';

const ROCK_SCALE = 0.5; // Rocks are scaled down from voxel grid

/**
 * Manages rock mesh variations and instances for a level.
 * Generates rock meshes once and instances them throughout the level.
 */
export class LevelRockManager {
  readonly hasShadows = true;

  private scene: Scene;
  private levelSeed: string;
  private variations: RockVariation[] = [];
  private variationMeshes: Mesh[] = [];
  private variationCenters: Vector3[] = []; // Center offset for each variation
  private instanceRoots: Mesh[] = [];
  private rockMaterial!: StandardMaterial;

  /** Collision meshes + transforms matching the server's format for physics prediction */
  private colliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }> = [];

  constructor(scene: Scene, levelSeed: string) {
    this.scene = scene;
    this.levelSeed = levelSeed;
    this.rockMaterial = this.createRockMaterial();
  }

  /**
   * Initialize rock variations and create base meshes.
   * Call this once during level load.
   */
  async initialize(): Promise<void> {
    console.log(`Initializing rock meshes for level ${this.levelSeed}...`);

    this.variations = generateRockVariations(this.levelSeed, 5, 9);

    for (let i = 0; i < this.variations.length; i++) {
      const variation = this.variations[i];

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const mesh = this.createRockMesh(variation);

      mesh.name = `rock_${variation.id}`;
      mesh.setEnabled(false);
      this.variationMeshes.push(mesh);

      const bounds = variation.fullMesh.bounds;
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
      this.variationCenters.push(new Vector3(centerX, centerY, centerZ));
    }

    console.log(`Created ${this.variationMeshes.length} rock variation meshes`);
  }

  /**
   * Create mesh instances from rock placement data.
   * Call this when RockSpawn message is received from server.
   */
  spawnRockInstances(instances: RockInstance[]): void {
    console.log(`Spawning ${instances.length} rock instances...`);

    // Build collision data matching server (Room.ts spawnLevelRocks)
    this.colliderMeshes = instances.map(instance => {
      const variation = this.variations[instance.variationId];
      return {
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY,
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: instance.scale * ROCK_SCALE
        }
      };
    });
    console.log(`Built ${this.colliderMeshes.length} rock collider meshes for client prediction`);

    for (const instance of instances) {
      const mesh = this.variationMeshes[instance.variationId];
      
      if (!mesh) {
        console.warn(`Missing mesh for rock variation ${instance.variationId}`);
        continue;
      }

      const scale = instance.scale * ROCK_SCALE;
      const center = this.variationCenters[instance.variationId];
      
      // Compute world-space center offset (rotated by instance rotation)
      const cosR = Math.cos(instance.rotationY);
      const sinR = Math.sin(instance.rotationY);
      const offsetX = -center.x * scale;
      const offsetY = -center.y * scale;
      const offsetZ = -center.z * scale;
      
      // Create instance positioned directly (no parent TransformNode, matching tree pattern)
      const rockInstance = mesh.createInstance(`rock_inst_${instance.variationId}_${Math.random()}`);
      rockInstance.position.set(
        instance.worldX + offsetX * cosR + offsetZ * sinR,
        instance.worldY + offsetY,
        instance.worldZ - offsetX * sinR + offsetZ * cosR
      );
      rockInstance.rotation.y = instance.rotationY;
      rockInstance.scaling.setAll(scale);
      this.instanceRoots.push(rockInstance);
      
      // Register shadows with self-shadowing (same pattern as trees)
      if (this.hasShadows) {
        const sm = ShadowManager.getInstance();
        if (sm) sm.addShadowCaster(rockInstance, true);
      }
    }

    console.log(`Spawned ${instances.length} rock instances`);
  }

  /**
   * Create the shared gray rock material (no texture).
   */
  private createRockMaterial(): StandardMaterial {
    const mat = new StandardMaterial('rockMat', this.scene);
    mat.diffuseColor = new Color3(0.4, 0.4, 0.45);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.ambientColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(0, 0, 0);
    return mat;
  }

  /**
   * Create a rock mesh from variation data.
   * Uses same corner-ordering approach as terrain LevelMesh for correct winding.
   */
  private createRockMesh(variation: RockVariation): Mesh {
    const quads = variation.quads;
    
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;
    
    for (const quad of quads) {
      const { x, y, z, axis, positive } = quad;
      // width/height are in voxel counts, must be scaled to world units
      const w = quad.width * ROCK_VOXEL_SIZE;
      const h = quad.height * ROCK_VOXEL_SIZE;
      
      let nx = 0, ny = 0, nz = 0;
      let corners: number[][];
      
      switch (axis) {
        case 'x':
          nx = positive ? 1 : -1;
          if (positive) {
            corners = [
              [x, y, z],
              [x, y, z + w],
              [x, y + h, z + w],
              [x, y + h, z],
            ];
          } else {
            corners = [
              [x, y, z + w],
              [x, y, z],
              [x, y + h, z],
              [x, y + h, z + w],
            ];
          }
          break;
        case 'y':
          ny = positive ? 1 : -1;
          if (positive) {
            corners = [
              [x, y, z],
              [x + w, y, z],
              [x + w, y, z + h],
              [x, y, z + h],
            ];
          } else {
            corners = [
              [x, y, z + h],
              [x + w, y, z + h],
              [x + w, y, z],
              [x, y, z],
            ];
          }
          break;
        case 'z':
        default:
          nz = positive ? 1 : -1;
          if (positive) {
            corners = [
              [x + w, y, z],
              [x, y, z],
              [x, y + h, z],
              [x + w, y + h, z],
            ];
          } else {
            corners = [
              [x, y, z],
              [x + w, y, z],
              [x + w, y + h, z],
              [x, y + h, z],
            ];
          }
          break;
      }
      
      // Add vertices
      for (const c of corners) {
        positions.push(c[0], c[1], c[2]);
        normals.push(nx, ny, nz);
      }
      
      // Add UVs (use original voxel counts for texture mapping)
      uvs.push(0, 0, quad.width, 0, quad.width, quad.height, 0, quad.height);
      
      // Same winding for all quads - direction handled by corner ordering above
      indices.push(
        vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
        vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
      );
      vertexOffset += 4;
    }
    
    // Create mesh
    const mesh = new Mesh(`rock_base_${variation.id}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);
    
    mesh.material = this.rockMaterial;
    mesh.receiveShadows = true;
    
    // Apply flat shading for sharp facets
    mesh.convertToFlatShadedMesh();
    
    return mesh;
  }

  /** Get collision meshes for client-side physics prediction (matches server format). */
  getColliderMeshes(): Array<{ mesh: RockColliderMesh; transform: RockTransform }> {
    return this.colliderMeshes;
  }

  dispose(): void {
    this.variationMeshes.forEach(m => m.dispose());
    this.instanceRoots.forEach(n => n.dispose());
    this.rockMaterial.dispose();
    this.colliderMeshes = [];
  }
}
