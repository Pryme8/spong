import { ref, Ref } from 'vue';
import type { Scene } from '@babylonjs/core';
import type { CameraController } from '../camera/CameraController';
import type { ProjectileManager } from './ProjectileManager';
import type { LocalTransform } from '../core/LocalTransform';
import type { NetworkClient } from '../network/NetworkClient';
import {
  PROJECTILE_SPAWN_OFFSET,
  PLAYER_HITBOX_CENTER_Y,
  WEAPON_STATS,
  getFireRateCooldownMs,
  calculateBarrelTipWorldPosition,
  calculateRecoilKick,
  getRecoilRiseSpeed,
  getRecoilRecoveryPerS,
  getBloomIncrement,
  getBloomRange,
  applyBloomDecay,
  getCurrentAccuracy,
  type WeaponType
} from '@spong/shared';
import { playSFX3D } from '../audio/audioHelpers';
import { AudioManager } from '../audio/AudioManager';

export type { WeaponType };

export class WeaponSystem {
  // Reactive state for HUD binding
  readonly hasWeapon: Ref<boolean>;
  readonly weaponType: Ref<WeaponType | null>;
  readonly currentAmmo: Ref<number>;
  readonly maxCapacity: Ref<number>;
  readonly isReloading: Ref<boolean>;
  readonly reloadProgress: Ref<number>;
  readonly bloomPercent: Ref<number>; // 0-1 normalized bloom (0 = min accuracy, 1 = max accuracy)

  // Internal state
  private internalWeaponType: WeaponType = 'pistol';
  private weaponAmmo = 0;
  private weaponCapacity = 12;
  private weaponReloadTime = 1.5;
  private weaponIsReloading = false;
  private weaponReloadStartTime = 0;
  private weaponProjectileSpeed = 40;
  private weaponDamage = 15;
  private weaponFireRateCooldown = 200;
  private weaponZoomFactor = 1; // 1 = no zoom
  private lastShootTime = 0;
  private lastEmptyClickTime = 0; // Track empty click separately
  private currentBloom = 0; // Current accuracy bloom (0 = minAccuracy)

  constructor() {
    this.hasWeapon = ref(false);
    this.weaponType = ref(null);
    this.currentAmmo = ref(0);
    this.maxCapacity = ref(12);
    this.isReloading = ref(false);
    this.reloadProgress = ref(0);
    this.bloomPercent = ref(0);
  }

  /**
   * Equip a weapon and initialize its stats (from shared cannonical stats)
   */
  equipWeapon(type: WeaponType): void {
    this.equipWeaponWithAmmo(type);
  }

  /**
   * Equip a weapon with server-provided ammo state when available.
   */
  equipWeaponWithAmmo(type: WeaponType, ammoCurrent?: number, ammoCapacity?: number): void {
    this.internalWeaponType = type;
    this.weaponType.value = type;
    this.hasWeapon.value = true;

    const stats = WEAPON_STATS[type];
    const capacity = ammoCapacity ?? stats.capacity;
    const current = ammoCurrent ?? stats.ammo;
    this.weaponCapacity = capacity;
    this.weaponAmmo = Math.min(Math.max(current, 0), capacity);
    this.weaponReloadTime = stats.reloadTime;
    this.weaponProjectileSpeed = stats.projectileSpeed;
    this.weaponDamage = stats.damage;
    this.weaponFireRateCooldown = getFireRateCooldownMs(type);
    this.weaponZoomFactor = stats.zoomFactor ?? 1;

    this.currentAmmo.value = this.weaponAmmo;
    this.maxCapacity.value = this.weaponCapacity;
    this.isReloading.value = false;
    this.weaponIsReloading = false;
    this.reloadProgress.value = 0;
    this.currentBloom = 0; // Reset bloom on weapon equip
    this.bloomPercent.value = 0;
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
    this.currentBloom = 0;
    this.bloomPercent.value = 0;
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
    // Must have a weapon to shoot
    if (!this.hasWeapon.value) return false;

    // Can't shoot while reloading - play empty click every trigger pull
    if (this.weaponIsReloading) {
      // Throttle empty click to prevent audio issues (100ms = very fast clicking allowed)
      const now = performance.now();
      if (now - this.lastEmptyClickTime >= 100) {
        this.lastEmptyClickTime = now;
        // Play empty click sound at player position (short duration)
        const playerState = myTransform.getState();
        AudioManager.getInstance().play('empty_click', {
          position: { x: playerState.posX, y: playerState.posY + PLAYER_HITBOX_CENTER_Y, z: playerState.posZ },
          volume: 0.5,
          duration: 0.35 // Play only 0.35 seconds of the sound
        });
      }
      return false;
    }

    // Check ammo - play empty click every trigger pull when empty
    if (this.weaponAmmo <= 0) {
      // Throttle empty click to prevent audio issues (100ms = very fast clicking allowed)
      const now = performance.now();
      if (now - this.lastEmptyClickTime >= 100) {
        this.lastEmptyClickTime = now;
        // Play empty click sound at player position (short duration)
        const playerState = myTransform.getState();
        AudioManager.getInstance().play('empty_click', {
          position: { x: playerState.posX, y: playerState.posY + PLAYER_HITBOX_CENTER_Y, z: playerState.posZ },
          volume: 0.5,
          duration: 0.35 // Play only 0.35 seconds of the sound
        });
      }
      // Auto-reload when empty
      if (!this.weaponIsReloading) {
        this.reload(myTransform, networkClient);
      }
      return false;
    }

    // Check shooting cooldown to prevent double-fire (only for successful shots)
    const now = performance.now();
    if (now - this.lastShootTime < this.weaponFireRateCooldown) {
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

    if (this.internalWeaponType === 'shotgun' || this.internalWeaponType === 'doublebarrel') {
      soundName = 'shotgun_shoot';
    } else if (this.internalWeaponType === 'lmg') {
      soundName = 'LMG_shoot';
      volume = 0.4;
    }

    playSFX3D(soundName, playerState.posX, playerState.posY + PLAYER_HITBOX_CENTER_Y, playerState.posZ, volume);

    // Get camera's forward ray from screen center
    const camera = cameraController.getCamera();
    const ray = camera.getForwardRay(1000);

    // Pick with the offset ray
    const pick = scene.pickWithRay(
      ray,
      (mesh) => {
        if (mesh.name.startsWith('proj_')) return false;
        if (mesh.name === `cube_${myTransform.entityId}`) return false;
        if (mesh.name === `body_${myTransform.entityId}`) return false;
        if (mesh.name === `head_${myTransform.entityId}`) return false;
        if (mesh.name.startsWith('item_')) return false;
        if (mesh.name === 'basePlayerCube') return false;
        return mesh.isPickable;
      }
    );

    if (!pick || !pick.hit || !pick.pickedPoint) {
      return false;
    }

    // Get projectile spawn position (barrel tip if available, otherwise player center)
    const state = playerState;
    let spawnX = state.posX;
    let spawnY = state.posY + PLAYER_HITBOX_CENTER_Y;
    let spawnZ = state.posZ;

    // Calculate barrel tip position if weapon has hold transform
    const barrelTip = calculateBarrelTipWorldPosition(
      this.internalWeaponType,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      camera.getWorldMatrix().m
    );

    if (barrelTip) {
      spawnX = barrelTip.x;
      spawnY = barrelTip.y;
      spawnZ = barrelTip.z;
    }

    // Calculate base direction from spawn point to picked point (server uses this for all pellets)
    const aimPoint = pick.pickedPoint;
    let baseDirX = aimPoint.x - spawnX;
    let baseDirY = aimPoint.y - spawnY;
    let baseDirZ = aimPoint.z - spawnZ;

    const baseLen = Math.sqrt(baseDirX * baseDirX + baseDirY * baseDirY + baseDirZ * baseDirZ);
    if (baseLen < 0.001) return false;
    baseDirX /= baseLen;
    baseDirY /= baseLen;
    baseDirZ /= baseLen;

    const pelletsPerShot = WEAPON_STATS[this.internalWeaponType].pelletsPerShot;

    // Apply spawn offset to barrel tip (same for all pellets)
    // This offset ensures projectile spawns slightly forward to avoid self-collision
    const finalSpawnX = spawnX + baseDirX * PROJECTILE_SPAWN_OFFSET;
    const finalSpawnY = spawnY + baseDirY * PROJECTILE_SPAWN_OFFSET;
    const finalSpawnZ = spawnZ + baseDirZ * PROJECTILE_SPAWN_OFFSET;

    // Get current accuracy based on bloom
    const currentAccuracy = getCurrentAccuracy(this.internalWeaponType, this.currentBloom);

    for (let i = 0; i < pelletsPerShot; i++) {
      let dirX = baseDirX;
      let dirY = baseDirY;
      let dirZ = baseDirZ;

      // Apply accuracy cone per pellet (matches server)
      if (currentAccuracy > 0) {
        const coneAngle = Math.random() * currentAccuracy;
        const spin = Math.random() * Math.PI * 2;

        let perpX: number, perpY: number, perpZ: number;
        if (Math.abs(dirY) < 0.9) {
          perpX = dirY * 0 - dirZ * 1;
          perpY = dirZ * 0 - dirX * 0;
          perpZ = dirX * 1 - dirY * 0;
        } else {
          perpX = dirY * 1 - dirZ * 0;
          perpY = dirZ * 0 - dirX * 0;
          perpZ = dirX * 0 - dirY * 1;
        }

        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
        perpX /= perpLen;
        perpY /= perpLen;
        perpZ /= perpLen;

        const cosSpin = Math.cos(spin);
        const sinSpin = Math.sin(spin);
        const crossX = perpY * dirZ - perpZ * dirY;
        const crossY = perpZ * dirX - perpX * dirZ;
        const crossZ = perpX * dirY - perpY * dirX;

        const rotPerpX = perpX * cosSpin + crossX * sinSpin;
        const rotPerpY = perpY * cosSpin + crossY * sinSpin;
        const rotPerpZ = perpZ * cosSpin + crossZ * sinSpin;

        const cosAngle = Math.cos(coneAngle);
        const sinAngle = Math.sin(coneAngle);

        dirX = dirX * cosAngle + rotPerpX * sinAngle;
        dirY = dirY * cosAngle + rotPerpY * sinAngle;
        dirZ = dirZ * cosAngle + rotPerpZ * sinAngle;

        const finalLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        dirX /= finalLen;
        dirY /= finalLen;
        dirZ /= finalLen;
      }

      // Small offset per pellet to prevent instant collisions (matches server)
      const pelletOffset = 0.05;
      const angle = (i / pelletsPerShot) * Math.PI * 2;
      const offsetX = Math.cos(angle) * pelletOffset;
      const offsetZ = Math.sin(angle) * pelletOffset;

      projectileManager.spawnPredicted(
        finalSpawnX + offsetX, 
        finalSpawnY, 
        finalSpawnZ + offsetZ,
        dirX, dirY, dirZ,
        this.weaponProjectileSpeed,
        myTransform.entityId
      );
    }

    // Tell server with base aim direction and final spawn position (barrel tip + offset)
    networkClient.sendShoot(
      baseDirX, baseDirY, baseDirZ,
      finalSpawnX, finalSpawnY, finalSpawnZ
    );

    cameraController.applyRecoilKick(calculateRecoilKick(this.internalWeaponType), {
      risePerS: getRecoilRiseSpeed(this.internalWeaponType),
      recoveryPerS: getRecoilRecoveryPerS(this.internalWeaponType)
    });

    // Increase bloom (clamp to 100%)
    const bloomIncrement = getBloomIncrement(this.internalWeaponType);
    this.currentBloom = Math.min(getBloomRange(this.internalWeaponType), this.currentBloom + bloomIncrement);

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
    this.reloadProgress.value = Math.min(1, elapsed / this.weaponReloadTime) * 100;

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
   * Update bloom decay (call every frame with frame delta in seconds)
   */
  updateBloom(dtSec: number): void {
    if (this.currentBloom > 0 && this.hasWeapon.value) {
      this.currentBloom = applyBloomDecay(this.currentBloom, this.internalWeaponType, dtSec);
      this.currentBloom = Math.min(getBloomRange(this.internalWeaponType), this.currentBloom);
    }

    // Update reactive bloom percent (0-1 normalized)
    if (this.hasWeapon.value) {
      const stats = WEAPON_STATS[this.internalWeaponType];
      const bloomRange = stats.maxAccuracy - stats.minAccuracy;
      this.bloomPercent.value = bloomRange > 0 ? Math.min(1, this.currentBloom / bloomRange) : 0;
    } else {
      this.bloomPercent.value = 0;
    }
  }

  /**
   * Check if current weapon is automatic (SMG, LMG, Assault)
   */
  isAutoFireWeapon(): boolean {
    return this.internalWeaponType === 'smg'
      || this.internalWeaponType === 'lmg'
      || this.internalWeaponType === 'assault';
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

  /**
   * Dispose of weapon system and clear state.
   */
  dispose(): void {
    this.clearWeapon();
    // Vue refs will be garbage collected automatically, but we clear state explicitly
    this.hasWeapon.value = false;
    this.weaponType.value = null;
    this.currentAmmo.value = 0;
    this.maxCapacity.value = 0;
    this.isReloading.value = false;
    this.reloadProgress.value = 0;
    this.bloomPercent.value = 0;
  }
}
