/**
 * Octree spatial partitioning for fast broad-phase collision culling.
 * Divides space hierarchically to quickly find nearby objects.
 */

/**
 * Entry stored in the octree.
 * Contains object metadata and its bounding box.
 */
export interface OctreeEntry {
  id: number;           // unique ID
  type: string;         // 'tree', 'rock', 'bush', etc.
  data: any;           // the actual collider data (mesh + transform, etc.)
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Octree node (internal).
 * Either a leaf (stores entries) or a branch (has 8 children).
 */
class OctreeNode {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly halfSize: number;
  readonly depth: number;
  
  entries: OctreeEntry[] = [];
  children: OctreeNode[] | null = null;
  
  constructor(centerX: number, centerY: number, centerZ: number, halfSize: number, depth: number) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.centerZ = centerZ;
    this.halfSize = halfSize;
    this.depth = depth;
  }
  
  /**
   * Check if an entry's AABB overlaps this node's AABB.
   */
  intersects(entry: OctreeEntry): boolean {
    const nodeMinX = this.centerX - this.halfSize;
    const nodeMaxX = this.centerX + this.halfSize;
    const nodeMinY = this.centerY - this.halfSize;
    const nodeMaxY = this.centerY + this.halfSize;
    const nodeMinZ = this.centerZ - this.halfSize;
    const nodeMaxZ = this.centerZ + this.halfSize;
    
    return !(entry.maxX < nodeMinX || entry.minX > nodeMaxX ||
             entry.maxY < nodeMinY || entry.minY > nodeMaxY ||
             entry.maxZ < nodeMinZ || entry.minZ > nodeMaxZ);
  }
  
  /**
   * Check if a sphere overlaps this node's AABB.
   */
  intersectsSphere(x: number, y: number, z: number, radius: number): boolean {
    const nodeMinX = this.centerX - this.halfSize;
    const nodeMaxX = this.centerX + this.halfSize;
    const nodeMinY = this.centerY - this.halfSize;
    const nodeMaxY = this.centerY + this.halfSize;
    const nodeMinZ = this.centerZ - this.halfSize;
    const nodeMaxZ = this.centerZ + this.halfSize;
    
    // Find closest point on AABB to sphere center
    const closestX = Math.max(nodeMinX, Math.min(x, nodeMaxX));
    const closestY = Math.max(nodeMinY, Math.min(y, nodeMaxY));
    const closestZ = Math.max(nodeMinZ, Math.min(z, nodeMaxZ));
    
    // Distance from sphere center to closest point
    const dx = x - closestX;
    const dy = y - closestY;
    const dz = z - closestZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    
    return distSq <= radius * radius;
  }
  
  /**
   * Check if a ray intersects this node's AABB.
   * Returns true if ray potentially hits this node.
   */
  intersectsRay(
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
    maxDist: number
  ): boolean {
    const nodeMinX = this.centerX - this.halfSize;
    const nodeMaxX = this.centerX + this.halfSize;
    const nodeMinY = this.centerY - this.halfSize;
    const nodeMaxY = this.centerY + this.halfSize;
    const nodeMinZ = this.centerZ - this.halfSize;
    const nodeMaxZ = this.centerZ + this.halfSize;
    
    let tmin = 0;
    let tmax = maxDist;
    
    // X slab
    if (Math.abs(dirX) < 1e-8) {
      if (originX < nodeMinX || originX > nodeMaxX) return false;
    } else {
      const invDirX = 1.0 / dirX;
      let t1 = (nodeMinX - originX) * invDirX;
      let t2 = (nodeMaxX - originX) * invDirX;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    
    // Y slab
    if (Math.abs(dirY) < 1e-8) {
      if (originY < nodeMinY || originY > nodeMaxY) return false;
    } else {
      const invDirY = 1.0 / dirY;
      let t1 = (nodeMinY - originY) * invDirY;
      let t2 = (nodeMaxY - originY) * invDirY;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    
    // Z slab
    if (Math.abs(dirZ) < 1e-8) {
      if (originZ < nodeMinZ || originZ > nodeMaxZ) return false;
    } else {
      const invDirZ = 1.0 / dirZ;
      let t1 = (nodeMinZ - originZ) * invDirZ;
      let t2 = (nodeMaxZ - originZ) * invDirZ;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    
    return tmin >= 0 && tmin <= maxDist;
  }
}

/**
 * Octree for spatial partitioning of static level objects.
 * Both server and client build identical octrees from instance data.
 */
export class Octree {
  private root: OctreeNode;
  private maxDepth: number;
  private maxEntriesPerNode: number;
  
  /**
   * Create an octree.
   * 
   * @param centerX Root node center X
   * @param centerY Root node center Y
   * @param centerZ Root node center Z
   * @param halfSize Root node half-size (covers center ± halfSize)
   * @param maxDepth Maximum subdivision depth (default 6 = up to 64x64x64 grid)
   * @param maxEntriesPerNode Max objects per node before subdivision (default 8)
   */
  constructor(
    centerX: number,
    centerY: number,
    centerZ: number,
    halfSize: number,
    maxDepth: number = 6,
    maxEntriesPerNode: number = 8
  ) {
    this.root = new OctreeNode(centerX, centerY, centerZ, halfSize, 0);
    this.maxDepth = maxDepth;
    this.maxEntriesPerNode = maxEntriesPerNode;
  }
  
  /**
   * Insert an entry into the octree.
   */
  insert(entry: OctreeEntry): void {
    this.insertIntoNode(this.root, entry);
  }
  
  private insertIntoNode(node: OctreeNode, entry: OctreeEntry): void {
    // Check if entry overlaps this node
    if (!node.intersects(entry)) {
      return; // Entry doesn't belong in this node
    }
    
    // If this is a leaf node
    if (node.children === null) {
      node.entries.push(entry);
      
      // Check if we need to subdivide
      if (node.entries.length > this.maxEntriesPerNode && node.depth < this.maxDepth) {
        this.subdivide(node);
      }
      
      return;
    }
    
    // This is a branch - insert into children
    for (const child of node.children) {
      this.insertIntoNode(child, entry);
    }
  }
  
  private subdivide(node: OctreeNode): void {
    const quarterSize = node.halfSize * 0.5;
    const childDepth = node.depth + 1;
    
    // Create 8 children
    node.children = [
      // Bottom 4 (Y-)
      new OctreeNode(node.centerX - quarterSize, node.centerY - quarterSize, node.centerZ - quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX + quarterSize, node.centerY - quarterSize, node.centerZ - quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX - quarterSize, node.centerY - quarterSize, node.centerZ + quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX + quarterSize, node.centerY - quarterSize, node.centerZ + quarterSize, quarterSize, childDepth),
      // Top 4 (Y+)
      new OctreeNode(node.centerX - quarterSize, node.centerY + quarterSize, node.centerZ - quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX + quarterSize, node.centerY + quarterSize, node.centerZ - quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX - quarterSize, node.centerY + quarterSize, node.centerZ + quarterSize, quarterSize, childDepth),
      new OctreeNode(node.centerX + quarterSize, node.centerY + quarterSize, node.centerZ + quarterSize, quarterSize, childDepth),
    ];
    
    // Redistribute entries to children
    const oldEntries = node.entries;
    node.entries = []; // Clear parent entries
    
    for (const entry of oldEntries) {
      for (const child of node.children) {
        this.insertIntoNode(child, entry);
      }
    }
  }
  
  /**
   * Query for entries within a sphere (point + radius).
   * Used for player physics collision.
   * 
   * @param x Sphere center X
   * @param y Sphere center Y
   * @param z Sphere center Z
   * @param radius Query radius
   * @returns Array of entries whose AABB overlaps the sphere
   */
  queryPoint(x: number, y: number, z: number, radius: number): OctreeEntry[] {
    const results: OctreeEntry[] = [];
    const seen = new Set<number>();
    this.queryPointRecursive(this.root, x, y, z, radius, results, seen);
    return results;
  }
  
  private queryPointRecursive(
    node: OctreeNode,
    x: number, y: number, z: number, radius: number,
    results: OctreeEntry[],
    seen: Set<number>
  ): void {
    // Check if query sphere overlaps this node
    if (!node.intersectsSphere(x, y, z, radius)) {
      return;
    }
    
    // If leaf, check entries
    if (node.children === null) {
      for (const entry of node.entries) {
        if (seen.has(entry.id)) continue; // Already added
        
        // Check if entry AABB overlaps query sphere (refined check)
        if (this.aabbIntersectsSphere(entry, x, y, z, radius)) {
          results.push(entry);
          seen.add(entry.id);
        }
      }
      return;
    }
    
    // Branch - recurse into children
    for (const child of node.children) {
      this.queryPointRecursive(child, x, y, z, radius, results, seen);
    }
  }
  
  private aabbIntersectsSphere(
    entry: OctreeEntry,
    x: number, y: number, z: number, radius: number
  ): boolean {
    // Find closest point on AABB to sphere center
    const closestX = Math.max(entry.minX, Math.min(x, entry.maxX));
    const closestY = Math.max(entry.minY, Math.min(y, entry.maxY));
    const closestZ = Math.max(entry.minZ, Math.min(z, entry.maxZ));
    
    const dx = x - closestX;
    const dy = y - closestY;
    const dz = z - closestZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    
    return distSq <= radius * radius;
  }
  
  /**
   * Query for entries intersected by a ray.
   * Used for projectile and explosion line-of-sight checks.
   * 
   * @returns Array of entries whose AABB intersects the ray, sorted by distance
   */
  queryRay(
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
    maxDist: number
  ): OctreeEntry[] {
    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len < 1e-8) return [];
    dirX = dirX / len;
    dirY = dirY / len;
    dirZ = dirZ / len;
    
    const results: Array<{ entry: OctreeEntry; distance: number }> = [];
    const seen = new Set<number>();
    
    this.queryRayRecursive(this.root, originX, originY, originZ, dirX, dirY, dirZ, maxDist, results, seen);
    
    // Sort by distance along ray
    results.sort((a, b) => a.distance - b.distance);
    
    return results.map(r => r.entry);
  }
  
  private queryRayRecursive(
    node: OctreeNode,
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
    maxDist: number,
    results: Array<{ entry: OctreeEntry; distance: number }>,
    seen: Set<number>
  ): void {
    // Check if ray intersects this node
    if (!node.intersectsRay(originX, originY, originZ, dirX, dirY, dirZ, maxDist)) {
      return;
    }
    
    // If leaf, check entries
    if (node.children === null) {
      for (const entry of node.entries) {
        if (seen.has(entry.id)) continue; // Already added
        
        // Ray vs AABB intersection
        const dist = this.rayVsAABBDistance(
          originX, originY, originZ, dirX, dirY, dirZ, maxDist,
          entry.minX, entry.minY, entry.minZ, entry.maxX, entry.maxY, entry.maxZ
        );
        
        if (dist >= 0) {
          results.push({ entry, distance: dist });
          seen.add(entry.id);
        }
      }
      return;
    }
    
    // Branch - recurse into children
    for (const child of node.children) {
      this.queryRayRecursive(child, originX, originY, originZ, dirX, dirY, dirZ, maxDist, results, seen);
    }
  }
  
  private rayVsAABBDistance(
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number,
    maxDist: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number
  ): number {
    let tmin = 0;
    let tmax = maxDist;
    
    // X slab
    if (Math.abs(dirX) < 1e-8) {
      if (originX < minX || originX > maxX) return -1;
    } else {
      const invDirX = 1.0 / dirX;
      let t1 = (minX - originX) * invDirX;
      let t2 = (maxX - originX) * invDirX;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    
    // Y slab
    if (Math.abs(dirY) < 1e-8) {
      if (originY < minY || originY > maxY) return -1;
    } else {
      const invDirY = 1.0 / dirY;
      let t1 = (minY - originY) * invDirY;
      let t2 = (maxY - originY) * invDirY;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    
    // Z slab
    if (Math.abs(dirZ) < 1e-8) {
      if (originZ < minZ || originZ > maxZ) return -1;
    } else {
      const invDirZ = 1.0 / dirZ;
      let t1 = (minZ - originZ) * invDirZ;
      let t2 = (maxZ - originZ) * invDirZ;
      if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    
    return tmin >= 0 && tmin <= maxDist ? tmin : -1;
  }
}
