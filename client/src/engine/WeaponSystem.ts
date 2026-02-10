import { ref, computed, Ref } from 'vue';
import type { Scene } from '@babylonjs/core';
import type { CameraController } from './CameraController';
import type { ProjectileManager } from './ProjectileManager';
import type { LocalTransform } from './LocalTransform';
import type { NetworkClient } from '../network/NetworkClient';
import { PROJECTILE_SPAWN_OFFSET, PLAYER_HITBOX_CENTER_Y } from '@spong/shared';
import { playSFX3D } from './audioHelpers';

export type WeaponType = 'pistol' | 'smg' | 'lmg' | 'shotgun' | 'sniper' | 'assault' | 'rocket';

interface WeaponStats {
  ammo: number;
  capacity: number;
  reloadTime: number;
  accuracy: number;
  projectileSpeed: number;
  damage: number;
  fireRateCooldown: number; // Milliseconds between shots
  zoomFactor?: number; // Optional zoom factor for scoped weapons
}

const WEAPON_CONFIGS: Record<WeaponType, WeaponStats> = {
  pistol: {
    ammo: 12,
    capacity: 12,
    reloadTime: 1.5,
    accuracy: 0.008,
    projectileSpeed: 65,
    damage: 15,
    fireRateCooldown: 200 // Semi-auto: 300 RPM
  },
  smg: {
    ammo: 30,
    capacity: 30,
    reloadTime: 2.2,
    accuracy: 0.015,
    projectileSpeed: 60,
    damage: 12,
    fireRateCooldown: 100 // Full-auto: 600 RPM
  },
  lmg: {
    ammo: 60,
    capacity: 60,
    reloadTime: 8.75,
    accuracy: 0.02,
    projectileSpeed: 70,
    damage: 18,
    fireRateCooldown: 150 // Full-auto: 400 RPM (slower than SMG)
  },
  shotgun: {
    ammo: 8,
    capacity: 8,
    reloadTime: 3.0,
    accuracy: 0.08,
    projectileSpeed: 55,
    damage: 8,
    fireRateCooldown: 800 // Pump-action: 75 RPM
  },
  sniper: {
    ammo: 1,
    capacity: 1,
    reloadTime: 2.5,
    accuracy: 0.001, // Extremely accurate
    projectileSpeed: 150, // Very fast bullet
    damage: 75, // High damage
    fireRateCooldown: 2500, // Must reload after each shot anyway
    zoomFactor: 3 // 3x zoom when aiming
  },
  assault: {
    ammo: 30,
    capacity: 30,
    reloadTime: 2.5,
    accuracy: 0.008, // Better than SMG
    projectileSpeed: 100, // Faster than SMG
    damage: 18, // Same as LMG
    fireRateCooldown: 120, // Semi-auto: 500 RPM (fast cycle rate)
    zoomFactor: 1.8 // 1.8x zoom (tactical sight)
  },
  rocket: {
    ammo: 1,
    capacity: 1,
    reloadTime: 6.0, // Very long reload (6 seconds)
    accuracy: 0.005, // Fairly accurate
    projectileSpeed: 40, // Slowest projectile
    damage: 100, // High base damage (before splash falloff)
    fireRateCooldown: 6500 // Must reload anyway
  }
};

export class WeaponSystem {
  // Reactive state for HUD binding
  readonly hasWeapon: Ref<boolean>;
  readonly weaponType: Ref<WeaponType | null>;
  readonly currentAmmo: Ref<number>;
  readonly maxCapacity: Ref<number>;
  readonly isReloading: Ref<boolean>;
  readonly reloadProgress: Ref<number>;

  // Internal state
  private internalWeaponType: WeaponType = 'pistol';
  private weaponAmmo = 0;
  private weaponCapacity = 12;
  private weaponReloadTime = 1.5;
  private weaponIsReloading = false;
  private weaponReloadStartTime = 0;
  private weaponAccuracy = 0.015;
  private weaponProjectileSpeed = 40;
  private weaponDamage = 15;
  private weaponFireRateCooldown = 200;
  private weaponZoomFactor = 1; // 1 = no zoom
  private lastShootTime = 0;

  constructor() {
    this.hasWeapon = ref(false);
    this.weaponType = ref(null);
    this.currentAmmo = ref(0);
    this.maxCapacity = ref(12);
    this.isReloading = ref(false);
    this.reloadProgress = ref(0);
  }

  /**
   * Equip a weapon and initialize its stats
   */
  equipWeapon(type: WeaponType): void {
    this.internalWeaponType = type;
    this.weaponType.value = type;
    this.hasWeapon.value = true;

    const config = WEAPON_CONFIGS[type];
    this.weaponAmmo = config.ammo;
    this.weaponCapacity = config.capacity;
    this.weaponReloadTime = config.reloadTime;
    this.weaponAccuracy = config.accuracy;
    this.weaponProjectileSpeed = config.projectileSpeed;
    this.weaponDamage = config.damage;
    this.weaponFireRateCooldown = config.fireRateCooldown;
    this.weaponZoomFactor = config.zoomFactor || 1;

    this.currentAmmo.value = config.ammo;
    this.maxCapacity.value = config.capacity;
    this.isReloading.value = false;
    this.weaponIsReloading = false;
    this.reloadProgress.value = 0;

    console.log(`[WeaponSystem] Equipped ${type}: ${this.weaponAmmo}/${this.weaponCapacity} ammo, ${config.fireRateCooldown}ms cooldown, zoom: ${this.weaponZoomFactor}x`);
  }

  /**
   * Clear weapon state (on drop or death)
   */
  clearWeapon(): void {
    this.hasWeapon.value = false;
    this.weaponType.value = null;
    this.weaponAmmo = 0;
    this.currentAmmo.value = 0;
    this.weaponIsReloading = false;
    this.isReloading.value = false;
    this.weaponReloadStartTime = 0;
    this.reloadProgress.value = 0;
    this.weaponZoomFactor = 1;
  }

  /**
   * Get current weapon type
   */
  getWeaponType(): WeaponType {
    return this.internalWeaponType;
  }

  /**
   * Attempt to shoot the weapon
   */
  shoot(
    myTransform: LocalTransform,
    cameraController: CameraController,
    scene: Scene,
    projectileManager: ProjectileManager,
    networkClient: NetworkClient
  ): boolean {
    // Check shooting cooldown FIRST to prevent double-fire
    const now = performance.now();
    if (now - this.lastShootTime < this.weaponFireRateCooldown) {
      return false;
    }

    // Must have a weapon to shoot
    if (!this.hasWeapon.value) return false;

    // Can't shoot while reloading
    if (this.weaponIsReloading) return false;

    // Check ammo
    if (this.weaponAmmo <= 0) {
      // Auto-reload when empty
      if (!this.weaponIsReloading) {
        this.reload(myTransform, networkClient);
      }
      return false;
    }

    // Set cooldown immediately after checks pass
    this.lastShootTime = now;

    // Consume ammo
    this.weaponAmmo--;
    this.currentAmmo.value = this.weaponAmmo;

    // Play gunshot sound at player position (weapon-specific)
    const playerState = myTransform.getState();
    let soundName = 'pistol_shot';
    let volume = 0.8;

    if (this.internalWeaponType === 'shotgun') {
      soundName = 'shotgun_shoot';
    } else if (this.internalWeaponType === 'lmg') {
      soundName = 'LMG_shoot';
      volume = 0.4;
    }

    playSFX3D(soundName, playerState.posX, playerState.posY + PLAYER_HITBOX_CENTER_Y, playerState.posZ, volume);

    // Get camera's forward ray and offset it forward by 6 units
    const camera = cameraController.getCamera();
    const ray = camera.getForwardRay(1000);

    // Offset ray origin forward by 6 units to avoid backfaces
    ray.origin.x += ray.direction.x * 6;
    ray.origin.y += ray.direction.y * 6;
    ray.origin.z += ray.direction.z * 6;

    // Pick with the offset ray
    const pick = scene.pickWithRay(
      ray,
      (mesh) => {
        // Skip projectile meshes
        if (mesh.name.startsWith('proj_')) return false;
        // Skip our own player cube
        if (mesh.name === `cube_${myTransform.entityId}`) return false;
        // Skip our player's head mesh
        if (mesh.name === `head_${myTransform.entityId}`) return false;
        // Skip item meshes
        if (mesh.name.startsWith('item_')) return false;
        // Skip the hidden base player cube
        if (mesh.name === 'basePlayerCube') return false;
        return mesh.isPickable;
      }
    );

    // Sky pick sphere ensures we always hit something
    if (!pick || !pick.hit || !pick.pickedPoint) {
      console.warn('[WeaponSystem] Pick failed despite sky pick sphere');
      return false;
    }

    // Get player spawn position
    const state = playerState;
    const spawnX = state.posX;
    const spawnY = state.posY + PLAYER_HITBOX_CENTER_Y;
    const spawnZ = state.posZ;

    // Calculate direction from spawn point to picked point
    const aimPoint = pick.pickedPoint;
    let dirX = aimPoint.x - spawnX;
    let dirY = aimPoint.y - spawnY;
    let dirZ = aimPoint.z - spawnZ;

    // Normalize
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (dirLen < 0.001) return false;
    dirX /= dirLen;
    dirY /= dirLen;
    dirZ /= dirLen;

    // Apply accuracy cone (random spread)
    if (this.weaponAccuracy > 0) {
      // Random angle within cone (0 to accuracy radians)
      const coneAngle = Math.random() * this.weaponAccuracy;
      const spin = Math.random() * Math.PI * 2;

      // Find a perpendicular vector to the direction
      let perpX, perpY, perpZ;
      if (Math.abs(dirY) < 0.9) {
        // Use up vector if direction is not too vertical
        perpX = dirY * 0 - dirZ * 1;
        perpY = dirZ * 0 - dirX * 0;
        perpZ = dirX * 1 - dirY * 0;
      } else {
        // Use forward vector if direction is vertical
        perpX = dirY * 1 - dirZ * 0;
        perpY = dirZ * 0 - dirX * 0;
        perpZ = dirX * 0 - dirY * 1;
      }

      // Normalize perpendicular vector
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
      perpX /= perpLen;
      perpY /= perpLen;
      perpZ /= perpLen;

      // Rotate perpendicular around direction by spin angle
      const cosSpin = Math.cos(spin);
      const sinSpin = Math.sin(spin);
      const crossX = perpY * dirZ - perpZ * dirY;
      const crossY = perpZ * dirX - perpX * dirZ;
      const crossZ = perpX * dirY - perpY * dirX;

      const rotPerpX = perpX * cosSpin + crossX * sinSpin;
      const rotPerpY = perpY * cosSpin + crossY * sinSpin;
      const rotPerpZ = perpZ * cosSpin + crossZ * sinSpin;

      // Apply cone angle rotation
      const cosAngle = Math.cos(coneAngle);
      const sinAngle = Math.sin(coneAngle);

      dirX = dirX * cosAngle + rotPerpX * sinAngle;
      dirY = dirY * cosAngle + rotPerpY * sinAngle;
      dirZ = dirZ * cosAngle + rotPerpZ * sinAngle;

      // Renormalize
      const finalLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
      dirX /= finalLen;
      dirY /= finalLen;
      dirZ /= finalLen;
    }

    // Offset spawn slightly forward to avoid self-collision
    const posX = spawnX + dirX * PROJECTILE_SPAWN_OFFSET;
    const posY = spawnY + dirY * PROJECTILE_SPAWN_OFFSET;
    const posZ = spawnZ + dirZ * PROJECTILE_SPAWN_OFFSET;

    // Spawn predicted projectile from player
    projectileManager.spawnPredicted(
      posX, posY, posZ,
      dirX, dirY, dirZ,
      this.weaponProjectileSpeed,
      myTransform.entityId
    );

    // Tell server with aim direction
    networkClient.sendShoot(dirX, dirY, dirZ);

    return true;
  }

  /**
   * Start reloading the weapon
   */
  reload(myTransform: LocalTransform, networkClient: NetworkClient): boolean {
    if (!this.hasWeapon.value || this.isReloading.value || this.currentAmmo.value >= this.maxCapacity.value) {
      return false;
    }

    // Start reload locally
    this.isReloading.value = true;
    this.weaponIsReloading = true;
    this.weaponReloadStartTime = performance.now();

    // Play reload sound at player position (weapon-specific)
    const state = myTransform.getState();
    let soundName = 'pistol_reload';
    let volume = 0.7;

    if (this.internalWeaponType === 'shotgun') {
      soundName = 'shotgun_reload';
    } else if (this.internalWeaponType === 'lmg') {
      soundName = 'LMG_reload';
      volume = 0.35;
    }

    playSFX3D(soundName, state.posX, state.posY, state.posZ, volume);

    // For shotgun, also play cocking sound at the end of reload
    if (this.internalWeaponType === 'shotgun') {
      setTimeout(() => {
        playSFX3D('shotgun_cocking', state.posX, state.posY, state.posZ, 0.6);
      }, this.weaponReloadTime * 1000 - 500);
    }

    // Tell server
    networkClient.sendReload();

    return true;
  }

  /**
   * Update reload progress (call every frame)
   */
  updateReload(now: number): void {
    if (!this.weaponIsReloading) return;

    const elapsed = (now - this.weaponReloadStartTime) * 0.001;
    this.reloadProgress.value = Math.min(1, elapsed / this.weaponReloadTime);

    // Check if reload complete
    if (elapsed >= this.weaponReloadTime) {
      this.weaponIsReloading = false;
      this.isReloading.value = false;
      this.weaponAmmo = this.weaponCapacity;
      this.currentAmmo.value = this.weaponCapacity;
      this.reloadProgress.value = 0;
    }
  }

  /**
   * Check if current weapon is automatic (SMG or LMG)
   */
  isAutoFireWeapon(): boolean {
    return this.internalWeaponType === 'smg' || this.internalWeaponType === 'lmg';
  }

  /**
   * Get the zoom factor for the current weapon (1 = no zoom)
   */
  getZoomFactor(): number {
    return this.weaponZoomFactor;
  }

  /**
   * Check if current weapon has zoom capability
   */
  hasZoom(): boolean {
    return this.weaponZoomFactor > 1;
  }
}
