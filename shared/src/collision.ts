import { inverseTransformPoint, inverseTransformDirection } from './rockgen/RockMeshTransform.js';
import type { RockBounds } from './rockgen/RockMesh.js';
import type { TreeTransform } from './treegen/TreeMeshTransform.js';

/**
 * Capsule vs Capsule collision test (simplified as cylinders in XZ plane).
 * Used for player-vs-player collision.
 *
 * @param pos1X, pos1Z   First capsule position (XZ)
 * @param pos2X, pos2Z   Second capsule position (XZ)
 * @param radius1        First capsule radius
 * @param radius2        Second capsule radius
 * @returns { colliding: boolean, pushX: number, pushZ: number } - push vector to separate capsules
 */
export function capsuleVsCapsule(
  pos1X: number, pos1Z: number,
  pos2X: number, pos2Z: number,
  radius1: number,
  radius2: number
): { colliding: boolean; pushX: number; pushZ: number } {
  // Calculate distance in XZ plane
  const dx = pos2X - pos1X;
  const dz = pos2Z - pos1Z;
  const distSq = dx * dx + dz * dz;
  const minDist = radius1 + radius2;
  const minDistSq = minDist * minDist;

  if (distSq >= minDistSq || distSq < 0.0001) {
    return { colliding: false, pushX: 0, pushZ: 0 };
  }

  // Colliding - calculate push vector to separate them
  const dist = Math.sqrt(distSq);
  const overlap = minDist - dist;
  
  // Normalize direction and scale by overlap
  // Push is applied to first capsule (away from second)
  const pushX = (dx / dist) * overlap * -0.5; // Split push 50/50
  const pushZ = (dz / dist) * overlap * -0.5;

  return { colliding: true, pushX, pushZ };
}

/**
 * Sphere vs axis-aligned box collision test.
 *
 * @param sx, sy, sz   Sphere center
 * @param sRadius      Sphere radius
 * @param bx, by, bz   Box center
 * @param bHalf        Box half-extent (assumes uniform cube)
 * @returns true if the sphere overlaps the box
 */
export function sphereVsAABB(
  sx: number, sy: number, sz: number, sRadius: number,
  bx: number, by: number, bz: number, bHalf: number
): boolean {
  // Find the closest point on the AABB to the sphere center
  const closestX = Math.max(bx - bHalf, Math.min(sx, bx + bHalf));
  const closestY = Math.max(by - bHalf, Math.min(sy, by + bHalf));
  const closestZ = Math.max(bz - bHalf, Math.min(sz, bz + bHalf));

  // Distance from closest point to sphere center
  const dx = sx - closestX;
  const dy = sy - closestY;
  const dz = sz - closestZ;

  return (dx * dx + dy * dy + dz * dz) <= (sRadius * sRadius);
}

/**
 * Ray vs axis-aligned box intersection test (swept collision).
 * Uses slab method for efficient ray-box intersection.
 *
 * @param rayOriginX, Y, Z   Ray start position
 * @param rayDirX, Y, Z      Ray direction (normalized)
 * @param rayLength          Maximum ray distance
 * @param boxCenterX, Y, Z   Box center
 * @param boxHalf            Box half-extent (assumes uniform cube)
 * @returns { hit: boolean, distance: number } - distance is only valid if hit is true
 */
export function rayVsAABB(
  rayOriginX: number, rayOriginY: number, rayOriginZ: number,
  rayDirX: number, rayDirY: number, rayDirZ: number,
  rayLength: number,
  boxCenterX: number, boxCenterY: number, boxCenterZ: number,
  boxHalf: number
): { hit: boolean; distance: number } {
  // Box bounds
  const minX = boxCenterX - boxHalf;
  const maxX = boxCenterX + boxHalf;
  const minY = boxCenterY - boxHalf;
  const maxY = boxCenterY + boxHalf;
  const minZ = boxCenterZ - boxHalf;
  const maxZ = boxCenterZ + boxHalf;

  let tmin = 0;
  let tmax = rayLength;

  // X slab
  if (Math.abs(rayDirX) < 1e-8) {
    // Ray parallel to X slab
    if (rayOriginX < minX || rayOriginX > maxX) {
      return { hit: false, distance: 0 };
    }
  } else {
    const invDirX = 1.0 / rayDirX;
    let t1 = (minX - rayOriginX) * invDirX;
    let t2 = (maxX - rayOriginX) * invDirX;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return { hit: false, distance: 0 };
  }

  // Y slab
  if (Math.abs(rayDirY) < 1e-8) {
    if (rayOriginY < minY || rayOriginY > maxY) {
      return { hit: false, distance: 0 };
    }
  } else {
    const invDirY = 1.0 / rayDirY;
    let t1 = (minY - rayOriginY) * invDirY;
    let t2 = (maxY - rayOriginY) * invDirY;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return { hit: false, distance: 0 };
  }

  // Z slab
  if (Math.abs(rayDirZ) < 1e-8) {
    if (rayOriginZ < minZ || rayOriginZ > maxZ) {
      return { hit: false, distance: 0 };
    }
  } else {
    const invDirZ = 1.0 / rayDirZ;
    let t1 = (minZ - rayOriginZ) * invDirZ;
    let t2 = (maxZ - rayOriginZ) * invDirZ;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return { hit: false, distance: 0 };
  }

  // Hit if tmin is within [0, rayLength]
  if (tmin >= 0 && tmin <= rayLength) {
    return { hit: true, distance: tmin };
  }

  return { hit: false, distance: 0 };
}

/**
 * Voxel collision utilities for level terrain.
 */

import { VOXEL_WIDTH, VOXEL_HEIGHT, VOXEL_DEPTH, LEVEL_OFFSET_X, LEVEL_OFFSET_Y, LEVEL_OFFSET_Z } from './levelgen/VoxelGrid.js';

type VoxelGridLike = { getVoxel(x: number, y: number, z: number): boolean; getOffset?(): { offsetX: number; offsetZ: number } };

function getGridOffset(grid: VoxelGridLike): { offsetX: number; offsetZ: number } {
  if (grid.getOffset) return grid.getOffset();
  return { offsetX: LEVEL_OFFSET_X, offsetZ: LEVEL_OFFSET_Z };
}

/**
 * Check if a point in world space is inside a solid voxel.
 */
export function pointInVoxel(grid: VoxelGridLike, worldX: number, worldY: number, worldZ: number): boolean {
  const { offsetX, offsetZ } = getGridOffset(grid);
  const gridX = worldX - offsetX;
  const gridY = worldY - LEVEL_OFFSET_Y;
  const gridZ = worldZ - offsetZ;

  const voxelX = Math.floor(gridX / VOXEL_WIDTH);
  const voxelY = Math.floor(gridY / VOXEL_HEIGHT);
  const voxelZ = Math.floor(gridZ / VOXEL_DEPTH);
  return grid.getVoxel(voxelX, voxelY, voxelZ);
}

/**
 * Check if an AABB intersects any solid voxels in the grid.
 * Returns true if collision detected.
 *
 * @param grid VoxelGrid or MultiTileVoxelGrid to test against
 * @param centerX, centerY, centerZ Box center in world space
 * @param halfX, halfY, halfZ Box half-extents (not necessarily uniform)
 */
export function aabbVsVoxelGrid(
  grid: VoxelGridLike,
  centerX: number,
  centerY: number,
  centerZ: number,
  halfX: number,
  halfY: number,
  halfZ: number
): boolean {
  const { offsetX, offsetZ } = getGridOffset(grid);
  const gridCenterX = centerX - offsetX;
  const gridCenterY = centerY - LEVEL_OFFSET_Y;
  const gridCenterZ = centerZ - offsetZ;

  const minX = gridCenterX - halfX;
  const maxX = gridCenterX + halfX;
  const minY = gridCenterY - halfY;
  const maxY = gridCenterY + halfY;
  const minZ = gridCenterZ - halfZ;
  const maxZ = gridCenterZ + halfZ;

  const voxelMinX = Math.floor(minX / VOXEL_WIDTH);
  const voxelMaxX = Math.floor(maxX / VOXEL_WIDTH);
  const voxelMinY = Math.floor(minY / VOXEL_HEIGHT);
  const voxelMaxY = Math.floor(maxY / VOXEL_HEIGHT);
  const voxelMinZ = Math.floor(minZ / VOXEL_DEPTH);
  const voxelMaxZ = Math.floor(maxZ / VOXEL_DEPTH);

  for (let x = voxelMinX; x <= voxelMaxX; x++) {
    for (let y = voxelMinY; y <= voxelMaxY; y++) {
      for (let z = voxelMinZ; z <= voxelMaxZ; z++) {
        if (grid.getVoxel(x, y, z)) {
          const voxelCenterX = (x + 0.5) * VOXEL_WIDTH;
          const voxelCenterY = (y + 0.5) * VOXEL_HEIGHT;
          const voxelCenterZ = (z + 0.5) * VOXEL_DEPTH;

          if (
            Math.abs(gridCenterX - voxelCenterX) < halfX + VOXEL_WIDTH * 0.5 &&
            Math.abs(gridCenterY - voxelCenterY) < halfY + VOXEL_HEIGHT * 0.5 &&
            Math.abs(gridCenterZ - voxelCenterZ) < halfZ + VOXEL_DEPTH * 0.5
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Raycast through voxel grid for projectile collision.
 * Uses DDA (Digital Differential Analyzer) algorithm for fast voxel traversal.
 *
 * @returns { hit: boolean, distance: number, voxelX, voxelY, voxelZ } - hit voxel coordinates if collision
 */
export function rayVsVoxelGrid(
  grid: VoxelGridLike,
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDist: number
): { hit: boolean; distance: number; voxelX?: number; voxelY?: number; voxelZ?: number } {
  const { offsetX, offsetZ } = getGridOffset(grid);
  const gridOriginX = originX - offsetX;
  const gridOriginY = originY - LEVEL_OFFSET_Y;
  const gridOriginZ = originZ - offsetZ;

  // Normalize direction
  const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (len < 1e-8) return { hit: false, distance: 0 };
  dirX = dirX / len;
  dirY = dirY / len;
  dirZ = dirZ / len;

  // DDA setup
  let x = Math.floor(gridOriginX / VOXEL_WIDTH);
  let y = Math.floor(gridOriginY / VOXEL_HEIGHT);
  let z = Math.floor(gridOriginZ / VOXEL_DEPTH);

  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const stepZ = dirZ > 0 ? 1 : -1;

  const deltaX = dirX === 0 ? 1e30 : Math.abs(VOXEL_WIDTH / dirX);
  const deltaY = dirY === 0 ? 1e30 : Math.abs(VOXEL_HEIGHT / dirY);
  const deltaZ = dirZ === 0 ? 1e30 : Math.abs(VOXEL_DEPTH / dirZ);

  let tMaxX = dirX === 0 ? 1e30 : ((dirX > 0 ? (x + 1) * VOXEL_WIDTH : x * VOXEL_WIDTH) - gridOriginX) / dirX;
  let tMaxY = dirY === 0 ? 1e30 : ((dirY > 0 ? (y + 1) * VOXEL_HEIGHT : y * VOXEL_HEIGHT) - gridOriginY) / dirY;
  let tMaxZ = dirZ === 0 ? 1e30 : ((dirZ > 0 ? (z + 1) * VOXEL_DEPTH : z * VOXEL_DEPTH) - gridOriginZ) / dirZ;

  let dist = 0;

  // Traverse voxels (400 covers ~600 world units at 2 units/voxel)
  for (let i = 0; i < 400; i++) {
    // Check current voxel
    if (grid.getVoxel(x, y, z)) {
      return { hit: true, distance: dist, voxelX: x, voxelY: y, voxelZ: z };
    }

    // Step to next voxel
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      dist = tMaxX;
      if (dist > maxDist) break;
      x += stepX;
      tMaxX += deltaX;
    } else if (tMaxY < tMaxZ) {
      dist = tMaxY;
      if (dist > maxDist) break;
      y += stepY;
      tMaxY += deltaY;
    } else {
      dist = tMaxZ;
      if (dist > maxDist) break;
      z += stepZ;
      tMaxZ += deltaZ;
    }
  }

  return { hit: false, distance: 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// Tree Collision (Static Cylindrical Volumes)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tree collision volume represented as a vertical cylinder.
 */
export interface TreeCollider {
  /** Tree position in world space (base of tree) */
  x: number;
  y: number;
  z: number;
  /** Collision cylinder radius (XZ plane) */
  radius: number;
  /** Collision cylinder height */
  height: number;
}

/**
 * Check capsule vs tree cylinder collision and return push-out vector if colliding.
 * Used by character controller to avoid walking through trees.
 * 
 * @param capsuleX, capsuleZ Player capsule position (XZ)
 * @param capsuleRadius Player capsule radius
 * @param tree Tree collision cylinder
 * @returns { colliding: boolean, pushX: number, pushZ: number } - push vector to move capsule out
 */
export function capsuleVsTreeCylinder(
  capsuleX: number,
  capsuleZ: number,
  capsuleRadius: number,
  tree: TreeCollider
): { colliding: boolean; pushX: number; pushZ: number } {
  // Calculate XZ distance between capsule and tree
  const dx = capsuleX - tree.x;
  const dz = capsuleZ - tree.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  // Combined radius
  const combinedRadius = capsuleRadius + tree.radius;
  
  if (dist < combinedRadius && dist > 0.001) {
    // Colliding - push capsule away from tree
    const pushDist = combinedRadius - dist;
    const pushX = (dx / dist) * pushDist;
    const pushZ = (dz / dist) * pushDist;
    
    return { colliding: true, pushX, pushZ };
  }
  
  return { colliding: false, pushX: 0, pushZ: 0 };
}

/**
 * Ray-triangle intersection using Möller-Trumbore algorithm.
 * Fast, deterministic, and widely used in ray tracing.
 * 
 * @param rayOrigin Ray starting point [x, y, z]
 * @param rayDir Ray direction [x, y, z] (should be normalized)
 * @param v0 Triangle vertex 0 [x, y, z]
 * @param v1 Triangle vertex 1 [x, y, z]
 * @param v2 Triangle vertex 2 [x, y, z]
 * @param maxDist Maximum ray distance
 * @returns Hit result with distance and normal
 */
export function rayVsTriangle(
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  maxDist: number
): { hit: boolean; distance: number; normal?: [number, number, number] } {
  const EPSILON = 1e-8;
  
  // Edge vectors
  const edge1X = v1[0] - v0[0];
  const edge1Y = v1[1] - v0[1];
  const edge1Z = v1[2] - v0[2];
  
  const edge2X = v2[0] - v0[0];
  const edge2Y = v2[1] - v0[1];
  const edge2Z = v2[2] - v0[2];
  
  // Cross product: rayDir × edge2
  const hX = rayDir[1] * edge2Z - rayDir[2] * edge2Y;
  const hY = rayDir[2] * edge2X - rayDir[0] * edge2Z;
  const hZ = rayDir[0] * edge2Y - rayDir[1] * edge2X;
  
  // Dot product: edge1 · h
  const a = edge1X * hX + edge1Y * hY + edge1Z * hZ;
  
  // Ray parallel to triangle
  if (a > -EPSILON && a < EPSILON) {
    return { hit: false, distance: 0 };
  }
  
  const f = 1.0 / a;
  
  // Vector from v0 to ray origin
  const sX = rayOrigin[0] - v0[0];
  const sY = rayOrigin[1] - v0[1];
  const sZ = rayOrigin[2] - v0[2];
  
  // Barycentric coordinate u
  const u = f * (sX * hX + sY * hY + sZ * hZ);
  
  if (u < 0.0 || u > 1.0) {
    return { hit: false, distance: 0 };
  }
  
  // Cross product: s × edge1
  const qX = sY * edge1Z - sZ * edge1Y;
  const qY = sZ * edge1X - sX * edge1Z;
  const qZ = sX * edge1Y - sY * edge1X;
  
  // Barycentric coordinate v
  const v = f * (rayDir[0] * qX + rayDir[1] * qY + rayDir[2] * qZ);
  
  if (v < 0.0 || u + v > 1.0) {
    return { hit: false, distance: 0 };
  }
  
  // Distance along ray
  const t = f * (edge2X * qX + edge2Y * qY + edge2Z * qZ);
  
  if (t > EPSILON && t <= maxDist) {
    // Calculate triangle normal (edge1 × edge2)
    const nX = edge1Y * edge2Z - edge1Z * edge2Y;
    const nY = edge1Z * edge2X - edge1X * edge2Z;
    const nZ = edge1X * edge2Y - edge1Y * edge2X;
    
    // Normalize normal
    const nLen = Math.sqrt(nX * nX + nY * nY + nZ * nZ);
    const normal: [number, number, number] = [
      nX / nLen,
      nY / nLen,
      nZ / nLen
    ];
    
    return { hit: true, distance: t, normal };
  }
  
  return { hit: false, distance: 0 };
}

/**
 * Ray vs triangle mesh collision detection.
 * Tests ray against all triangles in mesh and returns closest hit.
 * 
 * @param rayOrigin Ray starting point in world space [x, y, z]
 * @param rayDir Ray direction in world space [x, y, z] (normalized)
 * @param mesh Triangle mesh to test against
 * @param transform Rock transform (position, rotation, scale)
 * @param maxDist Maximum ray distance
 * @returns Closest hit result
 */
export function rayVsTriangleMesh(
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  mesh: { vertices: Float32Array; indices: Uint32Array; bounds: RockBounds },
  transform: { posX: number; posY: number; posZ: number; rotY: number; scale: number },
  maxDist: number
): { hit: boolean; distance: number; hitPoint?: [number, number, number] } {
  // Transform ray to local space
  const localOrigin = inverseTransformPoint(rayOrigin[0], rayOrigin[1], rayOrigin[2], transform, mesh.bounds);
  const localDir = inverseTransformDirection(rayDir[0], rayDir[1], rayDir[2], transform);
  
  // Normalize local direction
  const localDirLen = Math.sqrt(localDir[0] * localDir[0] + localDir[1] * localDir[1] + localDir[2] * localDir[2]);
  const localDirNorm: [number, number, number] = [
    localDir[0] / localDirLen,
    localDir[1] / localDirLen,
    localDir[2] / localDirLen
  ];
  
  // Scale maxDist for local space
  const localMaxDist = maxDist * localDirLen;
  
  let closestHit = false;
  let closestDist = Infinity;
  
  const triangleCount = mesh.indices.length / 3;
  
  // Test all triangles
  for (let t = 0; t < triangleCount; t++) {
    const i0 = mesh.indices[t * 3 + 0];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    
    const v0: [number, number, number] = [
      mesh.vertices[i0 * 3 + 0],
      mesh.vertices[i0 * 3 + 1],
      mesh.vertices[i0 * 3 + 2]
    ];
    
    const v1: [number, number, number] = [
      mesh.vertices[i1 * 3 + 0],
      mesh.vertices[i1 * 3 + 1],
      mesh.vertices[i1 * 3 + 2]
    ];
    
    const v2: [number, number, number] = [
      mesh.vertices[i2 * 3 + 0],
      mesh.vertices[i2 * 3 + 1],
      mesh.vertices[i2 * 3 + 2]
    ];
    
    const result = rayVsTriangle(localOrigin, localDirNorm, v0, v1, v2, localMaxDist);
    
    if (result.hit && result.distance < closestDist) {
      closestHit = true;
      closestDist = result.distance;
    }
  }
  
  if (closestHit) {
    // Convert distance back to world space
    const worldDist = closestDist / localDirLen;
    
    // Calculate hit point in world space
    const hitPoint: [number, number, number] = [
      rayOrigin[0] + rayDir[0] * worldDist,
      rayOrigin[1] + rayDir[1] * worldDist,
      rayOrigin[2] + rayDir[2] * worldDist
    ];
    
    return { hit: true, distance: worldDist, hitPoint };
  }
  
  return { hit: false, distance: 0 };
}

/**
 * Point vs triangle closest point calculation.
 * Used for capsule-triangle collision.
 * 
 * @param p Point [x, y, z]
 * @param v0 Triangle vertex 0 [x, y, z]
 * @param v1 Triangle vertex 1 [x, y, z]
 * @param v2 Triangle vertex 2 [x, y, z]
 * @returns Closest point on triangle to p
 */
function closestPointOnTriangle(
  p: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): [number, number, number] {
  // Vector from v0 to point
  const v0pX = p[0] - v0[0];
  const v0pY = p[1] - v0[1];
  const v0pZ = p[2] - v0[2];
  
  // Edge vectors
  const edge1X = v1[0] - v0[0];
  const edge1Y = v1[1] - v0[1];
  const edge1Z = v1[2] - v0[2];
  
  const edge2X = v2[0] - v0[0];
  const edge2Y = v2[1] - v0[1];
  const edge2Z = v2[2] - v0[2];
  
  // Dot products
  const d1 = edge1X * v0pX + edge1Y * v0pY + edge1Z * v0pZ;
  const d2 = edge2X * v0pX + edge2Y * v0pY + edge2Z * v0pZ;
  
  // Check if closest point is v0
  if (d1 <= 0.0 && d2 <= 0.0) {
    return v0;
  }
  
  // Check if closest point is on edge v0-v1
  const v1pX = p[0] - v1[0];
  const v1pY = p[1] - v1[1];
  const v1pZ = p[2] - v1[2];
  
  const d3 = edge1X * v1pX + edge1Y * v1pY + edge1Z * v1pZ;
  const d4 = edge2X * v1pX + edge2Y * v1pY + edge2Z * v1pZ;
  
  if (d3 >= 0.0 && d4 <= d3) {
    return v1;
  }
  
  // Check if closest point is on edge v0-v1
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    const vParam = d1 / (d1 - d3);
    return [
      v0[0] + vParam * edge1X,
      v0[1] + vParam * edge1Y,
      v0[2] + vParam * edge1Z
    ];
  }
  
  // Check if closest point is v2
  const v2pX = p[0] - v2[0];
  const v2pY = p[1] - v2[1];
  const v2pZ = p[2] - v2[2];
  
  const d5 = edge1X * v2pX + edge1Y * v2pY + edge1Z * v2pZ;
  const d6 = edge2X * v2pX + edge2Y * v2pY + edge2Z * v2pZ;
  
  if (d6 >= 0.0 && d5 <= d6) {
    return v2;
  }
  
  // Check if closest point is on edge v0-v2
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    const wParam = d2 / (d2 - d6);
    return [
      v0[0] + wParam * edge2X,
      v0[1] + wParam * edge2Y,
      v0[2] + wParam * edge2Z
    ];
  }
  
  // Check if closest point is on edge v1-v2
  const va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    const wParam = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return [
      v1[0] + wParam * (v2[0] - v1[0]),
      v1[1] + wParam * (v2[1] - v1[1]),
      v1[2] + wParam * (v2[2] - v1[2])
    ];
  }
  
  // Point is inside triangle
  const denom = 1.0 / (va + vb + vc);
  const vCoord = vb * denom;
  const wCoord = vc * denom;
  
  return [
    v0[0] + edge1X * vCoord + edge2X * wCoord,
    v0[1] + edge1Y * vCoord + edge2Y * wCoord,
    v0[2] + edge1Z * vCoord + edge2Z * wCoord
  ];
}

/**
 * Capsule vs triangle mesh collision detection.
 * Simplified capsule as sphere for now (treating it as player center point + radius).
 * 
 * @param capsuleX Capsule center X in world space
 * @param capsuleY Capsule center Y in world space
 * @param capsuleZ Capsule center Z in world space
 * @param capsuleRadius Capsule radius
 * @param capsuleHeight Capsule height (unused in simplified version)
 * @param mesh Triangle mesh to test against
 * @param transform Rock transform (position, rotation, scale)
 * @returns Collision result with push-out vector
 */
/**
 * Capsule vs tree mesh collision (tree-specific coordinate system).
 * Trees use voxel grid coordinates (0-50 range) with specific centering offsets.
 */
export function capsuleVsTreeMesh(
  capsuleX: number,
  capsuleY: number,
  capsuleZ: number,
  capsuleRadius: number,
  _capsuleHeight: number,
  mesh: { vertices: Float32Array; indices: Uint32Array },
  transform: TreeTransform
): { colliding: boolean; pushX: number; pushY: number; pushZ: number } {
  // Tree coordinate system constants (must match visual rendering)
  const TREE_GRID_SIZE = 50;
  const TREE_VOXEL_SIZE = 0.5;
  const halfGrid = TREE_GRID_SIZE * TREE_VOXEL_SIZE * 0.5; // 12.5
  const yOffset = 2 * TREE_VOXEL_SIZE; // 1.0
  
  // Transform capsule to tree local space
  // Inverse of: worldPos = (localPos - offset) * scale + transform.pos
  const { posX, posY, posZ, rotY, scale } = transform;
  
  // Inverse translate
  let tx = capsuleX - posX;
  let ty = capsuleY - posY;
  let tz = capsuleZ - posZ;
  
  // Inverse rotate
  const cosY = Math.cos(-rotY);
  const sinY = Math.sin(-rotY);
  const rx = tx * cosY - tz * sinY;
  const rz = tx * sinY + tz * cosY;
  
  // Inverse scale and add centering offset to get voxel grid coordinates
  const localX = (rx / scale) + halfGrid;
  const localY = (ty / scale) + yOffset;
  const localZ = (rz / scale) + halfGrid;
  
  const localRadius = capsuleRadius / scale;
  const localCenter: [number, number, number] = [localX, localY, localZ];
  
  let totalPushX = 0;
  let totalPushY = 0;
  let totalPushZ = 0;
  let collisionCount = 0;
  
  const triangleCount = mesh.indices.length / 3;
  
  // Test all triangles
  for (let t = 0; t < triangleCount; t++) {
    const i0 = mesh.indices[t * 3 + 0];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    
    const v0: [number, number, number] = [
      mesh.vertices[i0 * 3 + 0],
      mesh.vertices[i0 * 3 + 1],
      mesh.vertices[i0 * 3 + 2]
    ];
    
    const v1: [number, number, number] = [
      mesh.vertices[i1 * 3 + 0],
      mesh.vertices[i1 * 3 + 1],
      mesh.vertices[i1 * 3 + 2]
    ];
    
    const v2: [number, number, number] = [
      mesh.vertices[i2 * 3 + 0],
      mesh.vertices[i2 * 3 + 1],
      mesh.vertices[i2 * 3 + 2]
    ];
    
    const closest = closestPointOnTriangle(localCenter, v0, v1, v2);
    
    const dx = localCenter[0] - closest[0];
    const dy = localCenter[1] - closest[1];
    const dz = localCenter[2] - closest[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    
    if (distSq < localRadius * localRadius && distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const penetration = localRadius - dist;
      
      const pushX = (dx / dist) * penetration;
      const pushY = (dy / dist) * penetration;
      const pushZ = (dz / dist) * penetration;
      
      totalPushX += pushX;
      totalPushY += pushY;
      totalPushZ += pushZ;
      collisionCount++;
    }
  }
  
  if (collisionCount > 0) {
    const avgPushX = totalPushX / collisionCount;
    const avgPushY = totalPushY / collisionCount;
    const avgPushZ = totalPushZ / collisionCount;
    
    // Transform push back to world space (forward rotation, not inverse)
    const scaledX = avgPushX * scale;
    const scaledY = avgPushY * scale;
    const scaledZ = avgPushZ * scale;
    
    const fwdCosY = Math.cos(rotY);
    const fwdSinY = Math.sin(rotY);
    const worldPushX = scaledX * fwdCosY - scaledZ * fwdSinY;
    const worldPushZ = scaledX * fwdSinY + scaledZ * fwdCosY;
    
    return {
      colliding: true,
      pushX: worldPushX,
      pushY: scaledY,
      pushZ: worldPushZ
    };
  }
  
  return { colliding: false, pushX: 0, pushY: 0, pushZ: 0 };
}

export function capsuleVsTriangleMesh(
  capsuleX: number,
  capsuleY: number,
  capsuleZ: number,
  capsuleRadius: number,
  _capsuleHeight: number,
  mesh: { vertices: Float32Array; indices: Uint32Array; bounds: RockBounds },
  transform: { posX: number; posY: number; posZ: number; rotY: number; scale: number }
): { colliding: boolean; pushX: number; pushY: number; pushZ: number } {
  // Transform capsule center to local space (rock-specific, bounds-centered)
  const localCenter = inverseTransformPoint(capsuleX, capsuleY, capsuleZ, transform, mesh.bounds);
  
  // Scale radius to local space
  const localRadius = capsuleRadius / transform.scale;
  
  let totalPushX = 0;
  let totalPushY = 0;
  let totalPushZ = 0;
  let collisionCount = 0;
  
  const triangleCount = mesh.indices.length / 3;
  
  // Test all triangles
  for (let t = 0; t < triangleCount; t++) {
    const i0 = mesh.indices[t * 3 + 0];
    const i1 = mesh.indices[t * 3 + 1];
    const i2 = mesh.indices[t * 3 + 2];
    
    const v0: [number, number, number] = [
      mesh.vertices[i0 * 3 + 0],
      mesh.vertices[i0 * 3 + 1],
      mesh.vertices[i0 * 3 + 2]
    ];
    
    const v1: [number, number, number] = [
      mesh.vertices[i1 * 3 + 0],
      mesh.vertices[i1 * 3 + 1],
      mesh.vertices[i1 * 3 + 2]
    ];
    
    const v2: [number, number, number] = [
      mesh.vertices[i2 * 3 + 0],
      mesh.vertices[i2 * 3 + 1],
      mesh.vertices[i2 * 3 + 2]
    ];
    
    // Find closest point on triangle to capsule center
    const closest = closestPointOnTriangle(localCenter, v0, v1, v2);
    
    // Distance from capsule center to closest point
    const dx = localCenter[0] - closest[0];
    const dy = localCenter[1] - closest[1];
    const dz = localCenter[2] - closest[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    
    // Check if within radius
    if (distSq < localRadius * localRadius && distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const penetration = localRadius - dist;
      
      // Push direction (away from triangle)
      const pushX = (dx / dist) * penetration;
      const pushY = (dy / dist) * penetration;
      const pushZ = (dz / dist) * penetration;
      
      totalPushX += pushX;
      totalPushY += pushY;
      totalPushZ += pushZ;
      collisionCount++;
    }
  }
  
  if (collisionCount > 0) {
    // Average push vectors and transform back to world space
    const avgPushX = totalPushX / collisionCount;
    const avgPushY = totalPushY / collisionCount;
    const avgPushZ = totalPushZ / collisionCount;
    
    // Transform push vector to world space (apply scale and rotation)
    const { rotY, scale } = transform;
    
    // Apply scale
    const scaledX = avgPushX * scale;
    const scaledY = avgPushY * scale;
    const scaledZ = avgPushZ * scale;
    
    // Apply rotation
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const worldPushX = scaledX * cosY - scaledZ * sinY;
    const worldPushZ = scaledX * sinY + scaledZ * cosY;
    
    return {
      colliding: true,
      pushX: worldPushX,
      pushY: scaledY,
      pushZ: worldPushZ
    };
  }
  
  return { colliding: false, pushX: 0, pushY: 0, pushZ: 0 };
}
