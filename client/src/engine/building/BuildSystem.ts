/**
 * BuildSystem - Unified building system with 4 modes:
 * 1. Select - Select existing grids
 * 2. Build - Place blocks or create new grids
 * 3. Transform - Move and rotate grids with gizmos
 * 4. Demolish - Destroy entire grid systems
 */

import { Scene, Camera, Vector3, Ray, Color3, TransformNode, GizmoManager, Mesh, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import { BuildGrid } from './BuildGrid';
import { BuildRaycaster } from './BuildRaycaster';
import type { NetworkClient } from '../network/NetworkClient';
import { Opcode } from '@spong/shared';
import { ref, type Ref } from 'vue';

export type BuildMode = 'select' | 'build' | 'transform' | 'demolish';

export class BuildSystem {
  private scene: Scene;
  private camera: Camera;
  private raycaster: BuildRaycaster;
  private networkClient: NetworkClient | null;
  private getPlayerTransform: (() => any) | null;

  // Grid management
  private grids = new Map<number, BuildGrid>(); // buildingEntityId -> BuildGrid
  private selectedGridId: number | null = null;

  // Current mode
  private currentMode: BuildMode = 'select';

  // Color palette for building
  private currentColorIndex = 0;
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

  // Gizmo manager for transform mode
  private gizmoManager: GizmoManager | null = null;

  // Demolish mode state
  private demolishTargetId: number | null = null;
  private demolishStartTime: number = 0;
  private demolishInProgress = false;
  private readonly DEMOLISH_HOLD_TIME = 3000; // 3 seconds in milliseconds

  // Build mode state
  private isRightMouseHeld = false; // For disabling snap in build mode

  // Exposed refs for UI (will be set from outside)
  public currentModeRef!: Ref<string>;
  public selectedGridIdRef!: Ref<number | null>;
  public currentColorIndexRef!: Ref<number>;
  public demolishProgressRef!: Ref<number>; // 0.0 to 1.0
  public hasHammer!: Ref<boolean>;

  // Callbacks
  private onModeChangeCallback: ((mode: BuildMode) => void) | null = null;
  private onColorChangeCallback: ((color: Color3) => void) | null = null;

  // Player entity ID (needed for ownership checks)
  private myEntityId: number | null = null;

  // Raycast visualization
  private raycastLine: Mesh | null = null;
  private raycastLineMaterial: StandardMaterial | null = null;

  // Grid preview for placement
  private previewGridPlane: Mesh | null = null;
  private previewGridMaterial: StandardMaterial | null = null;
  private previewGridRoot: TransformNode | null = null;
  private readonly GRID_SIZE = 12;
  private readonly CELL_SIZE = 0.5;
  private readonly WORLD_SIZE = 6;

  constructor(
    scene: Scene,
    camera: Camera,
    networkClient: NetworkClient | null,
    getPlayerTransform?: () => any
  ) {
    this.scene = scene;
    this.camera = camera;
    this.networkClient = networkClient;
    this.getPlayerTransform = getPlayerTransform || null;
    this.raycaster = new BuildRaycaster(scene, camera);

    // Initialize gizmo manager
    this.gizmoManager = new GizmoManager(scene);
    this.gizmoManager.positionGizmoEnabled = false;
    this.gizmoManager.rotationGizmoEnabled = false;
    this.gizmoManager.scaleGizmoEnabled = false;
    this.gizmoManager.boundingBoxGizmoEnabled = false;

    // Create raycast visualization line
    this.createRaycastLine();

    // Create grid preview plane
    this.createPreviewGridPlane();
  }

  /**
   * Create a line for visualizing raycasts.
   */
  private createRaycastLine(): void {
    this.raycastLine = MeshBuilder.CreateLines('buildRaycastLine', {
      points: [Vector3.Zero(), Vector3.Zero()],
      updatable: true
    }, this.scene);

    this.raycastLineMaterial = new StandardMaterial('buildRaycastLineMat', this.scene);
    this.raycastLineMaterial.emissiveColor = new Color3(0, 1, 1); // Cyan
    this.raycastLineMaterial.disableLighting = true;
    
    this.raycastLine.color = new Color3(0, 1, 1); // Cyan for lines mesh
    this.raycastLine.isPickable = false;
    this.raycastLine.isVisible = false; // Hidden by default
  }

  /**
   * Update raycast line visualization.
   */
  private updateRaycastLine(start: Vector3, end: Vector3): void {
    if (!this.raycastLine) return;

    const points = [start.clone(), end.clone()];
    this.raycastLine = MeshBuilder.CreateLines('buildRaycastLine', {
      points,
      instance: this.raycastLine
    }, this.scene);
    this.raycastLine.isVisible = true;
  }

  /**
   * Hide raycast line.
   */
  private hideRaycastLine(): void {
    if (this.raycastLine) {
      this.raycastLine.isVisible = false;
    }
  }

  /**
   * Create preview grid plane for new grid placement.
   */
  private createPreviewGridPlane(): void {
    this.previewGridRoot = new TransformNode('previewGridRoot', this.scene);

    this.previewGridPlane = MeshBuilder.CreatePlane('previewGridPlane', {
      size: this.WORLD_SIZE,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);

    this.previewGridMaterial = new StandardMaterial('previewGridMat', this.scene);
    this.previewGridMaterial.diffuseColor = new Color3(0, 0, 0);
    this.previewGridMaterial.emissiveColor = new Color3(0.3, 0.6, 1); // Blue
    this.previewGridMaterial.alpha = 0.4;
    this.previewGridMaterial.wireframe = false;

    this.previewGridPlane.material = this.previewGridMaterial;
    this.previewGridPlane.rotation.x = Math.PI * 0.5; // Horizontal
    this.previewGridPlane.isPickable = false;
    this.previewGridPlane.parent = this.previewGridRoot;
    this.previewGridPlane.isVisible = false;
  }

  /**
   * Show preview grid at position with rotation and color (blue=valid, red=invalid).
   */
  private showPreviewGrid(position: Vector3, rotationY: number, isValid: boolean): void {
    if (!this.previewGridRoot || !this.previewGridMaterial) return;

    this.previewGridRoot.position.copyFrom(position);
    this.previewGridRoot.rotation.y = rotationY;

    // Update color based on validity
    if (isValid) {
      this.previewGridMaterial.emissiveColor = new Color3(0.3, 0.6, 1); // Blue
    } else {
      this.previewGridMaterial.emissiveColor = new Color3(1, 0.2, 0.2); // Red
    }

    if (this.previewGridPlane) {
      this.previewGridPlane.isVisible = true;
    }
  }

  /**
   * Hide preview grid.
   */
  private hidePreviewGrid(): void {
    if (this.previewGridPlane) {
      this.previewGridPlane.isVisible = false;
    }
  }

  /**
   * Set player entity ID for ownership checks.
   */
  setMyEntityId(entityId: number): void {
    this.myEntityId = entityId;
  }

  /**
   * Update - called every frame.
   */
  update(): void {
    // Update demolish progress if in progress
    if (this.demolishInProgress && this.demolishTargetId !== null) {
      const elapsed = performance.now() - this.demolishStartTime;
      const progress = Math.min(1, elapsed / this.DEMOLISH_HOLD_TIME);
      this.demolishProgressRef.value = progress;

      if (progress >= 1.0) {
        // Demolish complete!
        this.completeDemolish();
      }
    }

    // Update raycast visualization
    this.updateRaycastVisualization();

    // Mode-specific update logic
    if (this.currentMode === 'select') {
      this.updateSelectMode();
    } else if (this.currentMode === 'build') {
      this.updateBuildMode();
    } else if (this.currentMode === 'transform') {
      this.updateTransformMode();
    } else if (this.currentMode === 'demolish') {
      this.updateDemolishMode();
    }
  }

  /**
   * Update raycast line visualization from player to hit point.
   */
  private updateRaycastVisualization(): void {
    // Only show raycast line if player has the hammer
    if (!this.hasHammer.value) {
      this.hideRaycastLine();
      return;
    }

    // Show raycast line in select, build, and demolish modes
    if (this.currentMode !== 'select' && this.currentMode !== 'build' && this.currentMode !== 'demolish') {
      this.hideRaycastLine();
      return;
    }

    // Get player position as start point
    let startPos = this.camera.position.clone();
    if (this.getPlayerTransform) {
      const transform = this.getPlayerTransform();
      if (transform?.node?.position) {
        // Use player eye height (roughly center of player capsule)
        startPos = transform.node.position.clone();
        startPos.y += 1.5; // Eye height offset
      }
    }

    // Get raycast hit point
    const hit = this.raycaster.raycastFromCamera();
    if (hit) {
      this.updateRaycastLine(startPos, hit.position);
    } else {
      // No hit - show line extending forward
      const ray = this.camera.getForwardRay(50);
      const endPos = ray.origin.add(ray.direction.scale(50));
      this.updateRaycastLine(startPos, endPos);
    }
  }

  /**
   * Handle mouse down - for demolish hold-to-destroy.
   */
  handleMouseDown(button: number): void {
    if (button === 0) { // Left mouse button
      if (this.currentMode === 'select') {
        this.handleSelectClick();
      } else if (this.currentMode === 'build') {
        this.handleBuildClick();
      } else if (this.currentMode === 'demolish') {
        this.startDemolish();
      }
    } else if (button === 2) { // Right mouse button
      if (this.currentMode === 'select') {
        this.deselectGrid();
      } else if (this.currentMode === 'build') {
        if (this.selectedGridId !== null) {
          // On selected grid - remove block
          this.handleBuildRightClick();
        } else {
          // No grid selected - hold to disable snapping
          this.isRightMouseHeld = true;
        }
      }
    }
  }

  /**
   * Handle mouse up - for demolish cancel and snap disable.
   */
  handleMouseUp(button: number): void {
    if (button === 0 && this.currentMode === 'demolish') {
      this.cancelDemolish();
    } else if (button === 2 && this.currentMode === 'build') {
      // Release right mouse - re-enable snapping
      this.isRightMouseHeld = false;
    }
  }

  /**
   * Set the current build mode.
   */
  setMode(mode: BuildMode): void {
    if (this.currentMode === mode) return;

    // Cleanup previous mode
    this.exitCurrentMode();

    this.currentMode = mode;
    this.currentModeRef.value = mode;

    // Enter new mode
    this.enterCurrentMode();

    this.onModeChangeCallback?.(mode);
  }

  /**
   * Cycle to the next color.
   */
  nextColor(): void {
    this.currentColorIndex = (this.currentColorIndex + 1) % this.COLOR_PALETTE.length;
    this.currentColorIndexRef.value = this.currentColorIndex;
    this.onColorChangeCallback?.(this.COLOR_PALETTE[this.currentColorIndex]);
  }

  /**
   * Cycle to the previous color.
   */
  prevColor(): void {
    this.currentColorIndex = (this.currentColorIndex - 1 + this.COLOR_PALETTE.length) % this.COLOR_PALETTE.length;
    this.currentColorIndexRef.value = this.currentColorIndex;
    this.onColorChangeCallback?.(this.COLOR_PALETTE[this.currentColorIndex]);
  }

  /**
   * Get the current color.
   */
  getCurrentColor(): Color3 {
    return this.COLOR_PALETTE[this.currentColorIndex];
  }

  // ========== MODE ENTER/EXIT ==========

  private exitCurrentMode(): void {
    if (this.currentMode === 'transform') {
      // Disable gizmos
      if (this.gizmoManager) {
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.attachToMesh(null);
      }
    } else if (this.currentMode === 'demolish') {
      // Cancel demolish if in progress
      this.cancelDemolish();
    } else if (this.currentMode === 'build') {
      // Hide block preview on selected grid
      if (this.selectedGridId !== null) {
        const grid = this.grids.get(this.selectedGridId);
        if (grid) {
          grid.hidePreview();
        }
      }
      // Hide grid placement preview
      this.hidePreviewGrid();
    }

    // Hide all selection cubes
    this.grids.forEach(grid => grid.hideSelectionCube());
  }

  private enterCurrentMode(): void {
    if (this.currentMode === 'transform') {
      // Enable gizmos if a grid is selected
      if (this.selectedGridId !== null) {
        this.enableGizmosForSelected();
      }
    }
  }

  // ========== SELECT MODE ==========

  private updateSelectMode(): void {
    // Hide grid preview in select mode
    this.hidePreviewGrid();

    // Raycast against all grids' selection cubes
    const ray = this.camera.getForwardRay();
    let hoveredGridId: number | null = null;

    for (const [gridId, grid] of this.grids) {
      const selectionCube = grid.getSelectionCube();
      const pickInfo = ray.intersectsMesh(selectionCube);
      
      if (pickInfo.hit) {
        hoveredGridId = gridId;
        break;
      }
    }

    // Update hover states
    this.grids.forEach((grid, gridId) => {
      if (gridId === hoveredGridId && gridId !== this.selectedGridId) {
        // Show hover state
        grid.showSelectionCube('hover');
      } else if (gridId !== this.selectedGridId) {
        // Hide if not selected
        grid.hideSelectionCube();
      }
    });
  }

  /**
   * Handle click in select mode - select a grid.
   */
  handleSelectClick(): void {
    const ray = this.camera.getForwardRay();

    for (const [gridId, grid] of this.grids) {
      const selectionCube = grid.getSelectionCube();
      const pickInfo = ray.intersectsMesh(selectionCube);
      
      if (pickInfo.hit) {
        // Check ownership
        if (grid.getIsOwned()) {
          this.selectGrid(gridId);
          return;
        } else {
          return;
        }
      }
    }

    // Clicked empty space - deselect
    this.deselectGrid();
  }

  private selectGrid(gridId: number): void {
    // Deselect previous grid
    if (this.selectedGridId !== null) {
      const prevGrid = this.grids.get(this.selectedGridId);
      if (prevGrid) {
        prevGrid.setColorState('white');
        prevGrid.hideSelectionCube();
        prevGrid.hidePreview();
      }
    }

    // Select new grid
    this.selectedGridId = gridId;
    this.selectedGridIdRef.value = gridId;
    
    const grid = this.grids.get(gridId);
    if (grid) {
      grid.setColorState('yellow'); // Selected grids show original colors
      grid.hideSelectionCube(); // Hide selection cube when selected
    }

    // Hide grid placement preview when a grid is selected
    this.hidePreviewGrid();
  }

  private deselectGrid(): void {
    if (this.selectedGridId !== null) {
      const grid = this.grids.get(this.selectedGridId);
      if (grid) {
        // Check if grid is empty
        if (grid.isEmpty() && grid.getIsOwned()) {
          // Destroy empty grids on deselect
          if (this.networkClient) {
            this.networkClient.sendLow(Opcode.BuildingDestroy, { buildingEntityId: this.selectedGridId });
          }
        } else {
          // Keep non-empty grids, just change color
          grid.setColorState('white');
          grid.hideSelectionCube();
          grid.hidePreview();
        }
      }
    }

    this.selectedGridId = null;
    this.selectedGridIdRef.value = null;
  }

  // ========== BUILD MODE ==========

  private updateBuildMode(): void {
    if (this.selectedGridId !== null) {
      // Hide grid preview when editing existing grid
      this.hidePreviewGrid();

      // Update block preview on selected grid
      const grid = this.grids.get(this.selectedGridId);
      if (grid) {
        const hit = this.raycaster.raycastFromCamera();
        if (hit && hit.mesh.name.startsWith('buildBlock_')) {
          // Hit a block - show preview on adjacent face
          const gridPos = this.calculateAdjacentGridPos(hit, grid);
          if (gridPos) {
            grid.updatePreview(gridPos, this.getCurrentColor());
          }
        } else if (hit && hit.mesh.name === 'gridRaycastPlane') {
          // Hit the grid plane
          const gridPos = grid.getTransforms().worldToGrid(hit.position);
          if (gridPos) {
            grid.updatePreview(gridPos, this.getCurrentColor());
          }
        } else {
          grid.hidePreview();
        }
      }
    } else {
      // No grid selected - show preview plane for new grid placement
      this.updateGridPlacementPreview();
    }
  }

  /**
   * Update grid placement preview when no grid is selected.
   */
  private updateGridPlacementPreview(): void {
    // Get player transform for rotation
    let playerRotY = 0;
    if (this.getPlayerTransform) {
      const transform = this.getPlayerTransform();
      if (transform?.node?.rotation) {
        playerRotY = transform.node.rotation.y;
      }
    }

    // Raycast to find placement position
    const ray = this.camera.getForwardRay(100);
    
    // Check if we hit another grid's selection cube for snapping (skip if right mouse held)
    if (!this.isRightMouseHeld) {
      for (const [gridId, grid] of this.grids) {
        const selectionCube = grid.getSelectionCube();
        const pickInfo = ray.intersectsMesh(selectionCube);
        
        if (pickInfo.hit && pickInfo.pickedPoint && pickInfo.getNormal()) {
          const normal = pickInfo.getNormal()!;
          const gridRoot = grid.getRoot();
          const existingPos = gridRoot.position;
          const existingRotY = gridRoot.rotation.y;
          
          // Determine which axis was hit based on normal
          const absX = Math.abs(normal.x);
          const absY = Math.abs(normal.y);
          const absZ = Math.abs(normal.z);
          
          let snapPosition: Vector3;
          
          if (absY > absX && absY > absZ) {
            // Hit top or bottom face - snap vertically, keep X and Z aligned
            const yOffset = normal.y > 0 ? this.WORLD_SIZE : -this.WORLD_SIZE;
            snapPosition = new Vector3(existingPos.x, existingPos.y + yOffset, existingPos.z);
          } else if (absX > absZ) {
            // Hit left or right face - snap on X axis, keep Y and Z aligned
            const xOffset = normal.x > 0 ? this.WORLD_SIZE : -this.WORLD_SIZE;
            snapPosition = new Vector3(existingPos.x + xOffset, existingPos.y, existingPos.z);
          } else {
            // Hit front or back face - snap on Z axis, keep X and Y aligned
            const zOffset = normal.z > 0 ? this.WORLD_SIZE : -this.WORLD_SIZE;
            snapPosition = new Vector3(existingPos.x, existingPos.y, existingPos.z + zOffset);
          }
          // Show preview at snapped position with same rotation as existing grid
          this.showPreviewGrid(snapPosition, existingRotY, true);
          return;
        }
      }
    }

    // If didn't hit selection cube, cast ray to find ground/terrain
    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      // Only pick terrain/level mesh, exclude all build-related meshes
      const name = mesh.name.toLowerCase();
      if (name.includes('build') || name.includes('preview') || name.includes('grid')) {
        return false;
      }
      return mesh.isPickable && mesh.isVisible;
    });

    if (pickResult && pickResult.hit && pickResult.pickedPoint) {
      // Place on ground/terrain at hit position
      const position = pickResult.pickedPoint.clone();
      position.y += 0.1; // Slightly above ground
      this.showPreviewGrid(position, playerRotY, true);
    } else {
      // No hit - project plane 4 units in front of camera
      const cameraPos = this.camera.position.clone();
      const cameraForward = this.camera.getDirection(Vector3.Forward());
      const projectedPos = cameraPos.add(cameraForward.scale(4));
      this.showPreviewGrid(projectedPos, playerRotY, true);
    }
  }

  /**
   * Handle left-click in build mode - place block or create grid.
   */
  handleBuildClick(): void {
    if (this.selectedGridId !== null) {
      // Place block on selected grid
      this.placeBlockOnSelectedGrid();
    } else {
      // Create new grid
      this.createNewGrid();
    }
  }

  /**
   * Handle right-click in build mode - remove block from selected grid.
   */
  handleBuildRightClick(): void {
    if (this.selectedGridId === null) return;

    const grid = this.grids.get(this.selectedGridId);
    if (!grid || !grid.getIsOwned()) return;

    // Raycast to find which block to remove
    const hit = this.raycaster.raycastFromCamera();
    if (!hit || !hit.mesh.name.startsWith('buildBlock_')) return;

    // Parse block position from mesh name: "buildBlock_X_Y_Z"
    const parts = hit.mesh.name.split('_');
    if (parts.length !== 4) return;

    const gridX = parseInt(parts[1]);
    const gridY = parseInt(parts[2]);
    const gridZ = parseInt(parts[3]);

    if (isNaN(gridX) || isNaN(gridY) || isNaN(gridZ)) return;

    // Send BlockRemove message to server
    if (this.networkClient) {
      this.networkClient.sendLow(Opcode.BlockRemove, {
        buildingEntityId: this.selectedGridId,
        gridX,
        gridY,
        gridZ
      });
    }
  }

  private placeBlockOnSelectedGrid(): void {
    const grid = this.grids.get(this.selectedGridId!);
    if (!grid || !grid.getIsOwned()) return;

    const hit = this.raycaster.raycastFromCamera();
    if (!hit) return;

    let gridPos: { x: number; y: number; z: number } | null = null;

    if (hit.mesh.name.startsWith('buildBlock_')) {
      // Hit a block - place on adjacent face
      gridPos = this.calculateAdjacentGridPos(hit, grid);
    } else if (hit.mesh.name === 'gridRaycastPlane') {
      // Hit the grid plane
      gridPos = grid.getTransforms().worldToGrid(hit.position);
    }

    if (!gridPos) return;

    // Send BlockPlace message to server
    if (this.networkClient) {
      this.networkClient.sendLow(Opcode.BlockPlace, {
        buildingEntityId: this.selectedGridId!,
        gridX: gridPos.x,
        gridY: gridPos.y,
        gridZ: gridPos.z,
        colorIndex: this.currentColorIndex
      });
    }
  }

  private calculateAdjacentGridPos(hit: any, grid: BuildGrid): { x: number; y: number; z: number } | null {
    // Parse current block position from mesh name
    const parts = hit.mesh.name.split('_');
    if (parts.length !== 4) return null;

    let x = parseInt(parts[1]);
    let y = parseInt(parts[2]);
    let z = parseInt(parts[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) return null;

    // Use hit normal to determine adjacent cell
    const normal = hit.normal;
    if (!normal) return null;

    // Round normal to nearest axis
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    if (absX > absY && absX > absZ) {
      x += normal.x > 0 ? 1 : -1;
    } else if (absY > absZ) {
      y += normal.y > 0 ? 1 : -1;
    } else {
      z += normal.z > 0 ? 1 : -1;
    }

    // Validate bounds
    if (x < 0 || x >= 12 || y < 0 || y >= 12 || z < 0 || z >= 12) {
      return null;
    }

    return { x, y, z };
  }

  private createNewGrid(): void {
    if (!this.networkClient) {
      return;
    }

    // Use the preview grid's position and rotation if visible
    if (this.previewGridRoot && this.previewGridPlane?.isVisible) {
      const posX = this.previewGridRoot.position.x;
      const posY = this.previewGridRoot.position.y;
      const posZ = this.previewGridRoot.position.z;
      const rotY = this.previewGridRoot.rotation.y;

      // Send BuildingCreate message to server
      this.networkClient.sendLow(Opcode.BuildingCreate, { posX, posY, posZ, rotY });
    } else {
    }
  }

  // ========== TRANSFORM MODE ==========

  private updateTransformMode(): void {
    // Gizmos handle their own updates
  }

  private enableGizmosForSelected(): void {
    if (!this.gizmoManager || this.selectedGridId === null) return;

    const grid = this.grids.get(this.selectedGridId);
    if (!grid || !grid.getIsOwned()) return;

    // Attach gizmos to grid root
    const root = grid.getRoot();
    this.gizmoManager.attachToMesh(root as any);
    this.gizmoManager.positionGizmoEnabled = true;
    
    // Only Y-rotation gizmo
    this.gizmoManager.rotationGizmoEnabled = true;
    if (this.gizmoManager.gizmos.rotationGizmo) {
      this.gizmoManager.gizmos.rotationGizmo.xGizmo.isEnabled = false;
      this.gizmoManager.gizmos.rotationGizmo.yGizmo.isEnabled = true;
      this.gizmoManager.gizmos.rotationGizmo.zGizmo.isEnabled = false;
    }
  }

  /**
   * Handle transform complete - sync to server.
   */
  handleTransformComplete(): void {
    if (this.selectedGridId === null || !this.networkClient) return;

    const grid = this.grids.get(this.selectedGridId);
    if (!grid || !grid.getIsOwned()) return;

    const root = grid.getRoot();
    this.networkClient.sendLow(Opcode.BuildingTransform, {
      buildingEntityId: this.selectedGridId,
      posX: root.position.x,
      posY: root.position.y,
      posZ: root.position.z,
      rotY: root.rotation.y
    });
  }

  // ========== DEMOLISH MODE ==========

  private updateDemolishMode(): void {
    // Hide grid preview in demolish mode
    this.hidePreviewGrid();

    if (this.demolishInProgress) return; // Don't update hover during demolish

    // Raycast against all grids' selection cubes
    const ray = this.camera.getForwardRay();
    let hoveredGridId: number | null = null;

    for (const [gridId, grid] of this.grids) {
      // Only allow demolishing owned grids
      if (!grid.getIsOwned()) continue;

      const selectionCube = grid.getSelectionCube();
      const pickInfo = ray.intersectsMesh(selectionCube);
      
      if (pickInfo.hit) {
        hoveredGridId = gridId;
        break;
      }
    }

    // Update hover states
    this.grids.forEach((grid, gridId) => {
      if (gridId === hoveredGridId) {
        grid.showSelectionCube('demolish'); // Red hover
      } else {
        grid.hideSelectionCube();
      }
    });

    this.demolishTargetId = hoveredGridId;
  }

  /**
   * Start demolish on mouse down.
   */
  startDemolish(): void {
    if (this.demolishTargetId === null) return;
    if (this.demolishInProgress) return;

    const grid = this.grids.get(this.demolishTargetId);
    if (!grid || !grid.getIsOwned()) return;

    this.demolishInProgress = true;
    this.demolishStartTime = performance.now();
    this.demolishProgressRef.value = 0;
  }

  /**
   * Cancel demolish on mouse up or movement away.
   */
  cancelDemolish(): void {
    if (!this.demolishInProgress) return;

    this.demolishInProgress = false;
    this.demolishProgressRef.value = 0;
    this.demolishTargetId = null;
  }

  /**
   * Complete demolish after 3 seconds.
   */
  private completeDemolish(): void {
    if (!this.demolishInProgress || this.demolishTargetId === null) return;

    // Send BuildingDestroy message to server
    if (this.networkClient) {
      this.networkClient.sendLow(Opcode.BuildingDestroy, { buildingEntityId: this.demolishTargetId });
    }

    this.demolishInProgress = false;
    this.demolishProgressRef.value = 0;
    this.demolishTargetId = null;
  }

  // ========== NETWORK HANDLERS ==========

  /**
   * Handle BuildingCreated from server.
   */
  handleBuildingCreated(data: any): void {
    const { buildingEntityId, ownerEntityId, gridPositionX, gridPositionY, gridPositionZ, gridRotationY } = data;
    
    const worldPos = new Vector3(gridPositionX, gridPositionY, gridPositionZ);
    const isOwned = ownerEntityId === this.myEntityId;
    
    const grid = new BuildGrid(this.scene, worldPos, gridRotationY, ownerEntityId);
    grid.setOwnership(ownerEntityId, isOwned);
    grid.setColorState(isOwned ? 'yellow' : 'white');
    
    this.grids.set(buildingEntityId, grid);
    
    // Auto-select if owned
    if (isOwned) {
      this.selectGrid(buildingEntityId);
    }
  }

  /**
   * Handle BuildingTransformed from server.
   */
  handleBuildingTransformed(data: any): void {
    const { buildingEntityId, posX, posY, posZ, rotY } = data;
    const grid = this.grids.get(buildingEntityId);
    if (!grid) return;

    const root = grid.getRoot();
    root.position.set(posX, posY, posZ);
    root.rotation.y = rotY;
  }

  /**
   * Handle BuildingDestroyed from server.
   */
  handleBuildingDestroyed(data: any): void {
    const { buildingEntityId } = data;
    const grid = this.grids.get(buildingEntityId);
    if (!grid) return;

    // Dispose grid
    grid.dispose();
    this.grids.delete(buildingEntityId);

    // Deselect if this was selected
    if (this.selectedGridId === buildingEntityId) {
      this.deselectGrid();
    }
  }

  /**
   * Handle BuildingInitialState from server.
   */
  handleBuildingInitialState(data: any): void {
    const { buildingEntityId, ownerEntityId, gridPositionX, gridPositionY, gridPositionZ, gridRotationY, blocks } = data;
    
    const worldPos = new Vector3(gridPositionX, gridPositionY, gridPositionZ);
    const isOwned = ownerEntityId === this.myEntityId;
    
    const grid = new BuildGrid(this.scene, worldPos, gridRotationY, ownerEntityId);
    grid.setOwnership(ownerEntityId, isOwned);
    grid.setColorState(isOwned ? 'yellow' : 'white');

    // Place existing blocks
    for (const block of blocks) {
      grid.placeBlock(block.gridX, block.gridY, block.gridZ, block.colorIndex);
    }
    
    this.grids.set(buildingEntityId, grid);
  }

  /**
   * Handle BlockPlaced from server.
   */
  handleBlockPlaced(data: any): void {
    const { buildingEntityId, gridX, gridY, gridZ, colorIndex } = data;
    const grid = this.grids.get(buildingEntityId);
    if (!grid) return;

    grid.placeBlock(gridX, gridY, gridZ, colorIndex);
  }

  /**
   * Handle BlockRemoved from server.
   */
  handleBlockRemoved(data: any): void {
    const { buildingEntityId, gridX, gridY, gridZ } = data;
    const grid = this.grids.get(buildingEntityId);
    if (!grid) return;

    grid.removeBlock(gridX, gridY, gridZ);
  }

  // ========== CALLBACKS ==========

  onModeChange(callback: (mode: BuildMode) => void): void {
    this.onModeChangeCallback = callback;
  }

  onColorChange(callback: (color: Color3) => void): void {
    this.onColorChangeCallback = callback;
  }

  // ========== CLEANUP ==========

  dispose(): void {
    this.grids.forEach(grid => grid.dispose());
    this.grids.clear();
    this.gizmoManager?.dispose();
    this.raycastLine?.dispose();
    this.raycastLineMaterial?.dispose();
    this.previewGridPlane?.dispose();
    this.previewGridMaterial?.dispose();
    this.previewGridRoot?.dispose();
  }
}
