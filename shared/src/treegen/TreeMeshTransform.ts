/**
 * Transform utilities for tree collision meshes.
 */

import type { TreeBounds } from './TreeMesh.js';

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
 */
export function inverseTransformPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  transform: TreeTransform,
  meshBounds?: TreeBounds
): [number, number, number] {
  const { posX, posY, posZ, rotY, scale } = transform;
  
  // Inverse translate
  let tx = worldX - posX;
  let ty = worldY - posY;
  let tz = worldZ - posZ;
  
  // Inverse rotate around Y axis
  const cosY = Math.cos(-rotY);
  const sinY = Math.sin(-rotY);
  const rx = tx * cosY - tz * sinY;
  const rz = tx * sinY + tz * cosY;
  
  // Inverse scale and uncenter using actual bounds
  if (meshBounds) {
    const centerX = (meshBounds.minX + meshBounds.maxX) * 0.5;
    const centerY = (meshBounds.minY + meshBounds.maxY) * 0.5;
    const centerZ = (meshBounds.minZ + meshBounds.maxZ) * 0.5;
    return [
      (rx / scale) + centerX,
      (ty / scale) + centerY,
      (rz / scale) + centerZ
    ];
  } else {
    // Fallback for legacy support
    const halfGrid = 25; // 50 * 0.5
    return [
      (rx / scale) + halfGrid,
      (ty / scale),
      (rz / scale) + halfGrid
    ];
  }
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
