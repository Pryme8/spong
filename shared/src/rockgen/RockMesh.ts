/**
 * Triangle mesh data structures for rocks.
 * Used for both full-detail rendering and simplified collision detection.
 */

/**
 * Single triangle representation (expanded format).
 * Useful for individual triangle operations.
 */
export interface RockTriangle {
  // Vertex 0
  v0x: number;
  v0y: number;
  v0z: number;
  // Vertex 1
  v1x: number;
  v1y: number;
  v1z: number;
  // Vertex 2
  v2x: number;
  v2y: number;
  v2z: number;
}

/**
 * Bounding box for rock meshes.
 */
export interface RockBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Indexed triangle mesh representation.
 * More memory-efficient as vertices are shared between triangles.
 */
export interface RockMesh {
  /** Vertex positions: [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices: [i0,i1,i2, i3,i4,i5, ...] */
  indices: Uint32Array;
  /** Bounding box of the mesh in voxel space */
  bounds: RockBounds;
}

/**
 * Simplified collision mesh with metadata.
 * Result of mesh decimation for efficient collision detection.
 */
export interface RockColliderMesh {
  /** Vertex positions: [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices: [i0,i1,i2, i3,i4,i5, ...] */
  indices: Uint32Array;
  /** Number of triangles (indices.length / 3) */
  triangleCount: number;
  /** Bounding box of the mesh in voxel space */
  bounds: RockBounds;
}
