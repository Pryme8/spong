/**
 * Voxel grid for tree generation with material types.
 * Grid stores material IDs: 0=empty, 1=trunk/branch, 2=leaf
 */

// Tree grid dimensions - 50x80x50 (taller for bigger trees)
export const TREE_GRID_SIZE = 50;
export const TREE_GRID_W = TREE_GRID_SIZE;
export const TREE_GRID_H = 80; // 30 cells taller
export const TREE_GRID_D = TREE_GRID_SIZE;
export const TREE_VOXEL_SIZE = 0.5;

// Material type constants
export const MATERIAL_EMPTY = 0;
export const MATERIAL_WOOD = 1;  // Trunk and branches
export const MATERIAL_LEAF = 2;

export class TreeVoxelGrid {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  private voxels: Uint8Array;

  constructor(
    width: number = TREE_GRID_W,
    height: number = TREE_GRID_H,
    depth: number = TREE_GRID_D
  ) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.voxels = new Uint8Array(width * height * depth);
  }

  /**
   * Get voxel material at (x, y, z).
   * Returns MATERIAL_EMPTY (0) if out of bounds.
   */
  getVoxel(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return MATERIAL_EMPTY;
    }
    const index = x + z * this.width + y * this.width * this.depth;
    return this.voxels[index];
  }

  /**
   * Set voxel material at (x, y, z).
   * Priority: trunk/branch (1) > leaf (2) > empty (0)
   * Trunk voxels cannot be overwritten by leaves.
   */
  setVoxel(x: number, y: number, z: number, material: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
      return;
    }
    
    const index = x + z * this.width + y * this.width * this.depth;
    const current = this.voxels[index];
    
    // Trunk has priority over leaves
    if (current === MATERIAL_WOOD && material === MATERIAL_LEAF) {
      return; // Don't overwrite trunk with leaf
    }
    
    this.voxels[index] = material;
  }

  /**
   * Fill a cylindrical cross-section at a point.
   * Used for turtle stepping along trunk/branches.
   */
  fillCylinder(cx: number, cy: number, cz: number, radius: number, material: number): void {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minZ = Math.floor(cz - radius);
    const maxZ = Math.ceil(cz + radius);
    const radiusSq = radius * radius;

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz <= radiusSq) {
          this.setVoxel(
            Math.floor(x),
            Math.floor(cy),
            Math.floor(z),
            material
          );
        }
      }
    }
  }

  /**
   * Fill an ellipsoidal region (for billowy leaves).
   * Uses separate radii for X, Y, Z to create organic shapes.
   */
  fillSphere(
    cx: number, cy: number, cz: number,
    radiusX: number, radiusY: number, radiusZ: number,
    material: number
  ): void {
    const minX = Math.floor(cx - radiusX);
    const maxX = Math.ceil(cx + radiusX);
    const minY = Math.floor(cy - radiusY);
    const maxY = Math.ceil(cy + radiusY);
    const minZ = Math.floor(cz - radiusZ);
    const maxZ = Math.ceil(cz + radiusZ);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          // Ellipsoid distance check
          const dx = (x - cx) / radiusX;
          const dy = (y - cy) / radiusY;
          const dz = (z - cz) / radiusZ;
          
          if (dx * dx + dy * dy + dz * dz <= 1.0) {
            this.setVoxel(x, y, z, material);
          }
        }
      }
    }
  }

  /**
   * Count total solid voxels (for debugging).
   */
  getSolidCount(): number {
    let count = 0;
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] !== MATERIAL_EMPTY) count++;
    }
    return count;
  }

  /**
   * Count voxels by material type.
   */
  getMaterialCounts(): { wood: number; leaf: number } {
    let wood = 0;
    let leaf = 0;
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] === MATERIAL_WOOD) wood++;
      else if (this.voxels[i] === MATERIAL_LEAF) leaf++;
    }
    return { wood, leaf };
  }
}
