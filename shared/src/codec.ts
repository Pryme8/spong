import { TransformData, InputData, ShootData, ProjectileSpawnData, ProjectileDestroyData } from './protocol.js';

// Binary codec for transform updates
// Format: [opcode:1][entityId:4][posX:4][posY:4][posZ:4][rotX:4][rotY:4][rotZ:4][rotW:4][velX:4][velY:4][velZ:4][headPitch:4][lastInputSeq:4][isInWater:1][isHeadUnderwater:1][breathRemaining:4][waterDepth:4][isExhausted:1]
// Total: 64 bytes

export const TRANSFORM_PACKET_SIZE = 64;

// Binary codec for input updates
// Format: [opcode:1][sequence:4][deltaTime:4][forward:1][right:1][cameraYaw:4][cameraPitch:4][jump:1][sprint:1][timestamp:8]
// Total: 29 bytes

export const INPUT_PACKET_SIZE = 29;

export function encodeTransform(opcode: number, data: TransformData): ArrayBuffer {
  const buffer = new ArrayBuffer(TRANSFORM_PACKET_SIZE);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // Opcode (1 byte)
  view.setUint8(offset, opcode);
  offset += 1;
  
  // Entity ID (4 bytes, uint32)
  view.setUint32(offset, data.entityId, true);
  offset += 4;
  
  // Position (3 × 4 bytes, float32)
  view.setFloat32(offset, data.position.x, true);
  offset += 4;
  view.setFloat32(offset, data.position.y, true);
  offset += 4;
  view.setFloat32(offset, data.position.z, true);
  offset += 4;
  
  // Rotation quaternion (4 × 4 bytes, float32)
  view.setFloat32(offset, data.rotation.x, true);
  offset += 4;
  view.setFloat32(offset, data.rotation.y, true);
  offset += 4;
  view.setFloat32(offset, data.rotation.z, true);
  offset += 4;
  view.setFloat32(offset, data.rotation.w, true);
  offset += 4;
  
  // Velocity (3 × 4 bytes, float32)
  view.setFloat32(offset, data.velocity.x, true);
  offset += 4;
  view.setFloat32(offset, data.velocity.y, true);
  offset += 4;
  view.setFloat32(offset, data.velocity.z, true);
  offset += 4;
  
  // Head pitch (4 bytes, float32)
  view.setFloat32(offset, data.headPitch, true);
  offset += 4;
  
  // Last processed input sequence (4 bytes, uint32)
  view.setUint32(offset, data.lastProcessedInput || 0, true);
  offset += 4;
  
  // Water state (11 bytes total)
  view.setUint8(offset, data.isInWater ? 1 : 0);
  offset += 1;
  view.setUint8(offset, data.isHeadUnderwater ? 1 : 0);
  offset += 1;
  view.setFloat32(offset, data.breathRemaining || 10.0, true);
  offset += 4;
  view.setFloat32(offset, data.waterDepth || 0.0, true);
  offset += 4;
  view.setUint8(offset, data.isExhausted ? 1 : 0);
  
  return buffer;
}

export function decodeTransform(buffer: ArrayBuffer): TransformData {
  const view = new DataView(buffer);
  
  let offset = 1; // Skip opcode, already read by caller
  
  // Entity ID
  const entityId = view.getUint32(offset, true);
  offset += 4;
  
  // Position
  const position = {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true)
  };
  offset += 12;
  
  // Rotation
  const rotation = {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true),
    w: view.getFloat32(offset + 12, true)
  };
  offset += 16;
  
  // Velocity
  const velocity = {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true)
  };
  offset += 12;
  
  // Head pitch
  const headPitch = view.getFloat32(offset, true);
  offset += 4;
  
  // Last processed input sequence
  const lastProcessedInput = view.getUint32(offset, true);
  offset += 4;
  
  // Water state
  const isInWater = view.getUint8(offset) === 1;
  offset += 1;
  const isHeadUnderwater = view.getUint8(offset) === 1;
  offset += 1;
  const breathRemaining = view.getFloat32(offset, true);
  offset += 4;
  const waterDepth = view.getFloat32(offset, true);
  offset += 4;
  const isExhausted = view.getUint8(offset) === 1;
  
  return { 
    entityId, 
    position, 
    rotation, 
    velocity, 
    headPitch, 
    lastProcessedInput,
    isInWater,
    isHeadUnderwater,
    breathRemaining,
    waterDepth,
    isExhausted
  };
}

export function encodeInput(opcode: number, data: InputData): ArrayBuffer {
  const buffer = new ArrayBuffer(INPUT_PACKET_SIZE);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // Opcode (1 byte)
  view.setUint8(offset, opcode);
  offset += 1;
  
  // Sequence (4 bytes, uint32)
  view.setUint32(offset, data.sequence, true);
  offset += 4;
  
  // Delta time (4 bytes, float32)
  view.setFloat32(offset, data.deltaTime, true);
  offset += 4;
  
  // Forward (-1, 0, 1) (1 byte, int8)
  view.setInt8(offset, data.forward);
  offset += 1;
  
  // Right (-1, 0, 1) (1 byte, int8)
  view.setInt8(offset, data.right);
  offset += 1;
  
  // Camera yaw (4 bytes, float32)
  view.setFloat32(offset, data.cameraYaw, true);
  offset += 4;
  
  // Camera pitch (4 bytes, float32)
  view.setFloat32(offset, data.cameraPitch, true);
  offset += 4;
  
  // Jump (1 byte, uint8)
  view.setUint8(offset, data.jump ? 1 : 0);
  offset += 1;
  
  // Sprint (1 byte, uint8)
  view.setUint8(offset, data.sprint ? 1 : 0);
  offset += 1;
  
  // Timestamp (8 bytes, float64)
  view.setFloat64(offset, data.timestamp, true);
  
  return buffer;
}

export function decodeInput(buffer: ArrayBuffer): InputData {
  const view = new DataView(buffer);
  
  let offset = 1; // Skip opcode, already read by caller
  
  // Sequence
  const sequence = view.getUint32(offset, true);
  offset += 4;
  
  // Delta time
  const deltaTime = view.getFloat32(offset, true);
  offset += 4;
  
  // Forward
  const forward = view.getInt8(offset);
  offset += 1;
  
  // Right
  const right = view.getInt8(offset);
  offset += 1;
  
  // Camera yaw
  const cameraYaw = view.getFloat32(offset, true);
  offset += 4;
  
  // Camera pitch
  const cameraPitch = view.getFloat32(offset, true);
  offset += 4;
  
  // Jump
  const jump = view.getUint8(offset) === 1;
  offset += 1;
  
  // Sprint
  const sprint = view.getUint8(offset) === 1;
  offset += 1;
  
  // Timestamp
  const timestamp = view.getFloat64(offset, true);
  
  return { sequence, deltaTime, forward, right, cameraYaw, cameraPitch, jump, sprint, timestamp };
}

// ── Shoot Request ─────────────────────────────────────────────
// Format: [opcode:1][timestamp:8][dirX:4][dirY:4][dirZ:4]
// Total: 21 bytes

export const SHOOT_PACKET_SIZE = 33; // 1 + 8 + 6*4 = 33 bytes

export function encodeShoot(opcode: number, data: ShootData): ArrayBuffer {
  const buffer = new ArrayBuffer(SHOOT_PACKET_SIZE);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, opcode);
  offset += 1;
  view.setFloat64(offset, data.timestamp, true);
  offset += 8;
  view.setFloat32(offset, data.dirX, true);
  offset += 4;
  view.setFloat32(offset, data.dirY, true);
  offset += 4;
  view.setFloat32(offset, data.dirZ, true);
  offset += 4;
  view.setFloat32(offset, data.spawnX, true);
  offset += 4;
  view.setFloat32(offset, data.spawnY, true);
  offset += 4;
  view.setFloat32(offset, data.spawnZ, true);
  return buffer;
}

export function decodeShoot(buffer: ArrayBuffer): ShootData {
  const view = new DataView(buffer);
  let offset = 1; // Skip opcode
  const timestamp = view.getFloat64(offset, true);
  offset += 8;
  const dirX = view.getFloat32(offset, true);
  offset += 4;
  const dirY = view.getFloat32(offset, true);
  offset += 4;
  const dirZ = view.getFloat32(offset, true);
  offset += 4;
  const spawnX = view.getFloat32(offset, true);
  offset += 4;
  const spawnY = view.getFloat32(offset, true);
  offset += 4;
  const spawnZ = view.getFloat32(offset, true);
  return { timestamp, dirX, dirY, dirZ, spawnX, spawnY, spawnZ };
}

// ── Projectile Spawn ──────────────────────────────────────────
// Format: [opcode:1][entityId:4][ownerId:4][posX:4][posY:4][posZ:4][dirX:4][dirY:4][dirZ:4][speed:4]
// Total: 37 bytes

export const PROJECTILE_SPAWN_PACKET_SIZE = 37;
export const PROJECTILE_SPAWN_ENTRY_SIZE = 36; // Single entry without opcode

export function encodeProjectileSpawn(opcode: number, data: ProjectileSpawnData): ArrayBuffer {
  const buffer = new ArrayBuffer(PROJECTILE_SPAWN_PACKET_SIZE);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint8(offset, opcode); offset += 1;
  view.setUint32(offset, data.entityId, true); offset += 4;
  view.setUint32(offset, data.ownerId, true); offset += 4;
  view.setFloat32(offset, data.posX, true); offset += 4;
  view.setFloat32(offset, data.posY, true); offset += 4;
  view.setFloat32(offset, data.posZ, true); offset += 4;
  view.setFloat32(offset, data.dirX, true); offset += 4;
  view.setFloat32(offset, data.dirY, true); offset += 4;
  view.setFloat32(offset, data.dirZ, true); offset += 4;
  view.setFloat32(offset, data.speed, true);

  return buffer;
}

export function decodeProjectileSpawn(buffer: ArrayBuffer): ProjectileSpawnData {
  const view = new DataView(buffer);
  let offset = 1; // skip opcode

  const entityId = view.getUint32(offset, true); offset += 4;
  const ownerId = view.getUint32(offset, true); offset += 4;
  const posX = view.getFloat32(offset, true); offset += 4;
  const posY = view.getFloat32(offset, true); offset += 4;
  const posZ = view.getFloat32(offset, true); offset += 4;
  const dirX = view.getFloat32(offset, true); offset += 4;
  const dirY = view.getFloat32(offset, true); offset += 4;
  const dirZ = view.getFloat32(offset, true); offset += 4;
  const speed = view.getFloat32(offset, true);

  return { entityId, ownerId, posX, posY, posZ, dirX, dirY, dirZ, speed };
}

// ── Projectile Destroy ────────────────────────────────────────
// Format: [opcode:1][entityId:4]
// Total: 5 bytes

export const PROJECTILE_DESTROY_PACKET_SIZE = 5;

export function encodeProjectileDestroy(opcode: number, data: ProjectileDestroyData): ArrayBuffer {
  const buffer = new ArrayBuffer(PROJECTILE_DESTROY_PACKET_SIZE);
  const view = new DataView(buffer);
  view.setUint8(0, opcode);
  view.setUint32(1, data.entityId, true);
  return buffer;
}

export function decodeProjectileDestroy(buffer: ArrayBuffer): ProjectileDestroyData {
  const view = new DataView(buffer);
  return { entityId: view.getUint32(1, true) };
}

// ── Projectile Spawn Batch ────────────────────────────────────
// Format: [opcode:1][count:1][entry0:36][entry1:36]...[entryN:36]
// Total: 2 + (36 * count) bytes
// Each entry: [entityId:4][ownerId:4][posX:4][posY:4][posZ:4][dirX:4][dirY:4][dirZ:4][speed:4]

export function encodeProjectileSpawnBatch(opcode: number, dataArray: ProjectileSpawnData[]): ArrayBuffer {
  const count = dataArray.length;
  const buffer = new ArrayBuffer(2 + PROJECTILE_SPAWN_ENTRY_SIZE * count);
  const view = new DataView(buffer);
  
  let offset = 0;
  view.setUint8(offset, opcode); offset += 1;
  view.setUint8(offset, count); offset += 1;
  
  for (const data of dataArray) {
    view.setUint32(offset, data.entityId, true); offset += 4;
    view.setUint32(offset, data.ownerId, true); offset += 4;
    view.setFloat32(offset, data.posX, true); offset += 4;
    view.setFloat32(offset, data.posY, true); offset += 4;
    view.setFloat32(offset, data.posZ, true); offset += 4;
    view.setFloat32(offset, data.dirX, true); offset += 4;
    view.setFloat32(offset, data.dirY, true); offset += 4;
    view.setFloat32(offset, data.dirZ, true); offset += 4;
    view.setFloat32(offset, data.speed, true); offset += 4;
  }
  
  return buffer;
}

export function decodeProjectileSpawnBatch(buffer: ArrayBuffer): ProjectileSpawnData[] {
  const view = new DataView(buffer);
  let offset = 1; // skip opcode
  
  const count = view.getUint8(offset); offset += 1;
  const result: ProjectileSpawnData[] = [];
  
  for (let i = 0; i < count; i++) {
    const entityId = view.getUint32(offset, true); offset += 4;
    const ownerId = view.getUint32(offset, true); offset += 4;
    const posX = view.getFloat32(offset, true); offset += 4;
    const posY = view.getFloat32(offset, true); offset += 4;
    const posZ = view.getFloat32(offset, true); offset += 4;
    const dirX = view.getFloat32(offset, true); offset += 4;
    const dirY = view.getFloat32(offset, true); offset += 4;
    const dirZ = view.getFloat32(offset, true); offset += 4;
    const speed = view.getFloat32(offset, true); offset += 4;
    
    result.push({ entityId, ownerId, posX, posY, posZ, dirX, dirY, dirZ, speed });
  }
  
  return result;
}
