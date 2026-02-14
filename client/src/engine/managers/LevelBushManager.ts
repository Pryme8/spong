/**
 * Level bush manager - handles bush mesh generation and instancing for levels.
 */

import { Scene, Mesh, AbstractMesh, StandardMaterial, Color3, VertexData, TransformNode, MeshBuilder } from '@babylonjs/core';
import { generateBushVariations, BUSH_GRID_W, BUSH_GRID_H, BUSH_GRID_D, BUSH_VOXEL_SIZE, type BushVariation, type BushInstance } from '@spong/shared';
import { ShadowManager } from '../systems/ShadowManager';

/** Bush collider data: pre-transformed local-space AABB + world position */
export interface BushColliderData {
  /** Local-space axis-aligned bounding box (before world transform) */
  localMinX: number;
  localMinY: number;
  localMinZ: number;
  localMaxX: number;
  localMaxY: number;
  localMaxZ: number;
  /** World position (bushes have no rotation) */
  posX: number;
  posY: number;
  posZ: number;
  /** Index into the bush instances array */
  bushIndex: number;
}

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
  
  /** Pre-computed local-space AABBs for each bush variation */
  private bushLocalBounds: Array<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = [];
  
  /** Bush collider data for all instances (for octree + point-in-local-AABB checks) */
  private bushColliders: BushColliderData[] = [];
  
  /** Babylon meshes used only for debug visualization */
  private bushDebugMeshes: Mesh[] = [];

  // Bush mesh transform constants
  private static readonly BUSH_SCALE = 0.25;
  private static readonly HALF_W = BUSH_GRID_W * BUSH_VOXEL_SIZE * 0.5;
  private static readonly HALF_D = BUSH_GRID_D * BUSH_VOXEL_SIZE * 0.5;

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
      bushMesh.position.y = -1000000; // Keep out of raycast range
      this.variationMeshes.push(bushMesh);
      
      // Pre-compute the local-space AABB for this variation's collider
      const localBounds = this.computeBushLocalBounds(variation.colliderMesh);
      this.bushLocalBounds.push(localBounds);
    }
  }

  /**
   * Compute the local-space AABB of a bush collider mesh after centering/scaling.
   */
  private computeBushLocalBounds(colliderMesh: any): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
    const { BUSH_SCALE, HALF_W, HALF_D } = LevelBushManager;
    const raw = colliderMesh.vertices;
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < raw.length; i += 3) {
      const lx = (raw[i] - HALF_W) * BUSH_SCALE;
      const ly = raw[i + 1] * BUSH_SCALE;
      const lz = (raw[i + 2] - HALF_D) * BUSH_SCALE;
      
      if (lx < minX) minX = lx;
      if (ly < minY) minY = ly;
      if (lz < minZ) minZ = lz;
      if (lx > maxX) maxX = lx;
      if (ly > maxY) maxY = ly;
      if (lz > maxZ) maxZ = lz;
    }
    
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  /**
   * Spawn bush instances from server data.
   * Returns created meshes so caller can register them with the water mirror list.
   */
  spawnBushInstances(instances: BushInstance[]): AbstractMesh[] {
    const created: AbstractMesh[] = [];
    this.bushColliders = [];
    
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const baseMesh = this.variationMeshes[instance.variationId];
      
      if (!baseMesh) {
        continue;
      }

      // Create instance
      const bushInstance = baseMesh.createInstance(`bush_inst_${instance.variationId}_${i}`);
      bushInstance.position.set(instance.worldX, instance.worldY, instance.worldZ);
      this.instanceRoots.push(bushInstance as any);
      created.push(bushInstance);
      
      // Register shadows
      if (this.hasShadows) {
        const sm = ShadowManager.getInstance();
        if (sm) sm.addShadowCaster(bushInstance, false);
      }
    }
    return created;
  }

  /**
   * Create a bush mesh from variation data.
   */
  private createBushMesh(variation: BushVariation): Mesh {
    const quads = variation.quads;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const BUSH_SCALE = 0.25;
    
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
    mat.backFaceCulling = false;
    return mat;
  }

  /** Get bush collider data for octree insertion and point-in-volume tests. */
  getBushColliders(): BushColliderData[] {
    return this.bushColliders;
  }

  /**
   * Check if a world-space point is inside a specific bush collider.
   * Bushes have no rotation, so this is a simple AABB offset check.
   */
  static PointInBushCollider(px: number, py: number, pz: number, collider: BushColliderData): boolean {
    // Translate point relative to collider world position
    const localX = px - collider.posX;
    const localY = py - collider.posY;
    const localZ = pz - collider.posZ;
    
    // Test against local AABB
    return localX >= collider.localMinX && localX <= collider.localMaxX &&
           localY >= collider.localMinY && localY <= collider.localMaxY &&
           localZ >= collider.localMinZ && localZ <= collider.localMaxZ;
  }

  /**
   * Check if camera position is inside any bush volume.
   * Uses bush collider data with local-space AABB test.
   * Returns the bush index if inside, -1 if outside all bushes.
   */
  checkCameraInBushes(cameraX: number, cameraY: number, cameraZ: number): number {
    const maxCheckDistanceSq = 15 * 15;

    for (const collider of this.bushColliders) {
      // Fast distance check first
      const dx = cameraX - collider.posX;
      const dy = cameraY - collider.posY;
      const dz = cameraZ - collider.posZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq > maxCheckDistanceSq) {
        continue;
      }

      if (LevelBushManager.PointInBushCollider(cameraX, cameraY, cameraZ, collider)) {
        return collider.bushIndex;
      }
    }

    return -1;
  }

  /**
   * Toggle bush collision mesh debug visualization.
   * Creates box meshes showing the local AABBs positioned in world space.
   */
  toggleBushCollisionDebug(visible: boolean): void {
    if (visible && this.bushDebugMeshes.length === 0) {
      for (let i = 0; i < this.bushColliders.length; i++) {
        const collider = this.bushColliders[i];
        
        const mesh = MeshBuilder.CreateBox(`bush_debug_${i}`, {
          width: collider.localMaxX - collider.localMinX,
          height: collider.localMaxY - collider.localMinY,
          depth: collider.localMaxZ - collider.localMinZ
        }, this.scene);
        
        // Position box center (local center offset + world position)
        const localCenterX = (collider.localMinX + collider.localMaxX) * 0.5;
        const localCenterY = (collider.localMinY + collider.localMaxY) * 0.5;
        const localCenterZ = (collider.localMinZ + collider.localMaxZ) * 0.5;
        
        mesh.position.set(
          collider.posX + localCenterX,
          collider.posY + localCenterY,
          collider.posZ + localCenterZ
        );
        
        const mat = new StandardMaterial(`bush_debug_mat_${i}`, this.scene);
        mat.wireframe = true;
        mat.emissiveColor = new Color3(0, 1, 1); // Cyan
        mesh.material = mat;
        
        this.bushDebugMeshes.push(mesh);
      }
    } else if (!visible) {
      for (const mesh of this.bushDebugMeshes) {
        mesh.dispose();
      }
      this.bushDebugMeshes = [];
    }
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
    for (const mesh of this.bushDebugMeshes) {
      mesh.dispose();
    }
    this.bushMaterial?.dispose();
    this.instanceRoots = [];
    this.variationMeshes = [];
    this.variations = [];
    this.bushLocalBounds = [];
    this.bushColliders = [];
    this.bushDebugMeshes = [];
  }
}
