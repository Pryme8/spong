/**
 * Transform utilities for tree collision meshes.
 */

export interface TreeTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  scale: number;
}

/**
 * Transform a point from world space to tree-local space.
 * Used for collision detection - transforms query point into tree's coordinate system.
 * 
 * Tree meshes are in voxel grid space (0-50 range) and need the same centering
 * as the visual tree rendering: (-halfGrid, -yOffset, -halfGrid) before scaling.
 */
export function inverseTransformPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  transform: TreeTransform
): [number, number, number] {
  const { posX, posY, posZ, rotY, scale } = transform;
  
  // Tree coordinate system constants (must match LevelTreeManager and TreeView rendering)
  const TREE_GRID_SIZE = 50;
  const TREE_VOXEL_SIZE = 0.5;
  const halfGrid = TREE_GRID_SIZE * TREE_VOXEL_SIZE * 0.5; // 12.5
  const yOffset = 2 * TREE_VOXEL_SIZE; // 1.0
  
  // Inverse translate
  let tx = worldX - posX;
  let ty = worldY - posY;
  let tz = worldZ - posZ;
  
  // Inverse rotate around Y axis
  const cosY = Math.cos(-rotY);
  const sinY = Math.sin(-rotY);
  const rx = tx * cosY - tz * sinY;
  const rz = tx * sinY + tz * cosY;
  
  // Inverse scale, then add back the centering offset to get voxel grid coordinates
  // Visual mesh does: (vertex - halfGrid) * scale + worldPos
  // So inverse is: (worldPos - worldPos) / scale + halfGrid
  return [
    (rx / scale) + halfGrid,
    (ty / scale) + yOffset,
    (rz / scale) + halfGrid
  ];
}

/**
 * Transform a direction vector from world space to tree-local space.
 */
export function inverseTransformDirection(
  worldDx: number,
  worldDy: number,
  worldDz: number,
  transform: TreeTransform
): [number, number, number] {
  const { rotY, scale } = transform;
  
  // Inverse rotate
  const cosY = Math.cos(-rotY);
  const sinY = Math.sin(-rotY);
  const rx = worldDx * cosY - worldDz * sinY;
  const rz = worldDx * sinY + worldDz * cosY;
  
  // Inverse scale
  return [rx / scale, worldDy / scale, rz / scale];
}
