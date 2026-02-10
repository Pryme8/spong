/**
 * Build Mode Manager - Controls building mode state and input handling.
 * Manages the build grid, raycasting, color selection, and user input.
 */

import { Scene, Camera, Color3, Vector3, PointerEventTypes } from '@babylonjs/core';
import { BuildGrid } from './BuildGrid';
import { BuildRaycaster, RaycastHit } from './BuildRaycaster';
import { Vector3Int } from './BuildGridTransforms';
import { NetworkClient } from '../network/NetworkClient';
import { Opcode } from '@spong/shared';

export class BuildModeManager {
  private scene: Scene;
  private camera: Camera;
  private isActive = false;
  private currentGrid: BuildGrid | null = null;
  private raycaster: BuildRaycaster;
  private getPlayerTransform: (() => any) | null = null;
  private networkClient: NetworkClient | null = null;

  // Building state from server
  private serverBuildingPosition: Vector3 | null = null;
  private serverBuildingRotation: number | null = null;
  private pendingBlocks: Array<{ gridX: number; gridY: number; gridZ: number; colorIndex: number }> = [];

  // Color selection
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

  // Event callbacks
  private onBuildModeChangeCallback: ((active: boolean) => void) | null = null;
  private onColorChangeCallback: ((color: Color3) => void) | null = null;

  constructor(scene: Scene, camera: Camera, getPlayerTransform?: () => any, networkClient?: NetworkClient) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new BuildRaycaster(scene, camera);
    this.getPlayerTransform = getPlayerTransform || null;
    this.networkClient = networkClient || null;

    this.setupInputHandlers();
    this.setupNetworkHandlers();
    
    // Try to load building from URL
    this.importFromUrl();
  }

  /**
   * Setup keyboard and mouse input handlers.
   */
  private setupInputHandlers(): void {
    // Keyboard input
    window.addEventListener('keydown', (evt) => {
      if (evt.key === 'b' || evt.key === 'B') {
        this.toggleBuildMode();
      } else if (this.isActive) {
        if (evt.key === ']') {
          this.cycleColorForward();
        } else if (evt.key === '[') {
          this.cycleColorBackward();
        }
      }
    });

    // Mouse input via pointer observable (reliable across WebGL/WebGPU)
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return;
      if (!this.isActive || !this.currentGrid) return;

      const evt = pointerInfo.event as PointerEvent;

      const hit = this.raycaster.raycastFromCamera();
      if (!hit) return;

      if (evt.button === 0) {
        // Left click - send place request to server
        const gridPos = this.calculatePlacementPosition(hit, false);
        if (gridPos && this.networkClient) {
          this.networkClient.sendLow(Opcode.BlockPlace, {
            gridX: gridPos.x,
            gridY: gridPos.y,
            gridZ: gridPos.z,
            colorIndex: this.currentColorIndex
          });
        }
      } else if (evt.button === 2) {
        // Right click - send remove request to server
        const gridPos = this.calculatePlacementPosition(hit, true);
        if (gridPos && this.networkClient) {
          this.networkClient.sendLow(Opcode.BlockRemove, {
            gridX: gridPos.x,
            gridY: gridPos.y,
            gridZ: gridPos.z
          });
        }
      }
    });

    // Prevent context menu on right-click
    this.scene.getEngine().getRenderingCanvas()?.addEventListener('contextmenu', (e) => {
      if (this.isActive) {
        e.preventDefault();
      }
    });
  }

  /**
   * Calculate grid position for block placement from raycast hit.
   */
  private calculatePlacementPosition(hit: RaycastHit, isRemoving: boolean): Vector3Int | null {
    if (!this.currentGrid) return null;

    const transforms = this.currentGrid.getTransforms();

    if (isRemoving) {
      // For deletion, try to get grid position directly from hit mesh name
      if (hit.mesh && hit.mesh.name && hit.mesh.name.startsWith('buildBlock_')) {
        // Parse grid coordinates from instance name: "buildBlock_X_Y_Z"
        const parts = hit.mesh.name.split('_');
        if (parts.length === 4) {
          return {
            x: parseInt(parts[1]),
            y: parseInt(parts[2]),
            z: parseInt(parts[3])
          };
        }
      }
      
      // Fallback: use hit position directly with slight inward offset
      const localPos = transforms.worldToLocal(hit.position);
      const cellSize = transforms.getCellSize();
      const inwardOffset = hit.normal.scale(-cellSize * 0.1); // Small offset inward
      const adjustedLocal = localPos.add(inwardOffset);
      return transforms.localToGrid(adjustedLocal);
    } else {
      // Place block: offset by normal to place adjacent
      const localPos = transforms.worldToLocal(hit.position);
      const cellSize = transforms.getCellSize();
      const offset = hit.normal.scale(cellSize * 0.6);
      const placementLocal = localPos.add(offset);
      return transforms.localToGrid(placementLocal);
    }
  }

  /**
   * Setup network message handlers.
   */
  private setupNetworkHandlers(): void {
    if (!this.networkClient) return;

    // Listen for block placed notifications from server
    this.networkClient.onLowFrequency(Opcode.BlockPlaced, (payload: any) => {
      if (this.currentGrid) {
        this.currentGrid.placeBlock(payload.gridX, payload.gridY, payload.gridZ, payload.colorIndex);
      }
    });

    // Listen for block removed notifications from server
    this.networkClient.onLowFrequency(Opcode.BlockRemoved, (payload: any) => {
      if (this.currentGrid) {
        this.currentGrid.removeBlock(payload.gridX, payload.gridY, payload.gridZ);
      }
    });

    // Listen for building initial state (when joining a room with existing blocks)
    this.networkClient.onLowFrequency(Opcode.BuildingInitialState, (payload: any) => {
      // Store the server's building position and rotation
      this.serverBuildingPosition = new Vector3(payload.gridPositionX, payload.gridPositionY, payload.gridPositionZ);
      this.serverBuildingRotation = payload.gridRotationY;
      this.pendingBlocks = payload.blocks;

      // If we're already in build mode, check if grid is at correct position
      if (this.currentGrid) {
        const currentPos = this.currentGrid.getRoot().position;
        const currentRot = this.currentGrid.getRoot().rotation.y;
        const positionMismatch = Math.abs(currentPos.x - payload.gridPositionX) > 0.01 || 
                                  Math.abs(currentPos.y - payload.gridPositionY) > 0.01 || 
                                  Math.abs(currentPos.z - payload.gridPositionZ) > 0.01;
        const rotationMismatch = Math.abs(currentRot - payload.gridRotationY) > 0.01;
        
        if (positionMismatch || rotationMismatch) {
          this.currentGrid.dispose();
          this.currentGrid = new BuildGrid(this.scene, this.serverBuildingPosition!, this.serverBuildingRotation!);
        }
        
        // Apply blocks to grid (now guaranteed to be at correct position)
        for (const block of payload.blocks) {
          this.currentGrid.placeBlock(block.gridX, block.gridY, block.gridZ, block.colorIndex);
        }
        this.pendingBlocks = []; // Clear pending blocks
      }
    });
  }

  /**
   * Toggle build mode on/off.
   */
  toggleBuildMode(): void {
    if (!this.isActive) {
      // ENTER build mode

      // Check if we have a finalized grid to delete
      if (this.currentGrid && this.currentGrid.getIsFinalized()) {
        // Delete existing finalized building and start fresh
        this.currentGrid.dispose();
        this.currentGrid = null;
      }

      // Get grid position and rotation
      let gridPosition: Vector3;
      let gridRotation: number;
      
      // If server has an existing building, use that position
      if (this.serverBuildingPosition && this.serverBuildingRotation !== null) {
        gridPosition = this.serverBuildingPosition;
        gridRotation = this.serverBuildingRotation;
      } else {
        // Otherwise, create a new building at the player's position
        gridPosition = new Vector3(0, -0.5, 0); // Default position
        gridRotation = 0; // Default rotation
        
        if (this.getPlayerTransform) {
          const playerTransform = this.getPlayerTransform();
          if (playerTransform) {
            // Position grid root at player Y - 0.5
            gridPosition = playerTransform.node.position.clone();
            gridPosition.y = playerTransform.node.position.y - 0.5;
            
            // Get player's Y rotation
            gridRotation = playerTransform.node.rotation.y;
          }
        }
      }

      // Create new grid
      this.currentGrid = new BuildGrid(this.scene, gridPosition, gridRotation);
      this.isActive = true;
      this.currentColorIndex = 0; // Reset color

      // Apply any pending blocks from server
      if (this.pendingBlocks.length > 0) {
        for (const block of this.pendingBlocks) {
          this.currentGrid.placeBlock(block.gridX, block.gridY, block.gridZ, block.colorIndex);
        }
        this.pendingBlocks = []; // Clear pending blocks
      }

      if (this.onBuildModeChangeCallback) {
        this.onBuildModeChangeCallback(true);
      }
      if (this.onColorChangeCallback) {
        this.onColorChangeCallback(this.getCurrentColor());
      }

    } else {
      // EXIT build mode

      if (this.currentGrid) {
        this.currentGrid.exitBuildMode();
      }

      this.isActive = false;
      
      // Don't auto-save - let user manually save if they want
      // this.exportToUrl(); // Removed auto-save

      if (this.onBuildModeChangeCallback) {
        this.onBuildModeChangeCallback(false);
      }
    }
  }

  /**
   * Cycle color forward.
   */
  private cycleColorForward(): void {
    this.currentColorIndex = (this.currentColorIndex + 1) % this.COLOR_PALETTE.length;

    if (this.onColorChangeCallback) {
      this.onColorChangeCallback(this.getCurrentColor());
    }
  }

  /**
   * Cycle color backward.
   */
  private cycleColorBackward(): void {
    this.currentColorIndex = (this.currentColorIndex - 1 + this.COLOR_PALETTE.length) % this.COLOR_PALETTE.length;

    if (this.onColorChangeCallback) {
      this.onColorChangeCallback(this.getCurrentColor());
    }
  }

  /**
   * Get current selected color.
   */
  getCurrentColor(): Color3 {
    return this.COLOR_PALETTE[this.currentColorIndex];
  }

  /**
   * Update preview block every frame.
   */
  update(): void {
    if (!this.isActive || !this.currentGrid) return;

    const hit = this.raycaster.raycastFromCamera();
    if (hit) {
      const gridPos = this.calculatePlacementPosition(hit, false);
      if (gridPos) {
        this.currentGrid.updatePreview(gridPos, this.getCurrentColor());
      } else {
        this.currentGrid.updatePreview(null, this.getCurrentColor());
      }
    } else {
      // No hit - hide preview
      this.currentGrid.updatePreview(null, this.getCurrentColor());
    }
  }

  /**
   * Register callback for build mode state changes.
   */
  onBuildModeChange(callback: (active: boolean) => void): void {
    this.onBuildModeChangeCallback = callback;
  }

  /**
   * Register callback for color changes.
   */
  onColorChange(callback: (color: Color3) => void): void {
    this.onColorChangeCallback = callback;
  }

  /**
   * Check if in build mode.
   */
  isInBuildMode(): boolean {
    return this.isActive;
  }

  /**
   * Dispose everything.
   */
  /**
   * Export current building to URL-safe base64 string.
   */
  exportToUrl(): void {
    if (!this.currentGrid) return;

    const root = this.currentGrid.getRoot();
    const blocks: Array<{ x: number; y: number; z: number; c: number }> = [];
    
    // Collect all placed blocks
    const voxelData = this.currentGrid.getVoxelData();
    const gridSize = this.currentGrid.getGridSize();
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          const index = x + y * gridSize + z * gridSize * gridSize;
          const colorValue = voxelData[index];
          if (colorValue !== 0) {
            blocks.push({ x, y, z, c: colorValue - 1 });
          }
        }
      }
    }

    if (blocks.length === 0) return;

    const buildData = {
      p: [root.position.x, root.position.y, root.position.z],
      r: root.rotation.y,
      b: blocks
    };

    const json = JSON.stringify(buildData);
    const base64 = btoa(json);
    const url = new URL(window.location.href);
    url.searchParams.set('build', base64);
    window.history.pushState({}, '', url);
    
    console.log(`[BuildMode] Building saved to URL (${blocks.length} blocks)`);
  }

  /**
   * Import building from URL parameter.
   */
  importFromUrl(): boolean {
    const url = new URL(window.location.href);
    const buildParam = url.searchParams.get('build');
    
    if (!buildParam) return false;

    try {
      const json = atob(buildParam);
      const buildData = JSON.parse(json);
      
      // Store server building position from URL
      this.serverBuildingPosition = new Vector3(buildData.p[0], buildData.p[1], buildData.p[2]);
      this.serverBuildingRotation = buildData.r;
      this.pendingBlocks = buildData.b.map((block: any) => ({
        gridX: block.x,
        gridY: block.y,
        gridZ: block.z,
        colorIndex: block.c
      }));
      
      console.log(`[BuildMode] Building loaded from URL (${this.pendingBlocks.length} blocks)`);
      return true;
    } catch (e) {
      console.error('[BuildMode] Failed to load building from URL:', e);
      return false;
    }
  }

  dispose(): void {
    if (this.currentGrid) {
      this.currentGrid.dispose();
      this.currentGrid = null;
    }
  }
}
