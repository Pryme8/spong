/**
 * LadderPlacementSystem - Handles ladder placement with preview and validation.
 * 
 * Workflow:
 * 1. Initial placement: Raycast to find valid wall surface (no up/down normals)
 * 2. Extension: Raycast upward to show multi-segment preview
 * 3. Finalization: Right-click again to place ladder and send to server
 */

import {
  Scene,
  Camera,
  Vector3,
  Ray,
  TransformNode,
  StandardMaterial,
  Color3,
  Mesh,
  MeshBuilder
} from '@babylonjs/core';
import { createLadderSegmentMesh } from './LadderMesh';
import type { NetworkClient } from '../network/NetworkClient';
import { Opcode } from '@spong/shared';

type PlacementState = 'idle' | 'initial' | 'extending' | 'finalizing';

export class LadderPlacementSystem {
  private scene: Scene;
  private camera: Camera;
  private networkClient: NetworkClient | null;

  // Placement state
  private state: PlacementState = 'idle';
  private firstSegmentPosition: Vector3 | null = null;
  private firstSegmentNormal: Vector3 | null = null;
  private firstSegmentRotationY: number = 0;
  private segmentCount: number = 1;
  
  // Preview meshes
  private previewRoot: TransformNode | null = null;
  private previewMaterial: StandardMaterial | null = null;

  // Constants
  private readonly MAX_SEGMENTS = 20; // 10 units tall max
  private readonly SEGMENT_HEIGHT = 0.5;
  private readonly RAYCAST_MAX_DISTANCE = 50;

  constructor(scene: Scene, camera: Camera, networkClient: NetworkClient | null) {
    this.scene = scene;
    this.camera = camera;
    this.networkClient = networkClient;

    // Create preview material
    this.previewMaterial = new StandardMaterial('ladderPreviewMat', scene);
    this.previewMaterial.diffuseColor = new Color3(0.4, 0.25, 0.15); // Brown
    this.previewMaterial.emissiveColor = new Color3(0.3, 0.6, 1); // Blue glow (valid)
    this.previewMaterial.alpha = 0.4;
    this.previewMaterial.disableLighting = false;

    console.log('[LadderPlacementSystem] Initialized');
  }

  /**
   * Update - called every frame.
   */
  update(): void {
    if (this.state === 'idle') return;

    if (this.state === 'initial') {
      this.updateInitialPlacement();
    } else if (this.state === 'extending') {
      this.updateExtension();
    }
  }

  /**
   * Check if placement is active.
   */
  isActive(): boolean {
    return this.state !== 'idle';
  }

  /**
   * Handle right-click - start placement or finalize.
   */
  handleRightClick(): void {
    if (this.state === 'idle') {
      // Start placement
      this.state = 'initial';
      console.log('[LadderPlacementSystem] Started placement');
    } else if (this.state === 'initial' && this.firstSegmentPosition !== null) {
      // Move to extension mode
      this.state = 'extending';
      console.log('[LadderPlacementSystem] Extension mode activated');
    } else if (this.state === 'extending') {
      // Finalize placement
      this.finalizePlacement();
    }
  }

  /**
   * Cancel placement.
   */
  cancel(): void {
    this.state = 'idle';
    this.firstSegmentPosition = null;
    this.firstSegmentNormal = null;
    this.segmentCount = 1;
    this.hidePreview();
    console.log('[LadderPlacementSystem] Placement canceled');
  }

  /**
   * Update initial placement (find first segment position).
   */
  private updateInitialPlacement(): void {
    const hit = this.raycastTerrain();
    
    if (hit && this.isValidWallNormal(hit.normal)) {
      // Valid wall hit - show single segment preview
      this.firstSegmentPosition = hit.position.clone();
      this.firstSegmentNormal = hit.normal.clone();
      this.firstSegmentRotationY = this.calculateRotationFromNormal(hit.normal);
      this.segmentCount = 1;

      this.showPreview(this.firstSegmentPosition, this.firstSegmentRotationY, 1, true);
    } else {
      // Invalid placement
      this.firstSegmentPosition = null;
      this.firstSegmentNormal = null;
      this.hidePreview();
    }
  }

  /**
   * Update extension mode (show multi-segment preview).
   */
  private updateExtension(): void {
    if (!this.firstSegmentPosition || !this.firstSegmentNormal) {
      this.cancel();
      return;
    }

    // Raycast upward from first segment to find how many segments we can place
    const extendedCount = this.calculateExtendedSegments();
    this.segmentCount = extendedCount;

    // Show preview with all segments
    this.showPreview(this.firstSegmentPosition, this.firstSegmentRotationY, this.segmentCount, true);
  }

  /**
   * Calculate how many segments can be placed by raycasting upward.
   */
  private calculateExtendedSegments(): number {
    if (!this.firstSegmentPosition || !this.firstSegmentNormal) return 1;

    let count = 1;
    const maxSegments = Math.min(this.MAX_SEGMENTS, 20);

    // Raycast upward every 0.5 units to check for valid surface
    for (let i = 1; i < maxSegments; i++) {
      const checkY = this.firstSegmentPosition.y + i * this.SEGMENT_HEIGHT;
      
      // Create ray pointing along the normal from the check position
      const rayOrigin = new Vector3(
        this.firstSegmentPosition.x,
        checkY,
        this.firstSegmentPosition.z
      );
      
      // Offset slightly away from wall, then raycast toward wall
      const offsetOrigin = rayOrigin.add(this.firstSegmentNormal.scale(-0.5));
      const ray = new Ray(offsetOrigin, this.firstSegmentNormal, 1.0);

      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return this.isTerrainMesh(mesh);
      });

      if (hit && hit.hit && hit.pickedPoint) {
        const hitNormal = hit.getNormal();
        if (hitNormal && this.normalsMatch(this.firstSegmentNormal, hitNormal)) {
          count = i + 1;
        } else {
          break; // Different normal - stop extension
        }
      } else {
        break; // No more surface - stop extension
      }
    }

    return count;
  }

  /**
   * Finalize placement - send to server.
   */
  private finalizePlacement(): void {
    if (!this.firstSegmentPosition || !this.firstSegmentNormal || !this.networkClient) {
      this.cancel();
      return;
    }

    // Send placement message to server
    this.networkClient.sendLow(Opcode.LadderPlace, {
      posX: this.firstSegmentPosition.x,
      posY: this.firstSegmentPosition.y,
      posZ: this.firstSegmentPosition.z,
      normalX: this.firstSegmentNormal.x,
      normalY: this.firstSegmentNormal.y,
      normalZ: this.firstSegmentNormal.z,
      segmentCount: this.segmentCount
    });

    console.log(`[LadderPlacementSystem] Placed ladder with ${this.segmentCount} segments at (${this.firstSegmentPosition.x.toFixed(2)}, ${this.firstSegmentPosition.y.toFixed(2)}, ${this.firstSegmentPosition.z.toFixed(2)})`);

    // Reset state
    this.cancel();
  }

  /**
   * Raycast to find terrain/building surfaces.
   */
  private raycastTerrain(): { position: Vector3; normal: Vector3 } | null {
    const ray = this.camera.getForwardRay(this.RAYCAST_MAX_DISTANCE);
    
    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return this.isTerrainMesh(mesh);
    });

    if (hit && hit.hit && hit.pickedMesh && hit.pickedPoint) {
      const normal = hit.getNormal();
      if (normal) {
        return {
          position: hit.pickedPoint,
          normal: normal
        };
      }
    }

    return null;
  }

  /**
   * Check if a mesh is terrain or building block.
   */
  private isTerrainMesh(mesh: Mesh): boolean {
    const name = mesh.name.toLowerCase();
    // Check for terrain, building blocks, rocks, trees
    return (
      name.includes('level') ||
      name.includes('terrain') ||
      name.includes('ground') ||
      name.startsWith('buildblock_') ||
      name === 'gridraycastplane' ||
      name.includes('rock') ||
      name.includes('tree')
    ) && mesh.isPickable && mesh.isVisible;
  }

  /**
   * Check if normal is a valid wall (not up or down).
   */
  private isValidWallNormal(normal: Vector3): boolean {
    // Reject normals that are mostly vertical (up or down)
    // Valid wall normals have |y| < 0.7 (roughly 45 degree angle)
    return Math.abs(normal.y) < 0.7;
  }

  /**
   * Check if two normals match (within tolerance).
   */
  private normalsMatch(n1: Vector3, n2: Vector3, tolerance: number = 0.1): boolean {
    const dx = Math.abs(n1.x - n2.x);
    const dy = Math.abs(n1.y - n2.y);
    const dz = Math.abs(n1.z - n2.z);
    return dx < tolerance && dy < tolerance && dz < tolerance;
  }

  /**
   * Calculate rotation Y from normal (face the ladder away from wall).
   */
  private calculateRotationFromNormal(normal: Vector3): number {
    // Normal points out from wall, we want ladder to face toward wall
    // So we rotate to face opposite of normal
    return Math.atan2(-normal.x, -normal.z);
  }

  /**
   * Show ladder preview.
   */
  private showPreview(position: Vector3, rotationY: number, segmentCount: number, isValid: boolean): void {
    // Remove old preview
    this.hidePreview();

    // Create preview root
    this.previewRoot = createLadderSegmentMesh('ladderPreview', this.scene, segmentCount, { hasShadows: false });
    this.previewRoot.position.copyFrom(position);
    this.previewRoot.rotation.y = rotationY;

    // Apply transparent material to all meshes
    this.previewRoot.getChildMeshes().forEach((mesh) => {
      if (this.previewMaterial) {
        mesh.material = this.previewMaterial;
        
        // Update color based on validity
        if (isValid) {
          this.previewMaterial.emissiveColor = new Color3(0.3, 0.6, 1); // Blue (valid)
        } else {
          this.previewMaterial.emissiveColor = new Color3(1, 0.2, 0.2); // Red (invalid)
        }
      }
      mesh.isPickable = false;
    });
  }

  /**
   * Hide ladder preview.
   */
  private hidePreview(): void {
    if (this.previewRoot) {
      this.previewRoot.getChildMeshes().forEach(m => m.dispose());
      this.previewRoot.dispose();
      this.previewRoot = null;
    }
  }

  /**
   * Dispose of the placement system.
   */
  dispose(): void {
    this.hidePreview();
    if (this.previewMaterial) {
      this.previewMaterial.dispose();
      this.previewMaterial = null;
    }
    console.log('[LadderPlacementSystem] Disposed');
  }
}
