/**
 * Manages the visual weapon mesh attached to a player.
 * - Local player: weapon in screen center (first-person view)
 * - Remote players: weapon on right side
 */

import type { Scene, TransformNode, Camera } from '@babylonjs/core';
import type { WeaponType } from './WeaponSystem';
import { WEAPON_STATS } from '@spong/shared';
import { EYE_FORWARD_OFFSET } from '../camera/CameraController';
import { createPistolMesh, disposePistolMesh } from '../entities/weapons/PistolMesh';
import { createSMGMesh, disposeSMGMesh } from '../entities/weapons/SMGMesh';
import { createLMGMesh, disposeLMGMesh } from '../entities/weapons/LMGMesh';
import { createShotgunMesh, disposeShotgunMesh } from '../entities/weapons/ShotgunMesh';
import { createDoubleBarrelShotgunMesh, disposeDoubleBarrelShotgunMesh } from '../entities/weapons/DoubleBarrelShotgunMesh';
import { createSniperMesh, disposeSniperMesh } from '../entities/weapons/SniperMesh';
import { createAssaultRifleMesh, disposeAssaultRifleMesh } from '../entities/weapons/AssaultRifleMesh';
import { createDMRMesh, disposeDMRMesh } from '../entities/weapons/DMRMesh';
import { createRocketLauncherMesh, disposeRocketLauncherMesh } from '../entities/weapons/RocketLauncherMesh';

export class WeaponHolder {
  private scene: Scene;
  private weaponNode: TransformNode | null = null;
  private currentWeaponType: WeaponType | null = null;
  private isLocal: boolean;
  private holderName: string;
  private debugMode: boolean = false;

  constructor(scene: Scene, holderName: string, isLocal: boolean = false) {
    this.scene = scene;
    this.holderName = holderName;
    this.isLocal = isLocal;
  }

  /**
   * Equip a weapon (creates mesh and positions it)
   */
  equipWeapon(weaponType: WeaponType): void {
    // Dispose current weapon if any
    this.clearWeapon();

    // Create weapon mesh without shadows (performance)
    const name = `${this.holderName}_weapon`;
    let weaponMesh: TransformNode;

    switch (weaponType) {
      case 'pistol':
        weaponMesh = createPistolMesh(name, this.scene, { hasShadows: false });
        break;
      case 'smg':
        weaponMesh = createSMGMesh(name, this.scene, { hasShadows: false });
        break;
      case 'lmg':
        weaponMesh = createLMGMesh(name, this.scene, { hasShadows: false });
        break;
      case 'shotgun':
        weaponMesh = createShotgunMesh(name, this.scene, { hasShadows: false });
        break;
      case 'doublebarrel':
        weaponMesh = createDoubleBarrelShotgunMesh(name, this.scene, { hasShadows: false });
        break;
      case 'sniper':
        weaponMesh = createSniperMesh(name, this.scene, { hasShadows: false });
        break;
      case 'assault':
        weaponMesh = createAssaultRifleMesh(name, this.scene, { hasShadows: false });
        break;
      case 'dmr':
        weaponMesh = createDMRMesh(name, this.scene, { hasShadows: false });
        break;
      case 'rocket':
        weaponMesh = createRocketLauncherMesh(name, this.scene, { hasShadows: false });
        break;
    }

    this.weaponNode = weaponMesh;
    this.currentWeaponType = weaponType;

    // Initial positioning (will be updated each frame via update methods)
    this.positionForFirstPerson();
  }

  /**
   * Clear/remove current weapon
   */
  clearWeapon(): void {
    if (!this.weaponNode || !this.currentWeaponType) return;

    const name = `${this.holderName}_weapon`;
    
    // Dispose mesh based on type
    switch (this.currentWeaponType) {
      case 'pistol':
        disposePistolMesh(name, this.scene);
        break;
      case 'smg':
        disposeSMGMesh(name, this.scene);
        break;
      case 'lmg':
        disposeLMGMesh(name, this.scene);
        break;
      case 'shotgun':
        disposeShotgunMesh(name, this.scene);
        break;
      case 'doublebarrel':
        disposeDoubleBarrelShotgunMesh(name, this.scene);
        break;
      case 'sniper':
        disposeSniperMesh(name, this.scene);
        break;
      case 'assault':
        disposeAssaultRifleMesh(name, this.scene);
        break;
      case 'dmr':
        disposeDMRMesh(name, this.scene);
        break;
      case 'rocket':
        disposeRocketLauncherMesh(name, this.scene);
        break;
    }

    this.weaponNode = null;
    this.currentWeaponType = null;
  }

  /**
   * Position weapon for first-person view (local player)
   * Weapon is in screen center, attached to camera
   */
  private positionForFirstPerson(): void {
    if (!this.weaponNode || !this.currentWeaponType) return;

    // Use weapon-specific hold transform if defined; add EYE_FORWARD_OFFSET to local Z so gun stays aligned with camera (camera is 0.1 forward)
    const stats = WEAPON_STATS[this.currentWeaponType];
    const forwardZ = EYE_FORWARD_OFFSET;
    if (stats.holdTransform) {
      const { position, rotation } = stats.holdTransform;
      this.weaponNode.position.set(position.x, position.y, position.z + forwardZ);
      this.weaponNode.rotation.set(rotation.x, rotation.y, rotation.z);
    } else {
      this.weaponNode.position.set(0.3, -0.2, 0.5 + forwardZ);
      this.weaponNode.rotation.set(0, 0, 0);
    }
  }

  /**
   * Update weapon position for first-person (called every frame)
   * Attaches weapon to camera
   */
  updateFirstPerson(camera: Camera): void {
    if (!this.weaponNode) return;

    // Parent weapon to camera so it moves with view
    if (this.weaponNode.parent !== camera) {
      this.weaponNode.parent = camera;
      if (!this.debugMode) {
        this.positionForFirstPerson();
      }
    }
  }

  /**
   * Update weapon position for third-person (called every frame).
   * viewNode is at eye height with yaw+pitch so we use the same first-person hold transform,
   * making the remote gun match what the other client sees in first person.
   */
  updateThirdPerson(viewNode: TransformNode): void {
    if (!this.weaponNode) return;

    if (this.weaponNode.parent !== viewNode) {
      this.weaponNode.parent = viewNode;
      if (!this.debugMode) {
        this.positionForFirstPerson();
      }
    }
  }

  /**
   * Get current weapon type
   */
  getWeaponType(): WeaponType | null {
    return this.currentWeaponType;
  }

  /**
   * Check if currently holding a weapon
   */
  hasWeapon(): boolean {
    return this.weaponNode !== null;
  }

  /**
   * Get current weapon position (for debug)
   */
  getWeaponPosition(): { x: number; y: number; z: number } | null {
    if (!this.weaponNode) return null;
    return {
      x: this.weaponNode.position.x,
      y: this.weaponNode.position.y,
      z: this.weaponNode.position.z
    };
  }

  /**
   * Get current weapon rotation (for debug)
   */
  getWeaponRotation(): { x: number; y: number; z: number } | null {
    if (!this.weaponNode) return null;
    return {
      x: this.weaponNode.rotation.x,
      y: this.weaponNode.rotation.y,
      z: this.weaponNode.rotation.z
    };
  }

  /**
   * Set weapon position (for debug)
   */
  setWeaponPosition(x: number, y: number, z: number): void {
    if (!this.weaponNode) return;
    this.weaponNode.position.set(x, y, z);
  }

  /**
   * Set weapon rotation (for debug)
   */
  setWeaponRotation(x: number, y: number, z: number): void {
    if (!this.weaponNode) return;
    this.weaponNode.rotation.set(x, y, z);
  }

  /**
   * Enable/disable debug mode (prevents automatic positioning)
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clearWeapon();
  }
}
