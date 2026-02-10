/**
 * Level bush manager - handles bush mesh generation and instancing for levels.
 */

import { Scene, Mesh, StandardMaterial, Color3, VertexData, TransformNode } from '@babylonjs/core';
import { generateBushVariations, BUSH_GRID_W, BUSH_GRID_H, BUSH_GRID_D, BUSH_VOXEL_SIZE, type BushVariation, type BushInstance } from '@spong/shared';
import { ShadowManager } from './ShadowManager';

/**
 * Manages bush mesh variations and instances for a level.
 */
export class LevelBushManager {
  readonly hasShadows = true;
  
  private scene: Scene;
  private levelSeed: string;
  private variations: BushVariation[] = [];
  private variationMeshes: Mesh[] = [];
  private instanceRoots: TransformNode[] = [];
  private bushMaterial!: StandardMaterial;
  private bushTriggerMeshes: Array<{ mesh: Mesh; bushIndex: number }> = [];

  constructor(scene: Scene, levelSeed: string) {
    this.scene = scene;
    this.levelSeed = levelSeed;
    
    this.bushMaterial = this.createBushMaterial();
  }

  /**
   * Initialize bush variations and create base meshes.
   * Call this once during level load.
   */
  async initialize(): Promise<void> {
    console.log(`[BushManager] Initializing bush meshes for level ${this.levelSeed}...`);

    // Generate bush variations (8 variations)
    this.variations = generateBushVariations(this.levelSeed, 8, 18);

    // Create base meshes for each variation
    for (let i = 0; i < this.variations.length; i++) {
      const variation = this.variations[i];
      
      // Yield to browser between bushes
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const bushMesh = this.createBushMesh(variation);
      bushMesh.name = `bush_${variation.id}`;
      bushMesh.material = this.bushMaterial;
      bushMesh.receiveShadows = true;
      bushMesh.setEnabled(false); // Base mesh is hidden, only instances are visible
      this.variationMeshes.push(bushMesh);
    }

    console.log(`[BushManager] Created ${this.variationMeshes.length} bush variation meshes`);
  }

  /**
   * Spawn bush instances from server data.
   */
  spawnBushInstances(instances: BushInstance[]): void {
    console.log(`[BushManager] Spawning ${instances.length} bush instances...`);

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const baseMesh = this.variationMeshes[instance.variationId];
      
      if (!baseMesh) {
        console.warn(`Missing bush mesh for variation ${instance.variationId}`);
        continue;
      }

      // Create instance
      const bushInstance = baseMesh.createInstance(`bush_inst_${instance.variationId}_${i}`);
      bushInstance.position.set(instance.worldX, instance.worldY, instance.worldZ);
      this.instanceRoots.push(bushInstance as any);
      
      // Debug first 3 bushes
      if (i < 3) {
        console.log(`[BushManager] Bush ${i}: pos=(${instance.worldX.toFixed(1)}, ${instance.worldY.toFixed(1)}, ${instance.worldZ.toFixed(1)}), variation=${instance.variationId}`);
        console.log(`[BushManager]   Base mesh bounds:`, baseMesh.getBoundingInfo().boundingBox);
      }
      
      // Register shadows
      if (this.hasShadows) {
        const sm = ShadowManager.getInstance();
        if (sm) sm.addShadowCaster(bushInstance, false);
      }
      
      // Create invisible trigger mesh for this bush instance
      const colliderMesh = this.variations[instance.variationId].colliderMesh;
      const triggerMesh = this.createBushTriggerMesh(colliderMesh, instance, i);
      this.bushTriggerMeshes.push({ mesh: triggerMesh, bushIndex: i });
    }

    console.log(`[BushManager] Spawned ${instances.length} bush instances with ${this.bushTriggerMeshes.length} triggers`);
  }

  /**
   * Create a bush mesh from variation data.
   */
  private createBushMesh(variation: BushVariation): Mesh {
    const quads = variation.quads;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const BUSH_SCALE = 0.5;
    
    // Center offset
    const halfW = BUSH_GRID_W * BUSH_VOXEL_SIZE * 0.5;
    const halfD = BUSH_GRID_D * BUSH_VOXEL_SIZE * 0.5;

    for (const quad of quads) {
      const baseIndex = positions.length / 3;
      const { corners, normal } = this.getQuadGeometry(quad, BUSH_VOXEL_SIZE);

      for (const corner of corners) {
        positions.push(
          (corner.x - halfW) * BUSH_SCALE,
          corner.y * BUSH_SCALE,
          (corner.z - halfD) * BUSH_SCALE
        );
        normals.push(normal.x, normal.y, normal.z);
      }

      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex,
        baseIndex + 2,
        baseIndex + 3
      );
    }

    const mesh = new Mesh(`bush_base_${variation.id}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    mesh.convertToFlatShadedMesh();
    
    // Debug first variation's bounds to verify mesh construction
    if (variation.id === 0 || this.variationMeshes.length === 0) {
      mesh.refreshBoundingInfo();
      const bounds = mesh.getBoundingInfo().boundingBox;
      console.log(`[BushManager] Variation ${variation.id} mesh bounds (local space): min=(${bounds.minimumWorld.x.toFixed(2)}, ${bounds.minimumWorld.y.toFixed(2)}, ${bounds.minimumWorld.z.toFixed(2)}), max=(${bounds.maximumWorld.x.toFixed(2)}, ${bounds.maximumWorld.y.toFixed(2)}, ${bounds.maximumWorld.z.toFixed(2)})`);
      console.log(`[BushManager]   Expected Y range: [0, ~2.0] for a properly grounded bush`);
    }

    return mesh;
  }

  /**
   * Create invisible trigger mesh for bush detection.
   * Must apply same transforms as visible bush mesh (centering + scaling).
   */
  private createBushTriggerMesh(colliderMesh: any, instance: BushInstance, bushIndex: number): Mesh {
    const mesh = new Mesh(`bush_trigger_${bushIndex}`, this.scene);
    const vd = new VertexData();
    
    // Collider vertices are in raw world units (BUSH_VOXEL_SIZE scale)
    // Need to center and scale them like the visible mesh
    const BUSH_SCALE = 0.5;
    const halfW = BUSH_GRID_W * BUSH_VOXEL_SIZE * 0.5;
    const halfD = BUSH_GRID_D * BUSH_VOXEL_SIZE * 0.5;
    
    const rawVertices = colliderMesh.vertices;
    const transformedPositions: number[] = [];
    
    for (let i = 0; i < rawVertices.length; i += 3) {
      transformedPositions.push(
        (rawVertices[i] - halfW) * BUSH_SCALE,
        rawVertices[i + 1] * BUSH_SCALE,
        (rawVertices[i + 2] - halfD) * BUSH_SCALE
      );
    }
    
    vd.positions = transformedPositions;
    vd.indices = Array.from(colliderMesh.indices);
    
    vd.applyToMesh(mesh);

    // Position at world location
    mesh.position.set(instance.worldX, instance.worldY, instance.worldZ);

    mesh.isVisible = false;
    mesh.isPickable = true;

    return mesh;
  }

  /**
   * Get quad corner positions and normal vector.
   */
  private getQuadGeometry(quad: any, voxelSize: number): {
    corners: Array<{ x: number; y: number; z: number }>;
    normal: { x: number; y: number; z: number };
  } {
    const { x, y, z, width, height, axis, positive } = quad;

    let corners: Array<{ x: number; y: number; z: number }>;
    let normal: { x: number; y: number; z: number };

    switch (axis) {
      case 'x':
        normal = { x: positive ? 1 : -1, y: 0, z: 0 };
        if (positive) {
          corners = [
            { x, y, z },
            { x, y, z: z + width * voxelSize },
            { x, y: y + height * voxelSize, z: z + width * voxelSize },
            { x, y: y + height * voxelSize, z },
          ];
        } else {
          corners = [
            { x, y, z: z + width * voxelSize },
            { x, y, z },
            { x, y: y + height * voxelSize, z },
            { x, y: y + height * voxelSize, z: z + width * voxelSize },
          ];
        }
        break;

      case 'y':
        normal = { x: 0, y: positive ? 1 : -1, z: 0 };
        if (positive) {
          corners = [
            { x, y, z },
            { x: x + width * voxelSize, y, z },
            { x: x + width * voxelSize, y, z: z + height * voxelSize },
            { x, y, z: z + height * voxelSize },
          ];
        } else {
          corners = [
            { x, y, z: z + height * voxelSize },
            { x: x + width * voxelSize, y, z: z + height * voxelSize },
            { x: x + width * voxelSize, y, z },
            { x, y, z },
          ];
        }
        break;

      case 'z':
        normal = { x: 0, y: 0, z: positive ? 1 : -1 };
        if (positive) {
          corners = [
            { x: x + width * voxelSize, y, z },
            { x, y, z },
            { x, y: y + height * voxelSize, z },
            { x: x + width * voxelSize, y: y + height * voxelSize, z },
          ];
        } else {
          corners = [
            { x, y, z },
            { x: x + width * voxelSize, y, z },
            { x: x + width * voxelSize, y: y + height * voxelSize, z },
            { x, y: y + height * voxelSize, z },
          ];
        }
        break;
    }

    return { corners, normal };
  }

  /** Create forest green bush material. */
  private createBushMaterial(): StandardMaterial {
    const mat = new StandardMaterial('bush', this.scene);
    mat.diffuseColor = new Color3(0.15, 0.35, 0.12);
    mat.emissiveColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0.03, 0.03, 0.03);
    return mat;
  }

  /**
   * Check if camera position is inside any bush trigger volume.
   * Returns the bush index if inside, -1 if outside all bushes.
   */
  checkCameraInBushes(cameraX: number, cameraY: number, cameraZ: number): number {
    const triggerMargin = 0.5;
    const maxCheckDistance = 15;
    const maxCheckDistanceSq = maxCheckDistance * maxCheckDistance;

    for (const { mesh, bushIndex } of this.bushTriggerMeshes) {
      const meshPos = mesh.position;
      
      const dx = cameraX - meshPos.x;
      const dy = cameraY - meshPos.y;
      const dz = cameraZ - meshPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq > maxCheckDistanceSq) {
        continue;
      }

      const triggerBounds = mesh.getBoundingInfo().boundingBox;
      const worldMin = triggerBounds.minimumWorld;
      const worldMax = triggerBounds.maximumWorld;

      const inBush = 
        cameraX >= (worldMin.x - triggerMargin) && cameraX <= (worldMax.x + triggerMargin) &&
        cameraY >= (worldMin.y - triggerMargin) && cameraY <= (worldMax.y + triggerMargin) &&
        cameraZ >= (worldMin.z - triggerMargin) && cameraZ <= (worldMax.z + triggerMargin);

      if (inBush) {
        return bushIndex;
      }
    }

    return -1;
  }

  /**
   * Clean up all bush meshes and triggers.
   */
  dispose(): void {
    for (const instance of this.instanceRoots) {
      instance.dispose();
    }
    for (const mesh of this.variationMeshes) {
      mesh.dispose();
    }
    for (const { mesh } of this.bushTriggerMeshes) {
      mesh.dispose();
    }
    this.bushMaterial?.dispose();
    this.instanceRoots = [];
    this.variationMeshes = [];
    this.variations = [];
    this.bushTriggerMeshes = [];
  }
}
