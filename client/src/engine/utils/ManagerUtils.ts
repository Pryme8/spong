/**
 * Shared utilities for level managers to eliminate duplication.
 * Common patterns for procedural world object spawning and management.
 */

import { Mesh } from '@babylonjs/core';

export interface QuadSpec {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  axis: 'x' | 'y' | 'z';
  positive: boolean;
}

export interface QuadGeometry {
  corners: Array<{ x: number; y: number; z: number }>;
  normal: { x: number; y: number; z: number };
}

export interface TriggerMeshEntry {
  mesh: Mesh;
  index: number;
}

/**
 * Convert a quad specification into corner positions and normal.
 * Shared by LevelTreeManager and LevelBushManager for voxel quad rendering.
 */
export function getQuadGeometry(quad: QuadSpec, voxelSize: number): QuadGeometry {
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

/**
 * Check if a camera position is inside any trigger mesh AABB.
 * Shared by LevelTreeManager and LevelBushManager for foliage detection.
 * 
 * @param triggerMeshes Array of trigger meshes to check
 * @param cameraX Camera X position
 * @param cameraY Camera Y position
 * @param cameraZ Camera Z position
 * @param maxCheckDistance Only check meshes within this distance
 * @param triggerMargin Margin around AABB (usually negative for inset)
 * @returns Index of the mesh the camera is inside, or -1 if none
 */
export function checkCameraInTriggerMeshes(
  triggerMeshes: TriggerMeshEntry[],
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  maxCheckDistance: number,
  triggerMargin = -0.1
): number {
  const maxCheckDistanceSq = maxCheckDistance * maxCheckDistance;

  for (const { mesh, index } of triggerMeshes) {
    const meshPos = mesh.position;
    
    // Fast distance check first (approximate sphere check)
    const dx = cameraX - meshPos.x;
    const dy = cameraY - meshPos.y;
    const dz = cameraZ - meshPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    
    if (distSq > maxCheckDistanceSq) {
      continue; // Skip this mesh, it's too far away
    }

    // Only do AABB check for nearby meshes
    const triggerBounds = mesh.getBoundingInfo().boundingBox;
    const worldMin = triggerBounds.minimumWorld;
    const worldMax = triggerBounds.maximumWorld;

    const inside = 
      cameraX >= (worldMin.x - triggerMargin) && cameraX <= (worldMax.x + triggerMargin) &&
      cameraY >= (worldMin.y - triggerMargin) && cameraY <= (worldMax.y + triggerMargin) &&
      cameraZ >= (worldMin.z - triggerMargin) && cameraZ <= (worldMax.z + triggerMargin);

    if (inside) {
      return index;
    }
  }

  return -1;
}
