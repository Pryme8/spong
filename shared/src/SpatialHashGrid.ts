/**
 * Spatial hash grid for broad-phase collision culling.
 * 
 * Supports both area queries (player physics) and ray queries (projectiles, explosions).
 * Uses integer hash keys for O(1) lookup performance.
 */

import type { ObjectCollider } from './CollisionVoxelGrid.js';

/**
 * Spatial hash grid for fast spatial queries.
 * Divides world space into uniform cells and maps objects to cells.
 */
export class SpatialHashGrid {
  private cellSize: number;
  private cells: Map<number, ObjectCollider[]>;
  private colliderCells: Map<number, number[]>; // objectId -> cell hashes

  constructor(cellSize: number = 10) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.colliderCells = new Map();
  }

  /**
   * Integer hash function for cell coordinates.
   * Maps (cellX, cellZ) to a unique integer hash.
   */
  private hashCell(cellX: number, cellZ: number): number {
    // Large primes for good distribution
    return (cellX * 73856093) ^ (cellZ * 19349663);
  }

  /**
   * Insert an ObjectCollider into the spatial hash.
   * Computes world-space bounds and inserts into all overlapping cells.
   */
  insert(collider: ObjectCollider): void {
    // Compute world-space AABB from tight bounds + transform
    const { transform, grid } = collider;
    
    // Transform local tight bounds to world space
    // Account for rotation by expanding bounds
    const cosR = Math.cos(transform.rotY);
    const sinR = Math.sin(transform.rotY);
    const absCos = Math.abs(cosR);
    const absSin = Math.abs(sinR);
    
    // Expanded half-extents in world space
    const localHalfX = grid.tightHalfX * transform.scale;
    const localHalfY = grid.tightHalfY * transform.scale;
    const localHalfZ = grid.tightHalfZ * transform.scale;
    
    const worldHalfX = localHalfX * absCos + localHalfZ * absSin;
    const worldHalfY = localHalfY;
    const worldHalfZ = localHalfX * absSin + localHalfZ * absCos;
    
    // World-space AABB
    collider.worldMinX = transform.posX - worldHalfX;
    collider.worldMaxX = transform.posX + worldHalfX;
    collider.worldMinY = transform.posY - worldHalfY;
    collider.worldMaxY = transform.posY + worldHalfY;
    collider.worldMinZ = transform.posZ - worldHalfZ;
    collider.worldMaxZ = transform.posZ + worldHalfZ;
    
    // Compute cell range this AABB overlaps (XZ plane only)
    const minCellX = Math.floor(collider.worldMinX / this.cellSize);
    const maxCellX = Math.floor(collider.worldMaxX / this.cellSize);
    const minCellZ = Math.floor(collider.worldMinZ / this.cellSize);
    const maxCellZ = Math.floor(collider.worldMaxZ / this.cellSize);
    
    // Insert into all overlapping cells
    const cellHashes: number[] = [];
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const hash = this.hashCell(cx, cz);
        cellHashes.push(hash);
        
        if (!this.cells.has(hash)) {
          this.cells.set(hash, []);
        }
        this.cells.get(hash)!.push(collider);
      }
    }
    
    // Track cells this collider is in (for removal)
    this.colliderCells.set(collider.id, cellHashes);
  }

  /**
   * Remove an ObjectCollider from the spatial hash.
   * Used for dynamic objects.
   */
  remove(collider: ObjectCollider): void {
    const cellHashes = this.colliderCells.get(collider.id);
    if (!cellHashes) return;
    
    for (const hash of cellHashes) {
      const cellList = this.cells.get(hash);
      if (cellList) {
        const index = cellList.indexOf(collider);
        if (index !== -1) {
          cellList.splice(index, 1);
        }
        // Remove empty cells to save memory
        if (cellList.length === 0) {
          this.cells.delete(hash);
        }
      }
    }
    
    this.colliderCells.delete(collider.id);
  }

  /**
   * Area query: all objects whose world AABB overlaps a circle (XZ plane).
   * Used by stepCharacter (player physics).
   * 
   * @param x Center X
   * @param z Center Z
   * @param radius Query radius
   * @returns Array of unique colliders (no duplicates)
   */
  query(x: number, z: number, radius: number): ObjectCollider[] {
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellZ = Math.floor((z - radius) / this.cellSize);
    const maxCellZ = Math.floor((z + radius) / this.cellSize);
    
    const seen = new Set<number>();
    const results: ObjectCollider[] = [];
    
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const hash = this.hashCell(cx, cz);
        const cellList = this.cells.get(hash);
        
        if (cellList) {
          for (const collider of cellList) {
            if (!seen.has(collider.id)) {
              seen.add(collider.id);
              results.push(collider);
            }
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Ray query: all objects whose world AABB intersects a ray.
   * Used by projectiles and explosions from ANY world position.
   * 
   * Returns objects sorted by distance along ray (nearest first).
   * 
   * @param originX Ray origin X
   * @param originY Ray origin Y
   * @param originZ Ray origin Z
   * @param dirX Ray direction X (normalized)
   * @param dirY Ray direction Y (normalized)
   * @param dirZ Ray direction Z (normalized)
   * @param maxDist Maximum ray distance
   * @returns Array of colliders sorted by distance
   */
  queryRay(
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
    maxDist: number
  ): ObjectCollider[] {
    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len < 1e-8) return [];
    dirX = dirX / len;
    dirY = dirY / len;
    dirZ = dirZ / len;
    
    // DDA traversal through spatial grid cells (XZ plane only)
    const startCellX = Math.floor(originX / this.cellSize);
    const startCellZ = Math.floor(originZ / this.cellSize);
    
    const endX = originX + dirX * maxDist;
    const endZ = originZ + dirZ * maxDist;
    const endCellX = Math.floor(endX / this.cellSize);
    const endCellZ = Math.floor(endZ / this.cellSize);
    
    const stepX = dirX > 0 ? 1 : -1;
    const stepZ = dirZ > 0 ? 1 : -1;
    
    const deltaX = dirX === 0 ? 1e30 : Math.abs(this.cellSize / dirX);
    const deltaZ = dirZ === 0 ? 1e30 : Math.abs(this.cellSize / dirZ);
    
    let cellX = startCellX;
    let cellZ = startCellZ;
    
    let tMaxX = dirX === 0 ? 1e30 : ((dirX > 0 ? (cellX + 1) * this.cellSize : cellX * this.cellSize) - originX) / dirX;
    let tMaxZ = dirZ === 0 ? 1e30 : ((dirZ > 0 ? (cellZ + 1) * this.cellSize : cellZ * this.cellSize) - originZ) / dirZ;
    
    const seen = new Set<number>();
    const candidates: Array<{ collider: ObjectCollider; distance: number }> = [];
    
    // Traverse cells along ray
    for (let i = 0; i < 1000; i++) { // Max iterations to prevent infinite loops
      // Collect colliders from current cell
      const hash = this.hashCell(cellX, cellZ);
      const cellList = this.cells.get(hash);
      
      if (cellList) {
        for (const collider of cellList) {
          if (seen.has(collider.id)) continue;
          seen.add(collider.id);
          
          // Ray vs AABB intersection test
          const dist = rayVsAABB(
            originX, originY, originZ,
            dirX, dirY, dirZ,
            maxDist,
            collider.worldMinX, collider.worldMinY, collider.worldMinZ,
            collider.worldMaxX, collider.worldMaxY, collider.worldMaxZ
          );
          
          if (dist >= 0) {
            candidates.push({ collider, distance: dist });
          }
        }
      }
      
      // Check if we've reached the end cell
      if (cellX === endCellX && cellZ === endCellZ) break;
      
      // Step to next cell
      if (tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        cellX += stepX;
        tMaxX += deltaX;
      } else {
        if (tMaxZ > maxDist) break;
        cellZ += stepZ;
        tMaxZ += deltaZ;
      }
    }
    
    // Sort by distance and return
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.map(c => c.collider);
  }
}

/**
 * Ray vs AABB intersection test using slab method.
 * Returns distance along ray if hit, -1 if miss.
 */
function rayVsAABB(
  rayOriginX: number, rayOriginY: number, rayOriginZ: number,
  rayDirX: number, rayDirY: number, rayDirZ: number,
  rayLength: number,
  boxMinX: number, boxMinY: number, boxMinZ: number,
  boxMaxX: number, boxMaxY: number, boxMaxZ: number
): number {
  let tmin = 0;
  let tmax = rayLength;

  // X slab
  if (Math.abs(rayDirX) < 1e-8) {
    if (rayOriginX < boxMinX || rayOriginX > boxMaxX) return -1;
  } else {
    const invDirX = 1.0 / rayDirX;
    let t1 = (boxMinX - rayOriginX) * invDirX;
    let t2 = (boxMaxX - rayOriginX) * invDirX;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Y slab
  if (Math.abs(rayDirY) < 1e-8) {
    if (rayOriginY < boxMinY || rayOriginY > boxMaxY) return -1;
  } else {
    const invDirY = 1.0 / rayDirY;
    let t1 = (boxMinY - rayOriginY) * invDirY;
    let t2 = (boxMaxY - rayOriginY) * invDirY;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Z slab
  if (Math.abs(rayDirZ) < 1e-8) {
    if (rayOriginZ < boxMinZ || rayOriginZ > boxMaxZ) return -1;
  } else {
    const invDirZ = 1.0 / rayDirZ;
    let t1 = (boxMinZ - rayOriginZ) * invDirZ;
    let t2 = (boxMaxZ - rayOriginZ) * invDirZ;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Hit if tmin is within [0, rayLength]
  if (tmin >= 0 && tmin <= rayLength) {
    return tmin;
  }

  return -1;
}
