/**
 * Mesh simplification using vertex clustering for bush collision meshes.
 * Deterministic algorithm that produces identical results on client and server.
 */

import type { BushMesh, BushColliderMesh } from './BushMesh.js';

export class BushMeshDecimator {
  /**
   * Simplify a bush mesh using vertex clustering.
   * 
   * Algorithm:
   * 1. Calculate mesh bounds
   * 2. Create uniform 3D grid over bounds
   * 3. Bucket vertices into grid cells
   * 4. Average vertex positions within each cell
   * 5. Remap triangles to use clustered vertices
   * 6. Remove degenerate triangles
   * 
   * @param mesh Full-detail bush mesh
   * @param gridResolution Number of grid cells per axis (higher = more detail)
   * @returns Simplified collision mesh
   */
  decimate(mesh: BushMesh, gridResolution: number = 18): BushColliderMesh {
    const { vertices, indices } = mesh;
    
    // Step 1: Calculate mesh bounds
    const bounds = this.calculateBounds(vertices);
    
    // Step 2: Create grid and bucket vertices
    const cellSize = Math.max(
      (bounds.maxX - bounds.minX) / gridResolution,
      (bounds.maxY - bounds.minY) / gridResolution,
      (bounds.maxZ - bounds.minZ) / gridResolution
    );
    
    // Avoid division by zero for degenerate meshes
    if (cellSize < 1e-6) {
      return {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices),
        triangleCount: indices.length / 3,
        bounds: mesh.bounds,
      };
    }
    
    // Step 3: Bucket vertices into grid cells
    const cellMap = new Map<string, number[]>();
    const vertexCount = vertices.length / 3;
    
    for (let i = 0; i < vertexCount; i++) {
      const x = vertices[i * 3 + 0];
      const y = vertices[i * 3 + 1];
      const z = vertices[i * 3 + 2];
      
      const cellKey = this.getCellKey(x, y, z, bounds.minX, bounds.minY, bounds.minZ, cellSize);
      
      if (!cellMap.has(cellKey)) {
        cellMap.set(cellKey, []);
      }
      cellMap.get(cellKey)!.push(i);
    }
    
    // Step 4: Create clustered vertices (average position per cell)
    const clusteredVertices: number[] = [];
    const oldToNewIndex = new Map<number, number>();
    
    // Process cells in deterministic order (sorted by key)
    const sortedCellKeys = Array.from(cellMap.keys()).sort();
    
    for (const cellKey of sortedCellKeys) {
      const vertexIndices = cellMap.get(cellKey)!;
      
      // Average position
      let sumX = 0, sumY = 0, sumZ = 0;
      for (const oldIdx of vertexIndices) {
        sumX += vertices[oldIdx * 3 + 0];
        sumY += vertices[oldIdx * 3 + 1];
        sumZ += vertices[oldIdx * 3 + 2];
      }
      
      const count = vertexIndices.length;
      const avgX = sumX / count;
      const avgY = sumY / count;
      const avgZ = sumZ / count;
      
      // Create new vertex
      const newIdx = clusteredVertices.length / 3;
      clusteredVertices.push(avgX, avgY, avgZ);
      
      // Map all old vertices in this cell to the new clustered vertex
      for (const oldIdx of vertexIndices) {
        oldToNewIndex.set(oldIdx, newIdx);
      }
    }
    
    // Step 5: Remap triangles and remove degenerates
    const newIndices: number[] = [];
    const triangleCount = indices.length / 3;
    
    for (let t = 0; t < triangleCount; t++) {
      const i0 = indices[t * 3 + 0];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];
      
      const newI0 = oldToNewIndex.get(i0)!;
      const newI1 = oldToNewIndex.get(i1)!;
      const newI2 = oldToNewIndex.get(i2)!;
      
      // Skip degenerate triangles
      if (newI0 === newI1 || newI1 === newI2 || newI2 === newI0) {
        continue;
      }
      
      newIndices.push(newI0, newI1, newI2);
    }
    
    // Calculate bounds of the decimated mesh
    const decimatedVertices = new Float32Array(clusteredVertices);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < decimatedVertices.length; i += 3) {
      const x = decimatedVertices[i];
      const y = decimatedVertices[i + 1];
      const z = decimatedVertices[i + 2];
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    
    return {
      vertices: decimatedVertices,
      indices: new Uint32Array(newIndices),
      triangleCount: newIndices.length / 3,
      bounds: { minX, minY, minZ, maxX, maxY, maxZ }
    };
  }
  
  /**
   * Calculate axis-aligned bounding box of mesh.
   */
  private calculateBounds(vertices: Float32Array): {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
  } {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i + 0];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }
  
  /**
   * Get deterministic cell key for a 3D point.
   */
  private getCellKey(
    x: number, y: number, z: number,
    minX: number, minY: number, minZ: number,
    cellSize: number
  ): string {
    const cx = Math.floor((x - minX) / cellSize);
    const cy = Math.floor((y - minY) / cellSize);
    const cz = Math.floor((z - minZ) / cellSize);
    return `${cx},${cy},${cz}`;
  }
}
