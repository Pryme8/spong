/**
 * Handle coordinate transformations for the build grid.
 * Converts between World Space → Local Space → Grid Space.
 */

import { Vector3, TransformNode, Matrix } from '@babylonjs/core';

export interface Vector3Int {
  x: number;
  y: number;
  z: number;
}

export class BuildGridTransforms {
  private root: TransformNode;
  private readonly GRID_SIZE = 12;
  private readonly WORLD_SIZE = 6;
  private readonly CELL_SIZE = 0.5; // 6/12

  constructor(root: TransformNode) {
    this.root = root;
  }

  /**
   * Convert world space position to local space (relative to grid root).
   */
  worldToLocal(worldPos: Vector3): Vector3 {
    const worldMatrix = this.root.getWorldMatrix();
    const invMatrix = Matrix.Invert(worldMatrix);
    return Vector3.TransformCoordinates(worldPos, invMatrix);
  }

  /**
   * Convert local space position to grid cell indices (0-11).
   */
  localToGrid(localPos: Vector3): Vector3Int {
    // Local space: -3 to +3 (centered at origin)
    // Grid space: 0 to 11 (cell indices)
    const halfSize = this.WORLD_SIZE * 0.5;
    const x = Math.floor((localPos.x + halfSize) / this.CELL_SIZE);
    const y = Math.floor((localPos.y + halfSize) / this.CELL_SIZE);
    const z = Math.floor((localPos.z + halfSize) / this.CELL_SIZE);

    const maxIndex = this.GRID_SIZE - 1;
    return {
      x: Math.max(0, Math.min(maxIndex, x)),
      y: Math.max(0, Math.min(maxIndex, y)),
      z: Math.max(0, Math.min(maxIndex, z))
    };
  }

  /**
   * Convert grid cell indices to local space position (center of cell).
   */
  gridToLocal(gridX: number, gridY: number, gridZ: number): Vector3 {
    const halfSize = this.WORLD_SIZE * 0.5;
    const x = (gridX * this.CELL_SIZE) - halfSize + (this.CELL_SIZE * 0.5);
    const y = (gridY * this.CELL_SIZE) - halfSize + (this.CELL_SIZE * 0.5);
    const z = (gridZ * this.CELL_SIZE) - halfSize + (this.CELL_SIZE * 0.5);
    return new Vector3(x, y, z);
  }

  /**
   * Convert world space position directly to grid cell indices.
   */
  worldToGrid(worldPos: Vector3): Vector3Int {
    const local = this.worldToLocal(worldPos);
    return this.localToGrid(local);
  }

  getCellSize(): number {
    return this.CELL_SIZE;
  }
}
