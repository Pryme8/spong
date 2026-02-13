/**
 * BuildingCollisionManager - Manages building collision data for client-side physics prediction.
 * Replicates server's block collider generation to ensure client-server consistency.
 */

export interface BoxCollider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface BuildingState {
  gridPositionX: number;
  gridPositionY: number;
  gridPositionZ: number;
  gridRotationY: number;
  voxelData: Uint8Array;
  gridSize: number;
}

export class BuildingCollisionManager {
  private buildingStates = new Map<number, BuildingState>();
  private readonly CELL_SIZE = 0.5;
  
  /**
   * Initialize building from server's BuildingInitialState message.
   */
  initialize(data: {
    buildingEntityId: number;
    gridPositionX: number;
    gridPositionY: number;
    gridPositionZ: number;
    gridRotationY: number;
    gridSize: number;
    blocks: Array<{ gridX: number; gridY: number; gridZ: number; colorIndex: number }>;
  }): void {
    const { buildingEntityId, gridPositionX, gridPositionY, gridPositionZ, gridRotationY, gridSize, blocks } = data;
    // Create voxel data array
    const voxelData = new Uint8Array(gridSize * gridSize * gridSize);
    
    // Place existing blocks
    for (const block of blocks) {
      const index = block.gridX + block.gridY * gridSize + block.gridZ * gridSize * gridSize;
      voxelData[index] = block.colorIndex + 1; // Server stores as colorIndex + 1 (0 = empty)
    }
    
    this.buildingStates.set(buildingEntityId, {
      gridPositionX,
      gridPositionY,
      gridPositionZ,
      gridRotationY,
      voxelData,
      gridSize
    });
  }
  
  /**
   * Add a block from BlockPlace message.
   */
  addBlock(data: { buildingEntityId: number; gridX: number; gridY: number; gridZ: number; colorIndex: number }): void {
    const buildingState = this.buildingStates.get(data.buildingEntityId);
    if (!buildingState) {
      return;
    }
    
    const { gridX, gridY, gridZ, colorIndex } = data;
    const { gridSize, voxelData } = buildingState;
    
    const index = gridX + gridY * gridSize + gridZ * gridSize * gridSize;
    voxelData[index] = colorIndex + 1;
  }
  
  /**
   * Remove a block from BlockRemove message.
   */
  removeBlock(data: { buildingEntityId: number; gridX: number; gridY: number; gridZ: number }): void {
    const buildingState = this.buildingStates.get(data.buildingEntityId);
    if (!buildingState) {
      return;
    }
    
    const { gridX, gridY, gridZ } = data;
    const { gridSize, voxelData } = buildingState;
    
    const index = gridX + gridY * gridSize + gridZ * gridSize * gridSize;
    voxelData[index] = 0;
  }

  /**
   * Update building transform from BuildingTransform message.
   */
  updateTransform(data: {
    buildingEntityId: number;
    posX: number;
    posY: number;
    posZ: number;
    rotY: number;
  }): void {
    const buildingState = this.buildingStates.get(data.buildingEntityId);
    if (!buildingState) {
      return;
    }

    buildingState.gridPositionX = data.posX;
    buildingState.gridPositionY = data.posY;
    buildingState.gridPositionZ = data.posZ;
    buildingState.gridRotationY = data.rotY;
  }

  /**
   * Remove building from BuildingDestroy message.
   */
  removeBuilding(buildingEntityId: number): void {
    if (this.buildingStates.delete(buildingEntityId)) {
    } else {
    }
  }
  
  /**
   * Generate block colliders for physics prediction.
   * MUST match server implementation in Room.ts exactly!
   * Returns colliders from ALL buildings aggregated.
   */
  getBlockColliders(): BoxCollider[] {
    const blockColliders: BoxCollider[] = [];
    const halfCell = this.CELL_SIZE * 0.5;
    
    // Iterate through all buildings
    for (const [buildingEntityId, buildingState] of this.buildingStates) {
      const { gridPositionX, gridPositionY, gridPositionZ, gridRotationY, voxelData, gridSize } = buildingState;
      const halfSize = (gridSize * this.CELL_SIZE) * 0.5;
      
      // Iterate through voxel data to find placed blocks
      // IMPORTANT: This loop MUST match server implementation exactly
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          for (let z = 0; z < gridSize; z++) {
            const index = x + y * gridSize + z * gridSize * gridSize;
            if (voxelData[index] !== 0) {
              // Calculate local position
              const localX = (x * this.CELL_SIZE) - halfSize + halfCell;
              const localY = (y * this.CELL_SIZE) - halfSize + halfCell;
              const localZ = (z * this.CELL_SIZE) - halfSize + halfCell;
              
              // Transform to world space (Babylon uses left-handed coordinate system)
              const cosY = Math.cos(gridRotationY);
              const sinY = Math.sin(gridRotationY);
              const worldX = gridPositionX + (localX * cosY + localZ * sinY);
              const worldY = gridPositionY + localY;
              const worldZ = gridPositionZ + (-localX * sinY + localZ * cosY);
              
              // Create AABB for this block
              blockColliders.push({
                minX: worldX - halfCell,
                minY: worldY - halfCell,
                minZ: worldZ - halfCell,
                maxX: worldX + halfCell,
                maxY: worldY + halfCell,
                maxZ: worldZ + halfCell
              });
            }
          }
        }
      }
    }
    
    return blockColliders;
  }
  
  /**
   * Check if any buildings exist.
   */
  hasBuilding(): boolean {
    return this.buildingStates.size > 0;
  }

  /**
   * Get a specific building state (for BuildSystem to access).
   */
  getBuilding(buildingEntityId: number): BuildingState | undefined {
    return this.buildingStates.get(buildingEntityId);
  }

  /**
   * Get all building entity IDs.
   */
  getAllBuildingIds(): number[] {
    return Array.from(this.buildingStates.keys());
  }
  
  /**
   * Clear all building states.
   */
  clear(): void {
    this.buildingStates.clear();
  }

  /**
   * Dispose of the building collision manager.
   */
  dispose(): void {
    this.clear();
  }
}
