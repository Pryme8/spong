/**
 * Level tree manager - handles tree mesh generation and instancing for levels.
 */

import { Scene, Mesh, StandardMaterial, Color3, VertexData, TransformNode } from '@babylonjs/core';
import { generateTreeVariations, type TreeVariation, type TreeInstance, type TreeQuad, TreeLeafMeshBuilder, TreeMeshDecimator } from '@spong/shared';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';
import { ShadowManager } from '../systems/ShadowManager';

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
  
  /** Invisible trigger meshes for each tree instance */
  private leafTriggerMeshes: Array<{ mesh: Mesh; treeIndex: number }> = [];
  
  /** Debug visualization meshes for wood collision (optional) */
  private woodCollisionDebugMeshes: Mesh[] = [];

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
    console.log(`Initializing tree meshes for level ${this.levelSeed}...`);

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
      this.variationWoodMeshes.push(woodMesh);
      
      if (leafMesh) {
        leafMesh.name = `tree_leaf_${variation.id}`;
        leafMesh.setEnabled(false);
        this.variationLeafMeshes.push(leafMesh);
      } else {
        this.variationLeafMeshes.push(null as any); // Placeholder for trees with no leaves
      }
      
      // Build leaf collider mesh for trigger detection
      const leafMeshBuilder = new TreeLeafMeshBuilder();
      const fullLeafMesh = leafMeshBuilder.buildFromQuads(variation.quads);
      const leafDecimator = new TreeMeshDecimator();
      const leafColliderMesh = leafDecimator.decimate(fullLeafMesh, 12);
      this.leafColliderMeshes.push(leafColliderMesh);
    }

    console.log(`Created ${this.variationWoodMeshes.length} tree variation meshes with leaf colliders`);
  }

  /**
   * Create mesh instances from tree placement data.
   * Call this when TreeSpawn message is received from server.
   */
  spawnTreeInstances(instances: TreeInstance[]): void {
    console.log(`Spawning ${instances.length} tree instances...`);

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
    console.log(`Built ${this.colliderMeshes.length} tree collider meshes for client prediction`);

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const woodMesh = this.variationWoodMeshes[instance.variationId];
      const leafMesh = this.variationLeafMeshes[instance.variationId];
      
      if (!woodMesh) {
        console.warn(`Missing wood mesh for variation ${instance.variationId}`);
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
        
        // Create invisible trigger mesh for leaf detection
        const leafColliderMesh = this.leafColliderMeshes[instance.variationId];
        if (leafColliderMesh) {
          const triggerMesh = this.createLeafTriggerMesh(leafColliderMesh, instance, i);
          this.leafTriggerMeshes.push({ mesh: triggerMesh, treeIndex: i });
        }
      }
    }

    console.log(`Spawned ${instances.length} tree instances (${this.instanceRoots.length} total mesh instances, ${this.leafTriggerMeshes.length} leaf triggers)`);
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
    return mat;
  }

  /** Get collision meshes for client-side physics prediction (matches server format). */
  getColliderMeshes(): Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> {
    return this.colliderMeshes;
  }

  /**
   * Create an invisible trigger mesh for leaf detection.
   * Transforms vertices the same way as visible tree mesh.
   */
  private createLeafTriggerMesh(leafColliderMesh: TreeColliderMesh, instance: TreeInstance, treeIndex: number): Mesh {
    const mesh = new Mesh(`tree_leaf_trigger_${treeIndex}`, this.scene);
    const vd = new VertexData();
    
    // Collider vertices are in raw world space (TREE_VOXEL_SIZE units)
    // Apply same centering and scaling as visible tree mesh
    const GRID_SIZE = 50;
    const VOXEL_SIZE = 0.5;
    const TREE_SCALE = 0.4;
    const halfGrid = GRID_SIZE * VOXEL_SIZE * 0.5;
    const yOffset = 2 * VOXEL_SIZE;
    
    const rawVertices = leafColliderMesh.vertices;
    const transformedPositions: number[] = [];
    
    for (let i = 0; i < rawVertices.length; i += 3) {
      transformedPositions.push(
        (rawVertices[i] - halfGrid) * TREE_SCALE,
        (rawVertices[i + 1] - yOffset) * TREE_SCALE,
        (rawVertices[i + 2] - halfGrid) * TREE_SCALE
      );
    }
    
    vd.positions = transformedPositions;
    vd.indices = Array.from(leafColliderMesh.indices);
    
    vd.applyToMesh(mesh);

    // Position at world location with proper offset
    mesh.position.set(instance.worldX, instance.worldY + 0.4, instance.worldZ);
    mesh.rotation.y = instance.rotationY;

    mesh.isVisible = false;
    mesh.isPickable = true;

    return mesh;
  }

  /**
   * Toggle leaf collision mesh debug visualization.
   * Shows/hides wireframes of the leaf trigger volumes.
   * Call this from browser console: window.toggleLeafDebug()
   */
  toggleLeafCollisionDebug(visible: boolean): void {
    for (const { mesh } of this.leafTriggerMeshes) {
      mesh.isVisible = visible;
      
      if (visible) {
        // Show as green wireframe
        const mat = new StandardMaterial(`leaf_debug_${mesh.name}`, this.scene);
        mat.wireframe = true;
        mat.emissiveColor = new Color3(0, 1, 0); // Bright green
        mesh.material = mat;
      } else {
        mesh.material = null;
      }
    }
    
    console.log(`[LevelTreeManager] Leaf collision debug: ${visible ? 'ENABLED' : 'DISABLED'} - ${this.leafTriggerMeshes.length} trigger meshes`);
  }

  /**
   * Toggle wood collision mesh debug visualization.
   * Shows the actual collision meshes that block player movement (trunk).
   * Call from console: window.toggleWoodDebug()
   */
  toggleWoodCollisionDebug(visible: boolean): void {
    if (visible && this.woodCollisionDebugMeshes.length === 0) {
      // Create debug meshes from collision data
      for (let i = 0; i < this.colliderMeshes.length; i++) {
        const colliderData = this.colliderMeshes[i];
        const mesh = new Mesh(`tree_wood_collision_debug_${i}`, this.scene);
        const vd = new VertexData();
        
        vd.positions = Array.from(colliderData.mesh.vertices);
        vd.indices = Array.from(colliderData.mesh.indices);
        vd.applyToMesh(mesh);
        
        // Apply same transform as collision
        mesh.position.set(colliderData.transform.posX, colliderData.transform.posY, colliderData.transform.posZ);
        mesh.rotation.y = colliderData.transform.rotY;
        mesh.scaling.setAll(colliderData.transform.scale);
        
        // Red wireframe
        const mat = new StandardMaterial(`wood_collision_debug_mat_${i}`, this.scene);
        mat.wireframe = true;
        mat.emissiveColor = new Color3(1, 0, 0); // Bright red
        mesh.material = mat;
        
        this.woodCollisionDebugMeshes.push(mesh);
      }
      console.log(`[LevelTreeManager] Wood collision debug: ENABLED - Created ${this.woodCollisionDebugMeshes.length} debug meshes`);
    } else if (!visible) {
      // Dispose debug meshes
      for (const mesh of this.woodCollisionDebugMeshes) {
        mesh.dispose();
      }
      this.woodCollisionDebugMeshes = [];
      console.log(`[LevelTreeManager] Wood collision debug: DISABLED`);
    }
  }

  /**
   * Check if camera position is inside any tree's leaf trigger volume.
   * Returns the tree index if inside, -1 if outside all trees.
   * Optimized with early distance check before AABB test.
   */
  checkCameraInLeaves(cameraX: number, cameraY: number, cameraZ: number): number {
    const triggerMargin = -0.1;
    const maxCheckDistance = 20; // Only check trees within 20 units
    const maxCheckDistanceSq = maxCheckDistance * maxCheckDistance;

    for (const { mesh, treeIndex } of this.leafTriggerMeshes) {
      const meshPos = mesh.position;
      
      // Fast distance check first (approximate sphere check)
      const dx = cameraX - meshPos.x;
      const dy = cameraY - meshPos.y;
      const dz = cameraZ - meshPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq > maxCheckDistanceSq) {
        continue; // Skip this tree, it's too far away
      }

      // Only do AABB check for nearby trees
      const triggerBounds = mesh.getBoundingInfo().boundingBox;
      const worldMin = triggerBounds.minimumWorld;
      const worldMax = triggerBounds.maximumWorld;

      const inLeaves = 
        cameraX >= (worldMin.x - triggerMargin) && cameraX <= (worldMax.x + triggerMargin) &&
        cameraY >= (worldMin.y - triggerMargin) && cameraY <= (worldMax.y + triggerMargin) &&
        cameraZ >= (worldMin.z - triggerMargin) && cameraZ <= (worldMax.z + triggerMargin);

      if (inLeaves) {
        return treeIndex;
      }
    }

    return -1;
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
    for (const { mesh } of this.leafTriggerMeshes) {
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
    this.leafTriggerMeshes = [];
  }
}
