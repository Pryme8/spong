/**
 * Triangle mesh data structures for bushes (collision/trigger detection).
 */

export interface BushBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface BushMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  bounds: BushBounds;
}

export interface BushColliderMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  bounds: BushBounds;
}
