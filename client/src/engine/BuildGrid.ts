/**
 * Build Grid - Manages the building workspace with voxel grid, instances, and greedy meshing.
 * This is client-side only for proof of concept.
 */

import {
  Scene,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  Mesh,
  VertexData,
  InstancedMesh
} from '@babylonjs/core';
import { MeshPrimitives } from './MeshPrimitives';
import { createGridMaterial } from './GridMaterial';
import { BuildGridTransforms, Vector3Int } from './BuildGridTransforms';
import { VoxelGrid, GreedyMesher } from '@spong/shared';

export class BuildGrid {
  readonly WORLD_SIZE = 6;
  readonly GRID_SIZE = 12;
  readonly CELL_SIZE = 0.5; // 6/12

  private scene: Scene;
  private root: TransformNode;
  private boundaryCube: Mesh;
  private selectionCube: Mesh; // Transparent selection box for hover/select/demolish
  private selectionCubeMaterial: StandardMaterial;
  private gridPlane: Mesh;
  private gridRaycastPlane: Mesh; // Invisible plane for raycasting
  private instanceContainer: TransformNode;
  private transforms: BuildGridTransforms;
  private primitives: MeshPrimitives;

  // Voxel data: 0 = empty, 1-16 = color index
  private voxelData: Uint8Array;

  // Block instances during building phase
  private blockInstances = new Map<number, InstancedMesh>();

  // Preview block
  private previewBlock: Mesh | null = null;
  private previewMaterial: StandardMaterial | null = null;

  // Final mesh after greedy meshing
  private finalMesh: Mesh | null = null;
  private isFinalized = false;

  // Ownership and state
  private ownerEntityId: number;
  private isOwned: boolean = false;
  private gridState: 'white' | 'yellow' | 'red' = 'white';
  

  // Color palette (16 colors)
  private readonly COLOR_PALETTE: Color3[] = [
    new Color3(1, 1, 1),        // 0: White
    new Color3(0.5, 0.5, 0.5),  // 1: Gray
    new Color3(0.2, 0.2, 0.2),  // 2: Black
    new Color3(1, 0, 0),        // 3: Red
    new Color3(0, 1, 0),        // 4: Green
    new Color3(0, 0, 1),        // 5: Blue
    new Color3(1, 1, 0),        // 6: Yellow
    new Color3(1, 0, 1),        // 7: Magenta
    new Color3(0, 1, 1),        // 8: Cyan
    new Color3(1, 0.5, 0),      // 9: Orange
    new Color3(0.5, 0, 1),      // 10: Purple
    new Color3(0.5, 0.25, 0),   // 11: Brown
    new Color3(1, 0.75, 0.8),   // 12: Pink
    new Color3(0, 0.5, 0),      // 13: Dark Green
    new Color3(0.5, 0, 0),      // 14: Dark Red
    new Color3(0, 0, 0.5)       // 15: Dark Blue
  ];

  constructor(
    scene: Scene, 
    worldPosition: Vector3 = new Vector3(0, 10, 0), 
    rotationY: number = 0,
    ownerEntityId: number = 0
  ) {
    this.scene = scene;
    this.primitives = MeshPrimitives.getInstance();
    this.ownerEntityId = ownerEntityId;

    // Create root transform
    this.root = new TransformNode('buildGrid_root', scene);
    this.root.position = worldPosition;
    this.root.rotation.y = rotationY;

    console.log(`[BuildGrid] Grid root created at world position: ${this.root.position.toString()}, rotation.y: ${this.root.rotation.y.toFixed(3)}`);

    // Initialize transforms
    this.transforms = new BuildGridTransforms(this.root);

    // Initialize voxel data
    this.voxelData = new Uint8Array(this.GRID_SIZE * this.GRID_SIZE * this.GRID_SIZE);

    // Create boundary cube (but keep it invisible - we only use it for raycasting bounds)
    this.boundaryCube = this.createBoundaryCube();
    this.boundaryCube.isVisible = false; // Hide the boundary cube

    // Create selection cube (transparent, slightly larger, for hover/select/demolish)
    const [selectionCube, selectionMaterial] = this.createSelectionCube();
    this.selectionCube = selectionCube;
    this.selectionCubeMaterial = selectionMaterial;
    this.selectionCube.isVisible = false; // Hidden by default

    // Create grid plane (visual)
    this.gridPlane = this.createGridPlane();

    // Create invisible raycast plane (for reliable raycasting)
    this.gridRaycastPlane = this.createRaycastPlane();

    // Instance container
    this.instanceContainer = new TransformNode('buildGrid_instances', scene);
    this.instanceContainer.parent = this.root;
  }

  /**
   * Create debug wireframe box showing where server collision is (magenta).
   * Uses local space to match the visual blocks.
   */
  /**
   * Create invisible boundary cube (kept for raycasting).
   */
  private createBoundaryCube(): Mesh {
    const cube = MeshBuilder.CreateBox('buildBoundary', {
      size: this.WORLD_SIZE
    }, this.scene);

    // Keep it pickable for raycasting but invisible
    cube.isVisible = false;
    cube.parent = this.root;

    return cube;
  }

  /**
   * Create selection cube - transparent box for hover/select/demolish states.
   * Slightly larger than the grid to encompass it.
   */
  private createSelectionCube(): [Mesh, StandardMaterial] {
    const selectionSize = this.WORLD_SIZE + 0.2; // Slightly larger
    const cube = MeshBuilder.CreateBox('buildSelectionCube', {
      size: selectionSize
    }, this.scene);

    const material = new StandardMaterial('buildSelectionMaterial', this.scene);
    material.alpha = 0.3; // Semi-transparent
    material.emissiveColor = new Color3(1, 1, 0); // Yellow by default
    material.diffuseColor = new Color3(0, 0, 0); // No diffuse
    material.specularColor = new Color3(0, 0, 0); // No specular
    material.wireframe = false;

    cube.material = material;
    cube.isPickable = true; // Pickable for selection raycasting
    cube.parent = this.root;

    return [cube, material];
  }

  /**
   * Create grid plane with yellow lines (visual only).
   */
  private createGridPlane(): Mesh {
    const plane = MeshBuilder.CreatePlane('gridPlane', {
      size: this.WORLD_SIZE,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);

    plane.rotation.x = Math.PI * 0.5; // Horizontal
    plane.position.y = 0; // Middle of the grid (local space)

    // Apply grid material
    const mat = createGridMaterial(this.scene, this.GRID_SIZE);
    plane.material = mat;
    plane.parent = this.root;
    plane.isPickable = false; // Don't use for raycasting (has discard pixels)

    return plane;
  }

  /**
   * Create invisible plane for reliable raycasting.
   */
  private createRaycastPlane(): Mesh {
    const plane = MeshBuilder.CreatePlane('gridRaycastPlane', {
      size: this.WORLD_SIZE,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);

    plane.rotation.x = Math.PI * 0.5; // Horizontal
    plane.position.y = 0; // Middle of the grid (local space)
    plane.isVisible = false; // Invisible
    plane.isPickable = true; // Used for raycasting
    plane.parent = this.root;

    console.log('[BuildGrid] Created raycast plane - pickable:', plane.isPickable, 'visible:', plane.isVisible, 'parent:', plane.parent?.name);

    return plane;
  }

  /**
   * Convert 3D grid indices to 1D array index.
   */
  private gridToIndex(x: number, y: number, z: number): number {
    return x + y * this.GRID_SIZE + z * this.GRID_SIZE * this.GRID_SIZE;
  }

  /**
   * Check if grid position is valid.
   */
  private isValidGridPos(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.GRID_SIZE &&
           y >= 0 && y < this.GRID_SIZE &&
           z >= 0 && z < this.GRID_SIZE;
  }

  /**
   * Place a block at grid position with color index.
   */
  placeBlock(gridX: number, gridY: number, gridZ: number, colorIndex: number): void {
    if (!this.isValidGridPos(gridX, gridY, gridZ)) {
      return;
    }

    const index = this.gridToIndex(gridX, gridY, gridZ);
    if (this.voxelData[index] !== 0) {
      return;
    }

    // Store color index (1-16)
    this.voxelData[index] = colorIndex + 1;

    // Create instance at position
    const localPos = this.transforms.gridToLocal(gridX, gridY, gridZ);
    const originalColor = this.COLOR_PALETTE[colorIndex];
    const glow = new Color3(0, 0, 0); // No glow

    // Determine display color based on grid state
    const displayColor = this.gridState === 'white' ? new Color3(1, 1, 1) : originalColor;

    const instance = this.primitives.createBoxInstance(
      `buildBlock_${gridX}_${gridY}_${gridZ}`,
      this.CELL_SIZE,
      this.CELL_SIZE,
      this.CELL_SIZE,
      displayColor,
      glow
    );

    instance.position.copyFrom(localPos);
    instance.parent = this.instanceContainer;
    instance.isPickable = true; // Enable raycasting against this block

    // Store original color in metadata for later restoration
    instance.metadata = { originalColor };

    this.blockInstances.set(index, instance);
    
    console.log(`[BuildGrid] Block placed at (${gridX}, ${gridY}, ${gridZ}) color=${colorIndex}, localPos=${localPos.toString()}, worldRoot=${this.root.position.toString()}, instances=${this.blockInstances.size}`);
  }

  /**
   * Remove a block at grid position.
   */
  removeBlock(gridX: number, gridY: number, gridZ: number): void {
    if (!this.isValidGridPos(gridX, gridY, gridZ)) return;

    const index = this.gridToIndex(gridX, gridY, gridZ);
    if (this.voxelData[index] === 0) return; // Nothing to remove

    // Clear voxel data
    this.voxelData[index] = 0;

    // Remove instance
    const instance = this.blockInstances.get(index);
    if (instance) {
      instance.dispose();
      this.blockInstances.delete(index);
    }
  }

  /**
   * Update preview block position and color.
   */
  updatePreview(gridPos: Vector3Int | null, color: Color3): void {
    if (!gridPos) {
      this.hidePreview();
      return;
    }

    if (!this.previewBlock) {
      this.createPreviewBlock();
      console.log('[BuildGrid] Preview block parent:', this.previewBlock.parent?.name);
    }

    // Update color
    if (this.previewMaterial) {
      this.previewMaterial.emissiveColor = color;
    }

    // Position at grid cell
    const localPos = this.transforms.gridToLocal(gridPos.x, gridPos.y, gridPos.z);
    this.previewBlock!.position.copyFrom(localPos);
    this.previewBlock!.isVisible = true;
    
    // Debug - log once when first shown
    if (!this.previewBlock!.metadata?.logged) {
      console.log(`[BuildGrid] Preview at grid (${gridPos.x},${gridPos.y},${gridPos.z}) -> local ${localPos.toString()}`);
      console.log('[BuildGrid] Preview visible:', this.previewBlock!.isVisible);
      console.log('[BuildGrid] Root position:', this.root.position.toString());
      console.log('[BuildGrid] Root rotation:', this.root.rotation.toString());
      this.previewBlock!.metadata = { logged: true };
    }
  }

  /**
   * Create preview block.
   */
  private createPreviewBlock(): void {
    this.previewBlock = MeshBuilder.CreateBox('previewBlock', {
      size: this.CELL_SIZE
    }, this.scene);

    this.previewMaterial = new StandardMaterial('previewMat', this.scene);
    this.previewMaterial.diffuseColor = new Color3(1, 1, 1);
    this.previewMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5); // Bright glow so it's visible
    this.previewMaterial.alpha = 0.6;
    this.previewMaterial.wireframe = true; // Make it wireframe for better visibility

    this.previewBlock.material = this.previewMaterial;
    this.previewBlock.parent = this.instanceContainer;
    this.previewBlock.isPickable = false; // Don't interfere with raycasting
    
    console.log('[BuildGrid] Preview block created');
  }

  /**
   * Hide preview block.
   */
  private hidePreview(): void {
    if (this.previewBlock) {
      this.previewBlock.isVisible = false;
    }
  }

  /**
   * Exit build mode - run greedy meshing and create final mesh.
   */
  exitBuildMode(): void {
    console.log('[BuildGrid] Exiting build mode - keeping blocks as instances (no greedy mesh)');

    // Skip greedy meshing for now - just keep the block instances
    // TODO: Add greedy meshing back later for performance optimization
    
    // 1. Hide boundary, grid planes, and preview
    this.boundaryCube.isVisible = false;
    this.gridPlane.isVisible = false;
    this.gridRaycastPlane.isPickable = false; // Disable raycasting on grid after finalization
    if (this.previewBlock) {
      this.previewBlock.isVisible = false;
    }

    // 2. Mark as finalized
    this.isFinalized = true;

    console.log('[BuildGrid] Exited build mode - blocks remain as instances');
  }

  /**
   * Create a VoxelGrid adapter for the greedy mesher.
   */
  private createVoxelGridAdapter(): VoxelGrid {
    const grid = new VoxelGrid(this.GRID_SIZE, this.GRID_SIZE, this.GRID_SIZE);

    // Copy voxel data (non-zero = solid)
    for (let x = 0; x < this.GRID_SIZE; x++) {
      for (let y = 0; y < this.GRID_SIZE; y++) {
        for (let z = 0; z < this.GRID_SIZE; z++) {
          const index = this.gridToIndex(x, y, z);
          const isSolid = this.voxelData[index] !== 0;
          grid.setVoxel(x, y, z, isSolid);
        }
      }
    }

    return grid;
  }

  /**
   * Create mesh from greedy mesher quads with vertex colors.
   */
  private createMeshFromQuads(quads: any[]): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vertexCount = 0;

    for (const quad of quads) {
      // Get color for this quad (sample center voxel)
      const centerX = Math.floor(quad.x + quad.width * 0.5);
      const centerY = Math.floor(quad.y + quad.height * 0.5);
      const centerZ = Math.floor(quad.z);

      let colorIndex = 0;
      if (quad.axis === 'x') {
        const idx = this.gridToIndex(centerZ, centerY, centerX);
        colorIndex = Math.max(0, (this.voxelData[idx] || 1) - 1);
      } else if (quad.axis === 'y') {
        const idx = this.gridToIndex(centerX, centerZ, centerY);
        colorIndex = Math.max(0, (this.voxelData[idx] || 1) - 1);
      } else {
        const idx = this.gridToIndex(centerX, centerY, centerZ);
        colorIndex = Math.max(0, (this.voxelData[idx] || 1) - 1);
      }

      const color = this.COLOR_PALETTE[colorIndex % 16];

      // Convert quad to two triangles (4 vertices)
      const quadVerts = this.quadToVertices(quad);
      const normal = this.quadToNormal(quad);

      for (let i = 0; i < 4; i++) {
        positions.push(quadVerts[i].x, quadVerts[i].y, quadVerts[i].z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color.r, color.g, color.b, 1.0);
      }

      // Two triangles (0,1,2) and (0,2,3)
      indices.push(
        vertexCount, vertexCount + 1, vertexCount + 2,
        vertexCount, vertexCount + 2, vertexCount + 3
      );

      vertexCount += 4;
    }

    // Create mesh
    const mesh = new Mesh('finalBuilding', this.scene);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.colors = colors;
    vertexData.indices = indices;

    vertexData.applyToMesh(mesh);

    // Material with vertex colors
    const mat = new StandardMaterial('buildingMat', this.scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.emissiveColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mat.vertexColorEnabled = true;

    mesh.material = mat;

    console.log(`[BuildGrid] Created mesh with ${positions.length / 3} vertices, ${indices.length / 3} triangles`);

    return mesh;
  }

  /**
   * Convert quad to 4 vertices (in local space).
   */
  private quadToVertices(quad: any): Vector3[] {
    const cellSize = this.CELL_SIZE;
    const halfSize = this.WORLD_SIZE * 0.5;

    // Convert grid coords to local space (offset by -halfSize since grid is centered)
    const toLocal = (gx: number, gy: number, gz: number) => {
      return new Vector3(
        gx * cellSize - halfSize,
        gy * cellSize - halfSize,
        gz * cellSize - halfSize
      );
    };

    if (quad.axis === 'x') {
      const x = quad.z * cellSize - halfSize + (quad.positive ? cellSize : 0);
      const y0 = quad.y * cellSize - halfSize;
      const y1 = (quad.y + quad.height) * cellSize - halfSize;
      const z0 = quad.x * cellSize - halfSize;
      const z1 = (quad.x + quad.width) * cellSize - halfSize;

      return [
        new Vector3(x, y0, z0),
        new Vector3(x, y1, z0),
        new Vector3(x, y1, z1),
        new Vector3(x, y0, z1)
      ];
    } else if (quad.axis === 'y') {
      const y = quad.z * cellSize - halfSize + (quad.positive ? cellSize : 0);
      const x0 = quad.x * cellSize - halfSize;
      const x1 = (quad.x + quad.width) * cellSize - halfSize;
      const z0 = quad.y * cellSize - halfSize;
      const z1 = (quad.y + quad.height) * cellSize - halfSize;

      return [
        new Vector3(x0, y, z0),
        new Vector3(x1, y, z0),
        new Vector3(x1, y, z1),
        new Vector3(x0, y, z1)
      ];
    } else { // z axis
      const z = quad.z * cellSize - halfSize + (quad.positive ? cellSize : 0);
      const x0 = quad.x * cellSize - halfSize;
      const x1 = (quad.x + quad.width) * cellSize - halfSize;
      const y0 = quad.y * cellSize - halfSize;
      const y1 = (quad.y + quad.height) * cellSize - halfSize;

      return [
        new Vector3(x0, y0, z),
        new Vector3(x1, y0, z),
        new Vector3(x1, y1, z),
        new Vector3(x0, y1, z)
      ];
    }
  }

  /**
   * Get normal vector for quad.
   */
  private quadToNormal(quad: any): Vector3 {
    const sign = quad.positive ? 1 : -1;

    if (quad.axis === 'x') return new Vector3(sign, 0, 0);
    if (quad.axis === 'y') return new Vector3(0, sign, 0);
    return new Vector3(0, 0, sign);
  }

  /**
   * Get transforms helper.
   */
  getTransforms(): BuildGridTransforms {
    return this.transforms;
  }

  /**
   * Check if finalized.
   */
  getIsFinalized(): boolean {
    return this.isFinalized;
  }

  /**
   * Get final mesh (for deletion).
   */
  getFinalMesh(): Mesh | null {
    return this.finalMesh;
  }

  /**
   * Get root node.
   */
  getRoot(): TransformNode {
    return this.root;
  }

  /**
   * Set grid color state: white (other player/unselected), yellow (selected), red (demolish hover).
   */
  setColorState(state: 'white' | 'yellow' | 'red'): void {
    this.gridState = state;

    // Update all block instances to match the state
    if (state === 'white') {
      // Tint all blocks white
      this.blockInstances.forEach((instance) => {
        const originalColor = instance.metadata?.originalColor;
        if (originalColor) {
          // Use Color4 for instanced buffer (includes alpha)
          instance.instancedBuffers.color = new Color4(1, 1, 1, 1);
        }
      });
    } else if (state === 'yellow') {
      // Show original colors
      this.blockInstances.forEach((instance) => {
        const originalColor = instance.metadata?.originalColor;
        if (originalColor) {
          // Restore the original color as Color4
          instance.instancedBuffers.color = new Color4(originalColor.r, originalColor.g, originalColor.b, 1);
        }
      });
    }
    // Red state doesn't change block colors, just the selection cube

    console.log(`[BuildGrid] Grid state set to: ${state}, updated ${this.blockInstances.size} blocks`);
  }

  /**
   * Show the selection cube with a specific color.
   */
  showSelectionCube(state: 'hover' | 'demolish'): void {
    this.selectionCube.isVisible = true;
    
    if (state === 'hover') {
      // Semi-transparent yellow for hover
      this.selectionCubeMaterial.emissiveColor = new Color3(1, 1, 0); // Yellow
      this.selectionCubeMaterial.alpha = 0.3;
    } else if (state === 'demolish') {
      // Semi-transparent red for demolish hover
      this.selectionCubeMaterial.emissiveColor = new Color3(1, 0, 0); // Red
      this.selectionCubeMaterial.alpha = 0.4;
    }
  }

  /**
   * Hide the selection cube.
   */
  hideSelectionCube(): void {
    this.selectionCube.isVisible = false;
  }

  /**
   * Get the selection cube mesh for raycasting.
   */
  getSelectionCube(): Mesh {
    return this.selectionCube;
  }

  /**
   * Set ownership.
   */
  setOwnership(ownerEntityId: number, isOwned: boolean): void {
    this.ownerEntityId = ownerEntityId;
    this.isOwned = isOwned;
  }

  /**
   * Check if this grid is owned by the local player.
   */
  getIsOwned(): boolean {
    return this.isOwned;
  }

  /**
   * Get owner entity ID.
   */
  getOwnerEntityId(): number {
    return this.ownerEntityId;
  }

  /**
   * Check if the grid is empty (no blocks placed).
   */
  isEmpty(): boolean {
    for (let i = 0; i < this.voxelData.length; i++) {
      if (this.voxelData[i] !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get voxel data array.
   */
  getVoxelData(): Uint8Array {
    return this.voxelData;
  }

  /**
   * Get grid size.
   */
  getGridSize(): number {
    return this.GRID_SIZE;
  }

  /**
   * Dispose everything.
   */
  dispose(): void {
    // Dispose instances
    this.blockInstances.forEach(instance => instance.dispose());
    this.blockInstances.clear();

    // Dispose preview
    if (this.previewBlock) {
      this.previewBlock.dispose();
      this.previewBlock = null;
    }

    // Dispose final mesh
    if (this.finalMesh) {
      this.finalMesh.dispose();
      this.finalMesh = null;
    }

    // Dispose boundary and grid
    this.boundaryCube.dispose();
    this.gridPlane.dispose();
    this.gridRaycastPlane.dispose();
    this.instanceContainer.dispose();
    this.root.dispose();

    console.log('[BuildGrid] Disposed');
  }
}
