/**
 * Triangle mesh data structures for trees (collision only, wood parts).
 */

export interface TreeBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface TreeMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  bounds: TreeBounds;
}

export interface TreeColliderMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  bounds: TreeBounds;
}
