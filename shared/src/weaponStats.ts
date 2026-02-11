/**
 * Canonical weapon stats - single source of truth for client and server.
 * Used by items.ts for entity creation and client WeaponSystem for prediction.
 */

export type WeaponType = 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'doublebarrel' | 'sniper' | 'assault' | 'dmr' | 'rocket';

export interface HoldTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  barrelTipOffset: { x: number; y: number; z: number }; // Barrel tip in weapon local space
}

export interface WeaponStats {
  ammo: number;
  capacity: number;
  reloadTime: number;
  damage: number;
  fireRate: number;      // shots per second
  projectileSpeed: number;
  accuracy: number;
  gravityStartDistance: number;
  pelletsPerShot: number;
  proximityRadius?: number;
  zoomFactor?: number;
  holdTransform?: HoldTransform; // First-person hold position/rotation
}

export const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  pistol: {
    ammo: 12,
    capacity: 12,
    reloadTime: 1.5,
    damage: 15,
    fireRate: 3.0,
    projectileSpeed: 260,
    accuracy: 0.008,
    gravityStartDistance: 50,
    pelletsPerShot: 1,
    holdTransform: {
      position: { x: 0.370, y: -0.470, z: -0.860 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.12667, z: 0.35 } // Tip of barrel in weapon local space
    }
  },
  smg: {
    ammo: 30,
    capacity: 30,
    reloadTime: 2.2,
    damage: 12,
    fireRate: 20.0,
    projectileSpeed: 240,
    accuracy: 0.015,
    gravityStartDistance: 50,
    pelletsPerShot: 1,
    holdTransform: {
      position: { x: 0.300, y: -0.370, z: -0.730 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.03, z: 0.55 }
    }
  },
  lmg: {
    ammo: 60,
    capacity: 60,
    reloadTime: 3.5,
    damage: 18,
    fireRate: 15.0,
    projectileSpeed: 280,
    accuracy: 0.011,
    gravityStartDistance: 35,
    pelletsPerShot: 1,
    holdTransform: {
      position: { x: 0.300, y: -0.240, z: -0.760 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.02667, z: 0.6 } // Barrel tip (center 0.35 + length/2 0.25 = 0.6)
    }
  },
  shotgun: {
    ammo: 8,
    capacity: 8,
    reloadTime: 3.0,
    damage: 8,
    fireRate: 0.8,
    projectileSpeed: 220,
    accuracy: 0.08,
    gravityStartDistance: 15,
    pelletsPerShot: 6,
    holdTransform: {
      position: { x: 0.300, y: -0.370, z: -0.730 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.03, z: 0.65 } // Barrel tip (center 0.55 + length/2 0.1 = 0.65)
    }
  },
  doublebarrel: {
    ammo: 2,
    capacity: 2,
    reloadTime: 1.5,
    damage: 8,
    fireRate: 0.8,
    projectileSpeed: 220,
    accuracy: 0.10,
    gravityStartDistance: 15,
    pelletsPerShot: 12,
    holdTransform: {
      position: { x: 0.300, y: -0.370, z: -0.730 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.025, z: 0.65 } // Barrel tip (center 0.55 + length/2 0.1 = 0.65)
    }
  },
  sniper: {
    ammo: 1,
    capacity: 1,
    reloadTime: 2.0,
    damage: 75,
    fireRate: 0.4,
    projectileSpeed: 600,
    accuracy: 0.001,
    gravityStartDistance: 280,
    pelletsPerShot: 1,
    zoomFactor: 3
  },
  assault: {
    ammo: 30,
    capacity: 30,
    reloadTime: 2.5,
    damage: 12,
    fireRate: 17.0,
    projectileSpeed: 280,
    accuracy: 0.008,
    gravityStartDistance: 42,
    pelletsPerShot: 1,
    holdTransform: {
      position: { x: 0.300, y: -0.370, z: -0.760 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.02667, z: 0.45 }
    }
  },
  dmr: {
    ammo: 15,
    capacity: 15,
    reloadTime: 2.8,
    damage: 35,
    fireRate: 4.0,
    projectileSpeed: 600,
    accuracy: 0.002,
    gravityStartDistance: 110,
    pelletsPerShot: 1,
    zoomFactor: 2.5,
    holdTransform: {
      position: { x: 0.300, y: -0.370, z: -0.960 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.02667, z: 0.60 }
    }
  },
  rocket: {
    ammo: 1,
    capacity: 1,
    reloadTime: 6.0,
    damage: 100,
    fireRate: 0.15,
    projectileSpeed: 160,
    accuracy: 0.005,
    gravityStartDistance: 60,
    pelletsPerShot: 1,
    proximityRadius: 5,
    holdTransform: {
      position: { x: 0.300, y: -0.240, z: -0.760 },
      rotation: { x: 0.000, y: 3.140, z: 0.000 },
      barrelTipOffset: { x: 0.0, y: 0.0, z: 0.9 } // Front of tube (center 0.25 + length/2 0.65 = 0.9)
    }
  }
};

/** Fire rate cooldown in milliseconds (1000 / fireRate) */
export function getFireRateCooldownMs(weaponType: WeaponType): number {
  return (1000 / WEAPON_STATS[weaponType].fireRate);
}

/**
 * Calculate barrel tip world position from hold transform (client version with matrix)
 * @param weaponType The weapon type
 * @param cameraPosition World position of camera
 * @param cameraRotationMatrix Camera's rotation matrix (from camera.getWorldMatrix())
 * @returns Barrel tip position in world space, or null if no hold transform
 */
export function calculateBarrelTipWorldPosition(
  weaponType: WeaponType,
  cameraPosition: { x: number; y: number; z: number },
  cameraRotationMatrix: number[] // 4x4 matrix as flat array
): { x: number; y: number; z: number } | null {
  const stats = WEAPON_STATS[weaponType];
  const holdTransform = stats.holdTransform;
  
  if (!holdTransform) return null;

  const { position: holdPos, rotation: holdRot, barrelTipOffset } = holdTransform;

  // Step 1: Rotate barrel tip by weapon's hold rotation
  const cosX = Math.cos(holdRot.x);
  const sinX = Math.sin(holdRot.x);
  const cosY = Math.cos(holdRot.y);
  const sinY = Math.sin(holdRot.y);
  const cosZ = Math.cos(holdRot.z);
  const sinZ = Math.sin(holdRot.z);

  // Rotation matrix (ZYX order)
  const m00 = cosY * cosZ;
  const m01 = cosY * sinZ;
  const m02 = -sinY;
  const m10 = sinX * sinY * cosZ - cosX * sinZ;
  const m11 = sinX * sinY * sinZ + cosX * cosZ;
  const m12 = sinX * cosY;
  const m20 = cosX * sinY * cosZ + sinX * sinZ;
  const m21 = cosX * sinY * sinZ - sinX * cosZ;
  const m22 = cosX * cosY;

  // Apply weapon rotation to barrel tip
  const rotatedX = m00 * barrelTipOffset.x + m01 * barrelTipOffset.y + m02 * barrelTipOffset.z;
  const rotatedY = m10 * barrelTipOffset.x + m11 * barrelTipOffset.y + m12 * barrelTipOffset.z;
  const rotatedZ = m20 * barrelTipOffset.x + m21 * barrelTipOffset.y + m22 * barrelTipOffset.z;

  // Step 2: Add weapon's hold position (now in camera space)
  const barrelInCameraX = holdPos.x + rotatedX;
  const barrelInCameraY = holdPos.y + rotatedY;
  const barrelInCameraZ = holdPos.z + rotatedZ;

  // Step 3: Transform from camera space to world space using camera's rotation
  const worldX = cameraRotationMatrix[0] * barrelInCameraX + 
                 cameraRotationMatrix[4] * barrelInCameraY + 
                 cameraRotationMatrix[8] * barrelInCameraZ + 
                 cameraPosition.x;
  
  const worldY = cameraRotationMatrix[1] * barrelInCameraX + 
                 cameraRotationMatrix[5] * barrelInCameraY + 
                 cameraRotationMatrix[9] * barrelInCameraZ + 
                 cameraPosition.y;
  
  const worldZ = cameraRotationMatrix[2] * barrelInCameraX + 
                 cameraRotationMatrix[6] * barrelInCameraY + 
                 cameraRotationMatrix[10] * barrelInCameraZ + 
                 cameraPosition.z;

  return { x: worldX, y: worldY, z: worldZ };
}

/**
 * Calculate barrel tip world position from yaw/pitch (server version)
 * @param weaponType The weapon type
 * @param cameraPosition World position of camera
 * @param cameraYaw Camera yaw angle in radians
 * @param cameraPitch Camera pitch angle in radians
 * @returns Barrel tip position in world space, or null if no hold transform
 */
export function calculateBarrelTipFromYawPitch(
  weaponType: WeaponType,
  cameraPosition: { x: number; y: number; z: number },
  cameraYaw: number,
  cameraPitch: number
): { x: number; y: number; z: number } | null {
  const stats = WEAPON_STATS[weaponType];
  const holdTransform = stats.holdTransform;
  
  if (!holdTransform) return null;

  const { position: holdPos, rotation: holdRot, barrelTipOffset } = holdTransform;

  // Step 1: Rotate barrel tip by weapon's hold rotation
  const cosX = Math.cos(holdRot.x);
  const sinX = Math.sin(holdRot.x);
  const cosY = Math.cos(holdRot.y);
  const sinY = Math.sin(holdRot.y);
  const cosZ = Math.cos(holdRot.z);
  const sinZ = Math.sin(holdRot.z);

  // Weapon rotation matrix (ZYX order)
  const m00 = cosY * cosZ;
  const m01 = cosY * sinZ;
  const m02 = -sinY;
  const m10 = sinX * sinY * cosZ - cosX * sinZ;
  const m11 = sinX * sinY * sinZ + cosX * cosZ;
  const m12 = sinX * cosY;
  const m20 = cosX * sinY * cosZ + sinX * sinZ;
  const m21 = cosX * sinY * sinZ - sinX * cosZ;
  const m22 = cosX * cosY;

  // Apply weapon rotation to barrel tip
  const rotatedX = m00 * barrelTipOffset.x + m01 * barrelTipOffset.y + m02 * barrelTipOffset.z;
  const rotatedY = m10 * barrelTipOffset.x + m11 * barrelTipOffset.y + m12 * barrelTipOffset.z;
  const rotatedZ = m20 * barrelTipOffset.x + m21 * barrelTipOffset.y + m22 * barrelTipOffset.z;

  // Step 2: Add weapon's hold position (now in camera space)
  const barrelInCameraX = holdPos.x + rotatedX;
  const barrelInCameraY = holdPos.y + rotatedY;
  const barrelInCameraZ = holdPos.z + rotatedZ;

  // Step 3: Build camera rotation matrix from yaw/pitch
  // Match CameraController's coordinate system where forward is:
  // X = sin(yaw) * cos(pitch)
  // Y = -sin(pitch)
  // Z = cos(yaw) * cos(pitch)
  const cosPitch = Math.cos(cameraPitch);
  const sinPitch = Math.sin(cameraPitch);
  const cosYaw = Math.cos(cameraYaw);
  const sinYaw = Math.sin(cameraYaw);

  // Forward vector (camera +Z axis)
  const forwardX = sinYaw * cosPitch;
  const forwardY = -sinPitch;
  const forwardZ = cosYaw * cosPitch;

  // Right vector (camera +X axis) = worldUp × forward
  // worldUp = (0, 1, 0), Forward = (Fx, Fy, Fz)
  // Right = (Uy*Fz - Uz*Fy, Uz*Fx - Ux*Fz, Ux*Fy - Uy*Fx)
  //       = (1*Fz - 0*Fy, 0*Fx - 0*Fz, 0*Fy - 1*Fx)
  //       = (Fz, 0, -Fx)
  const rightX = forwardZ;
  const rightY = 0;
  const rightZ = -forwardX;
  const rightLen = Math.sqrt(rightX * rightX + rightZ * rightZ);
  const rightXNorm = (rightLen > 0.001) ? (rightX / rightLen) : 1;
  const rightYNorm = 0;
  const rightZNorm = (rightLen > 0.001) ? (rightZ / rightLen) : 0;

  // Up vector (camera +Y axis) = forward × right
  // Up = (Fy*Rz - Fz*Ry, Fz*Rx - Fx*Rz, Fx*Ry - Fy*Rx)
  const upX = forwardY * rightZNorm - forwardZ * rightYNorm;
  const upY = forwardZ * rightXNorm - forwardX * rightZNorm;
  const upZ = forwardX * rightYNorm - forwardY * rightXNorm;

  // Camera rotation matrix (row-major: each row is an axis)
  // Row 0: right axis, Row 1: up axis, Row 2: forward axis
  const c00 = rightXNorm;
  const c01 = upX;
  const c02 = forwardX;
  const c10 = rightYNorm;
  const c11 = upY;
  const c12 = forwardY;
  const c20 = rightZNorm;
  const c21 = upZ;
  const c22 = forwardZ;

  // Step 4: Transform from camera space to world space
  const worldX = c00 * barrelInCameraX + c01 * barrelInCameraY + c02 * barrelInCameraZ + cameraPosition.x;
  const worldY = c10 * barrelInCameraX + c11 * barrelInCameraY + c12 * barrelInCameraZ + cameraPosition.y;
  const worldZ = c20 * barrelInCameraX + c21 * barrelInCameraY + c22 * barrelInCameraZ + cameraPosition.z;

  return { x: worldX, y: worldY, z: worldZ };
}
