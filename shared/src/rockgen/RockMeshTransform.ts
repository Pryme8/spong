/**
 * Transform utilities for rock collision meshes.
 * Applies scale, rotation (Y-axis), and translation to match visual mesh hierarchy.
 */

export interface RockTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;  // Rotation around Y axis in radians
  scale: number; // Combined scale factor (instance.scale * ROCK_SCALE)
}

/**
 * Transform a single point using rock transform hierarchy.
 * Order: center -> scale -> rotate -> translate
 * 
 * @param x Local X coordinate
 * @param y Local Y coordinate
 * @param z Local Z coordinate
 * @param transform World transform
 * @returns Transformed world coordinates
 */
export function transformPoint(
  x: number,
  y: number,
  z: number,
  transform: RockTransform
): [number, number, number] {
  const { posX, posY, posZ, rotY, scale } = transform;
  
  // Center the mesh (rocks are 0-64 voxels, center at 32)
  let tx = (x - 32) * scale;
  let ty = (y - 32) * scale;
  let tz = (z - 32) * scale;
  
  // Rotate around Y axis
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const rx = tx * cosY - tz * sinY;
  const rz = tx * sinY + tz * cosY;
  
  // Translate to world position
  return [
    rx + posX,
    ty + posY,
    rz + posZ
  ];
}

/**
 * Transform a triangle's three vertices.
 * 
 * @param v0 First vertex [x, y, z]
 * @param v1 Second vertex [x, y, z]
 * @param v2 Third vertex [x, y, z]
 * @param transform World transform
 * @returns Three transformed vertices
 */
export function transformTriangle(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  transform: RockTransform
): [[number, number, number], [number, number, number], [number, number, number]] {
  return [
    transformPoint(v0[0], v0[1], v0[2], transform),
    transformPoint(v1[0], v1[1], v1[2], transform),
    transformPoint(v2[0], v2[1], v2[2], transform)
  ];
}

/**
 * Inverse transform a point from world space to local space.
 * Used for transforming rays into mesh local space.
 * 
 * @param worldX World X coordinate
 * @param worldY World Y coordinate
 * @param worldZ World Z coordinate
 * @param transform World transform
 * @returns Local coordinates
 */
export function inverseTransformPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  transform: RockTransform,
  meshBounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
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
    // Fallback to old behavior (32 = half of 64)
    return [
      (rx / scale) + 32,
      (ty / scale) + 32,
      (rz / scale) + 32
    ];
  }
}

/**
 * Inverse transform a direction vector (for rays).
 * Applies only rotation, not translation or scale.
 * 
 * @param dirX Direction X
 * @param dirY Direction Y
 * @param dirZ Direction Z
 * @param transform World transform
 * @returns Transformed direction (not normalized)
 */
export function inverseTransformDirection(
  dirX: number,
  dirY: number,
  dirZ: number,
  transform: RockTransform
): [number, number, number] {
  const { rotY, scale } = transform;
  
  // Inverse rotate around Y axis
  const cosY = Math.cos(-rotY);
  const sinY = Math.sin(-rotY);
  const rx = dirX * cosY - dirZ * sinY;
  const rz = dirX * sinY + dirZ * cosY;
  
  // Scale direction to account for mesh scaling
  return [
    rx / scale,
    dirY / scale,
    rz / scale
  ];
}
