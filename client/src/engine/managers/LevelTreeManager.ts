/**
 * Level tree manager - handles tree mesh generation and instancing for levels.
 */

import { Scene, Mesh, StandardMaterial, Color3, VertexData, TransformNode, MeshBuilder } from '@babylonjs/core';
import { generateTreeVariations, type TreeVariation, type TreeInstance, type TreeQuad } from '@spong/shared';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';
import { ShadowManager } from '../systems/ShadowManager';

/** Leaf collider data: pre-transformed local-space AABB + world transform */
export interface LeafColliderData {
  /** Local-space axis-aligned bounding box (before world transform) */
  localMinX: number;
  localMinY: number;
  localMinZ: number;
  localMaxX: number;
  localMaxY: number;
  localMaxZ: number;
  /** World transform */
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  /** Precomputed sin/cos for inverse rotation */
  sinRotY: number;
  cosRotY: number;
  /** Index into the tree instances array */
  treeIndex: number;
}

/**
 * Manages tree mesh variations and instances for a level.
 * Generates tree meshes once and instances them throughout the level.
 */
export class LevelTreeManager {
  readonly hasShadows = true;
  
  private scene: Scene;
  private levelSeed: string;
  private variations: TreeVariation[] = [];
  private variationWoodMeshes: Mesh[] = [];
  private variationLeafMeshes: Mesh[] = [];
  private instanceRoots: TransformNode[] = [];
  private woodMaterial!: StandardMaterial;
  private leafMaterial!: StandardMaterial;

  /** Collision meshes + transforms matching the server's format for physics prediction */
  private colliderMeshes: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> = [];
  
  /** Leaf collider meshes for trigger detection (one per variation) */
  private leafColliderMeshes: TreeColliderMesh[] = [];
  
  /** Pre-computed local-space AABBs for each leaf variation */
  private leafLocalBounds: Array<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = [];
  
  /** Leaf collider data for all tree instances (for octree + point-in-local-AABB checks) */
  private leafColliders: LeafColliderData[] = [];
  
  /** Babylon meshes used only for debug visualization */
  private leafDebugMeshes: Mesh[] = [];
  
  /** Debug visualization meshes for wood collision (optional) */
  private woodCollisionDebugMeshes: Mesh[] = [];

  // Tree mesh transform constants
  private static readonly GRID_SIZE = 50;
  private static readonly VOXEL_SIZE = 0.5;
  private static readonly TREE_SCALE = 0.4;
  private static readonly HALF_GRID = LevelTreeManager.GRID_SIZE * LevelTreeManager.VOXEL_SIZE * 0.5;
  private static readonly Y_OFFSET = 2 * LevelTreeManager.VOXEL_SIZE;

  constructor(scene: Scene, levelSeed: string) {
    this.scene = scene;
    this.levelSeed = levelSeed;
    
    // Create shared materials once
    this.woodMaterial = this.createWoodMaterial();
    this.leafMaterial = this.createLeafMaterial();
  }

  /**
   * Initialize tree variations and create base meshes.
   * Call this once during level load.
   * Generates meshes progressively to avoid blocking the main thread.
   */
  async initialize(): Promise<void> {
    // Generate tree variations
    this.variations = generateTreeVariations(this.levelSeed);

    // Create base wood and leaf meshes for each variation
    // Process one tree per frame to avoid blocking
    for (let i = 0; i < this.variations.length; i++) {
      const variation = this.variations[i];
      
      // Yield to browser between trees
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const { woodMesh, leafMesh } = this.createTreeMeshes(variation);
      
      woodMesh.name = `tree_wood_${variation.id}`;
      woodMesh.setEnabled(false); // Base mesh is hidden, only instances are visible
      woodMesh.position.y = -1000000; // Keep out of raycast range
      this.variationWoodMeshes.push(woodMesh);

      if (leafMesh) {
        leafMesh.name = `tree_leaf_${variation.id}`;
        leafMesh.setEnabled(false);
        leafMesh.position.y = -1000000;
        this.variationLeafMeshes.push(leafMesh);
      } else {
        this.variationLeafMeshes.push(null as any); // Placeholder for trees with no leaves
      }
      
      // Leaf collider generation disabled for now
      // const leafMeshBuilder = new TreeLeafMeshBuilder();
      // const fullLeafMesh = leafMeshBuilder.buildFromQuads(variation.quads);
      // const leafDecimator = new TreeMeshDecimator();
      // const leafColliderMesh = leafDecimator.decimate(fullLeafMesh, 12);
      // this.leafColliderMeshes.push(leafColliderMesh);
      // const localBounds = this.computeLeafLocalBounds(leafColliderMesh);
      // this.leafLocalBounds.push(localBounds);
    }
  }

  /**
   * Compute the local-space AABB of a leaf collider mesh after centering/scaling.
   * This is the AABB in the mesh's own coordinate space (before world position/rotation).
   */
  private computeLeafLocalBounds(leafColliderMesh: TreeColliderMesh): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
    const { HALF_GRID, TREE_SCALE, Y_OFFSET } = LevelTreeManager;
    const raw = leafColliderMesh.vertices;
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < raw.length; i += 3) {
      const lx = (raw[i] - HALF_GRID) * TREE_SCALE;
      const ly = (raw[i + 1] - Y_OFFSET) * TREE_SCALE;
      const lz = (raw[i + 2] - HALF_GRID) * TREE_SCALE;
      
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
   * Create mesh instances from tree placement data.
   * Call this when TreeSpawn message is received from server.
   */
  spawnTreeInstances(instances: TreeInstance[]): void {
    // Build collision data matching server (Room.ts spawnLevelTrees)
    const TREE_SCALE = 0.4;
    this.colliderMeshes = instances.map(instance => {
      const variation = this.variations[instance.variationId];
      return {
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY + 0.4, // Offset up to match rendering
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: TREE_SCALE
        }
      };
    });
    
    // Build leaf collider data for each instance
    this.leafColliders = [];
    
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const woodMesh = this.variationWoodMeshes[instance.variationId];
      const leafMesh = this.variationLeafMeshes[instance.variationId];
      
      if (!woodMesh) {
        continue;
      }

      // Create wood instance
      const woodInstance = woodMesh.createInstance(`tree_wood_inst_${instance.variationId}_${Math.random()}`);
      woodInstance.position.set(instance.worldX, instance.worldY + 0.4, instance.worldZ);
      woodInstance.rotation.y = instance.rotationY;
      this.instanceRoots.push(woodInstance as any);
      
      // Register shadows with self-shadowing if enabled
      if (this.hasShadows) {
        const sm = ShadowManager.getInstance();
        if (sm) sm.addShadowCaster(woodInstance, true);
      }

      // Create leaf instance if available
      if (leafMesh) {
        const leafInstance = leafMesh.createInstance(`tree_leaf_inst_${instance.variationId}_${Math.random()}`);
        leafInstance.position.set(instance.worldX, instance.worldY + 0.4, instance.worldZ);
        leafInstance.rotation.y = instance.rotationY;
        this.instanceRoots.push(leafInstance as any);
        
        // Register shadows with self-shadowing if enabled
        if (this.hasShadows) {
          const sm = ShadowManager.getInstance();
          if (sm) sm.addShadowCaster(leafInstance, true);
        }
        
        // Leaf collider data disabled for now
        // const localBounds = this.leafLocalBounds[instance.variationId];
        // if (localBounds) {
        //   this.leafColliders.push({ ... });
        // }
      }
    }
  }

  /**
   * Create wood and leaf meshes from variation data.
   * Returns separate meshes for instancing.
   */
  private createTreeMeshes(variation: TreeVariation): { woodMesh: Mesh; leafMesh: Mesh | null } {
    const { quads } = variation;
    
    // Separate wood and leaf quads
    const woodQuads = quads.filter(q => q.material === 1); // MATERIAL_WOOD
    const leafQuads = quads.filter(q => q.material === 2); // MATERIAL_LEAF

    // Create wood mesh
    const woodMesh = this.createMeshFromQuads(woodQuads, `wood_${variation.id}`);
    woodMesh.material = this.woodMaterial;
    woodMesh.receiveShadows = true;

    // Create leaf mesh if there are leaves
    let leafMesh: Mesh | null = null;
    if (leafQuads.length > 0) {
      leafMesh = this.createMeshFromQuads(leafQuads, `leaves_${variation.id}`);
      leafMesh.material = this.leafMaterial;
      leafMesh.receiveShadows = true;
    }

    return { woodMesh, leafMesh };
  }

  /**
   * Create Babylon mesh from TreeQuads.
   * Scaled to match tree generator's output (0.2x scale, centered).
   */
  private createMeshFromQuads(quads: TreeQuad[], name: string): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const GRID_SIZE = 50; // Tree grid size
    const VOXEL_SIZE = 0.5;
    const SCALE = 0.4; // Trees scaled 0.4x (doubled from 0.2)

    // Center offset (grid is centered at origin)
    const halfGrid = GRID_SIZE * VOXEL_SIZE * 0.5;
    // Turtle starts at Y=2 in voxel space, offset down so base is at Y=0
    const yOffset = 2 * VOXEL_SIZE;

    for (const quad of quads) {
      const baseIndex = positions.length / 3;

      // Generate 4 corners based on axis-aligned quad
      const { corners, normal } = this.getQuadGeometry(quad, VOXEL_SIZE);

      // Scale and center each corner
      for (const corner of corners) {
        positions.push(
          (corner.x - halfGrid) * SCALE,
          (corner.y - yOffset) * SCALE,
          (corner.z - halfGrid) * SCALE
        );
        normals.push(normal.x, normal.y, normal.z);
      }

      // Add indices (two triangles: 0-1-2, 0-2-3)
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex,
        baseIndex + 2,
        baseIndex + 3
      );
    }

    // Create mesh
    const mesh = new Mesh(name, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    // Flat shade so each face gets its own normals for proper lighting
    mesh.convertToFlatShadedMesh();

    return mesh;
  }

  /**
   * Get quad corner positions and normal vector based on axis and direction.
   */
  private getQuadGeometry(quad: TreeQuad, voxelSize: number): {
    corners: Array<{ x: number; y: number; z: number }>;
    normal: { x: number; y: number; z: number };
  } {
    const { x, y, z, width, height, axis, positive } = quad;

    let corners: Array<{ x: number; y: number; z: number }>;
    let normal: { x: number; y: number; z: number };

    switch (axis) {
      case 'x':
        // YZ plane, normal along X axis
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
        // XZ plane, normal along Y axis
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
        // XY plane, normal along Z axis
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

  /** Create dark brown wood material with minimal emissive for shadows. */
  private createWoodMaterial(): StandardMaterial {
    const mat = new StandardMaterial('treewood', this.scene);
    mat.diffuseColor = new Color3(0.25, 0.18, 0.1); // Darker brown to match terrain
    mat.emissiveColor = new Color3(0, 0, 0); // No glow
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    return mat;
  }

  /** Create forest green leaf material with minimal emissive for shadows. */
  private createLeafMaterial(): StandardMaterial {
    const mat = new StandardMaterial('treeleaves', this.scene);
    mat.diffuseColor = new Color3(0.15, 0.35, 0.12); // Darker forest green
    mat.emissiveColor = new Color3(0, 0, 0); // No glow
    mat.specularColor = new Color3(0.03, 0.03, 0.03);
    mat.backFaceCulling = false;
    return mat;
  }

  /** Get collision meshes for client-side physics prediction (matches server format). */
  getColliderMeshes(): Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> {
    return this.colliderMeshes;
  }

  /** Get leaf collider data for octree insertion and point-in-volume tests. */
  getLeafColliders(): LeafColliderData[] {
    return this.leafColliders;
  }

  /**
   * Check if a world-space point is inside a specific leaf collider.
   * Transforms the point into the collider's local space and tests against the local AABB.
   * This correctly handles rotation.
   */
  static PointInLeafCollider(px: number, py: number, pz: number, collider: LeafColliderData): boolean {
    // Translate point relative to collider world position
    const relX = px - collider.posX;
    const relY = py - collider.posY;
    const relZ = pz - collider.posZ;
    
    // Inverse-rotate by -rotY to get into collider local space
    // Uses same formula as inverseTransformPoint in TreeMeshTransform.ts:
    //   cos(-rotY) = cosRotY,  sin(-rotY) = -sinRotY
    //   localX = cosRotY * relX - (-sinRotY) * relZ = cosRotY * relX + sinRotY * relZ
    //   localZ = (-sinRotY) * relX + cosRotY * relZ  = -sinRotY * relX + cosRotY * relZ
    const localX =  collider.cosRotY * relX + collider.sinRotY * relZ;
    const localY =  relY; // No Y rotation
    const localZ = -collider.sinRotY * relX + collider.cosRotY * relZ;
    
    // Test against local AABB
    return localX >= collider.localMinX && localX <= collider.localMaxX &&
           localY >= collider.localMinY && localY <= collider.localMaxY &&
           localZ >= collider.localMinZ && localZ <= collider.localMaxZ;
  }

  /**
   * Check if camera position is inside any tree's leaf volume.
   * Uses the leaf collider data with proper inverse-rotation for accurate detection.
   * Returns the tree index if inside, -1 if outside all trees.
   */
  checkCameraInLeaves(cameraX: number, cameraY: number, cameraZ: number): number {
    const maxCheckDistanceSq = 20 * 20;

    for (const collider of this.leafColliders) {
      // Fast distance check first
      const dx = cameraX - collider.posX;
      const dy = cameraY - collider.posY;
      const dz = cameraZ - collider.posZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq > maxCheckDistanceSq) {
        continue;
      }

      if (LevelTreeManager.PointInLeafCollider(cameraX, cameraY, cameraZ, collider)) {
        return collider.treeIndex;
      }
    }

    return -1;
  }

  /**
   * Toggle leaf collision mesh debug visualization.
   * Creates Babylon meshes on demand to show the leaf trigger volumes.
   */
  toggleLeafCollisionDebug(visible: boolean): void {
    if (visible && this.leafDebugMeshes.length === 0) {
      // Build a debug mesh for each leaf collider instance
      for (let i = 0; i < this.leafColliders.length; i++) {
        const collider = this.leafColliders[i];
        
        // Find which variation this tree uses (search instances for the treeIndex)
        // We need the actual triangle mesh for visualization - use the collider AABB as a box
        const mesh = MeshBuilder.CreateBox(`leaf_debug_${i}`, {
          width: collider.localMaxX - collider.localMinX,
          height: collider.localMaxY - collider.localMinY,
          depth: collider.localMaxZ - collider.localMinZ
        }, this.scene);
        
        // Position the box center in local space, then apply world transform
        const localCenterX = (collider.localMinX + collider.localMaxX) * 0.5;
        const localCenterY = (collider.localMinY + collider.localMaxY) * 0.5;
        const localCenterZ = (collider.localMinZ + collider.localMaxZ) * 0.5;
        
        // Forward-rotate local center to world space (opposite of inverse transform)
        // Forward rotation: x' = cos(θ)*x - sin(θ)*z, z' = sin(θ)*x + cos(θ)*z
        const worldCenterX = collider.cosRotY * localCenterX - collider.sinRotY * localCenterZ;
        const worldCenterZ = collider.sinRotY * localCenterX + collider.cosRotY * localCenterZ;
        
        mesh.position.set(
          collider.posX + worldCenterX,
          collider.posY + localCenterY,
          collider.posZ + worldCenterZ
        );
        mesh.rotation.y = collider.rotY;
        
        const mat = new StandardMaterial(`leaf_debug_mat_${i}`, this.scene);
        mat.wireframe = true;
        mat.emissiveColor = new Color3(0, 1, 0);
        mesh.material = mat;
        
        this.leafDebugMeshes.push(mesh);
      }
    } else if (!visible) {
      for (const mesh of this.leafDebugMeshes) {
        mesh.dispose();
      }
      this.leafDebugMeshes = [];
    }
  }

  /**
   * Toggle wood collision mesh debug visualization.
   * Shows the actual collision meshes that block player movement (trunk).
   * Call from console: window.toggleWoodDebug()
   */
  toggleWoodCollisionDebug(visible: boolean): void {
    if (visible && this.woodCollisionDebugMeshes.length === 0) {
      // Same centering constants as visual tree mesh and leaf triggers
      const GRID_SIZE = 50;
      const VOXEL_SIZE = 0.5;
      const TREE_SCALE = 0.4;
      const halfGrid = GRID_SIZE * VOXEL_SIZE * 0.5;
      const yOffset = 2 * VOXEL_SIZE;

      for (let i = 0; i < this.colliderMeshes.length; i++) {
        const colliderData = this.colliderMeshes[i];
        const rawVertices = colliderData.mesh.vertices;

        // Transform vertices from voxel grid space to local centered space
        // (same transform as createLeafTriggerMesh and visual tree mesh)
        const transformedPositions: number[] = [];
        for (let v = 0; v < rawVertices.length; v += 3) {
          transformedPositions.push(
            (rawVertices[v] - halfGrid) * TREE_SCALE,
            (rawVertices[v + 1] - yOffset) * TREE_SCALE,
            (rawVertices[v + 2] - halfGrid) * TREE_SCALE
          );
        }

        const mesh = new Mesh(`tree_wood_collision_debug_${i}`, this.scene);
        const vd = new VertexData();
        vd.positions = transformedPositions;
        vd.indices = Array.from(colliderData.mesh.indices);
        vd.applyToMesh(mesh);

        // Position at world location (same as visual tree instances)
        mesh.position.set(
          colliderData.transform.posX,
          colliderData.transform.posY,
          colliderData.transform.posZ
        );
        mesh.rotation.y = colliderData.transform.rotY;

        // Red wireframe
        const mat = new StandardMaterial(`wood_collision_debug_mat_${i}`, this.scene);
        mat.wireframe = true;
        mat.emissiveColor = new Color3(1, 0, 0);
        mesh.material = mat;

        this.woodCollisionDebugMeshes.push(mesh);
      }
    } else if (!visible) {
      for (const mesh of this.woodCollisionDebugMeshes) {
        mesh.dispose();
      }
      this.woodCollisionDebugMeshes = [];
    }
  }

  /**
   * Clean up all tree meshes and instances.
   */
  dispose(): void {
    for (const instance of this.instanceRoots) {
      instance.dispose();
    }
    for (const mesh of this.variationWoodMeshes) {
      mesh.dispose();
    }
    for (const mesh of this.variationLeafMeshes) {
      if (mesh) mesh.dispose();
    }
    for (const mesh of this.leafDebugMeshes) {
      mesh.dispose();
    }
    for (const mesh of this.woodCollisionDebugMeshes) {
      mesh.dispose();
    }
    this.woodMaterial?.dispose();
    this.leafMaterial?.dispose();
    this.instanceRoots = [];
    this.variationWoodMeshes = [];
    this.variationLeafMeshes = [];
    this.variations = [];
    this.colliderMeshes = [];
    this.leafColliderMeshes = [];
    this.leafLocalBounds = [];
    this.leafColliders = [];
    this.leafDebugMeshes = [];
    this.woodCollisionDebugMeshes = [];
  }
}
