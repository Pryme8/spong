/**
 * Convert greedy-meshed quads to indexed triangle meshes.
 * Maintains consistent winding order matching the current rock rendering system.
 */

import type { RockQuad } from './RockGreedyMesher.js';
import type { RockMesh } from './RockMesh.js';
import { ROCK_VOXEL_SIZE } from './RockVoxelGrid.js';

export class RockMeshBuilder {
  /**
   * Convert RockQuad[] to an indexed triangle mesh.
   * Each quad becomes 4 vertices and 2 triangles (6 indices).
   * 
   * Note: Quad x/y/z are already in world space (scaled by ROCK_VOXEL_SIZE),
   * but width/height are in voxel counts and must be scaled here.
   * 
   * @param quads Array of quads from RockGreedyMesher
   * @returns Indexed triangle mesh
   */
  buildFromQuads(quads: RockQuad[]): RockMesh {
    const positions: number[] = [];
    const indices: number[] = [];
    
    let vertexOffset = 0;
    
    for (const quad of quads) {
      const { x, y, z, axis, positive } = quad;
      // width/height are voxel counts - scale to world units
      const w = quad.width * ROCK_VOXEL_SIZE;
      const h = quad.height * ROCK_VOXEL_SIZE;
      
      // Generate 4 corners for this quad (matching LevelRockManager.ts logic)
      let corners: number[][];
      
      switch (axis) {
        case 'x':
          if (positive) {
            corners = [
              [x, y, z + w],
              [x, y, z],
              [x, y + h, z],
              [x, y + h, z + w],
            ];
          } else {
            corners = [
              [x, y, z],
              [x, y, z + w],
              [x, y + h, z + w],
              [x, y + h, z],
            ];
          }
          break;
        case 'y':
          if (positive) {
            corners = [
              [x, y, z],
              [x + w, y, z],
              [x + w, y, z + h],
              [x, y, z + h],
            ];
          } else {
            corners = [
              [x, y, z + h],
              [x + w, y, z + h],
              [x + w, y, z],
              [x, y, z],
            ];
          }
          break;
        case 'z':
        default:
          if (positive) {
            corners = [
              [x + w, y, z],
              [x, y, z],
              [x, y + h, z],
              [x + w, y + h, z],
            ];
          } else {
            corners = [
              [x, y, z],
              [x + w, y, z],
              [x + w, y + h, z],
              [x, y + h, z],
            ];
          }
          break;
      }
      
      // Add vertices
      for (const corner of corners) {
        positions.push(corner[0], corner[1], corner[2]);
      }
      
      // Add indices for 2 triangles (consistent winding: 0,1,2 and 0,2,3)
      indices.push(
        vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
        vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
      );
      
      vertexOffset += 4;
    }
    
    // Calculate bounding box
    const vertices = new Float32Array(positions);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    
    return {
      vertices,
      indices: new Uint32Array(indices),
      bounds: { minX, minY, minZ, maxX, maxY, maxZ }
    };
  }
}
