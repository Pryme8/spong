/**
 * Manages the visual weapon mesh attached to a player.
 * - Local player: weapon in screen center (first-person view)
 * - Remote players: weapon on right side
 */

import type { Scene, TransformNode, Camera } from '@babylonjs/core';
import type { WeaponType } from './WeaponSystem';
import { WEAPON_STATS } from '@spong/shared';
import { createPistolMesh, disposePistolMesh } from './PistolMesh';
import { createSMGMesh, disposeSMGMesh } from './SMGMesh';
import { createLMGMesh, disposeLMGMesh } from './LMGMesh';
import { createShotgunMesh, disposeShotgunMesh } from './ShotgunMesh';
import { createDoubleBarrelShotgunMesh, disposeDoubleBarrelShotgunMesh } from './DoubleBarrelShotgunMesh';
import { createSniperMesh, disposeSniperMesh } from './SniperMesh';
import { createAssaultRifleMesh, disposeAssaultRifleMesh } from './AssaultRifleMesh';
import { createDMRMesh, disposeDMRMesh } from './DMRMesh';
import { createRocketLauncherMesh, disposeRocketLauncherMesh } from './RocketLauncherMesh';

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
    if (this.isLocal) {
      this.positionForFirstPerson();
    } else {
      this.positionForThirdPerson();
    }
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

    // Use weapon-specific hold transform if defined
    const stats = WEAPON_STATS[this.currentWeaponType];
    if (stats.holdTransform) {
      const { position, rotation } = stats.holdTransform;
      this.weaponNode.position.set(position.x, position.y, position.z);
      this.weaponNode.rotation.set(rotation.x, rotation.y, rotation.z);
    } else {
      // Fallback to default positioning
      this.weaponNode.position.set(0.3, -0.2, 0.5);
      this.weaponNode.rotation.set(0, 0, 0);
    }
  }

  /**
   * Position weapon for third-person view (remote players)
   * Weapon is on right side of player
   */
  private positionForThirdPerson(): void {
    if (!this.weaponNode) return;

    // Position on right side of player body
    this.weaponNode.position.set(0.4, 0.3, 0);
    
    // Rotate to point forward and slightly up
    this.weaponNode.rotation.set(0, Math.PI * 0.5, 0);
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
   * Update weapon position for third-person (called every frame)
   * Attaches weapon to player transform node
   */
  updateThirdPerson(playerNode: TransformNode): void {
    if (!this.weaponNode) return;

    // Parent weapon to player node
    if (this.weaponNode.parent !== playerNode) {
      this.weaponNode.parent = playerNode;
      if (!this.debugMode) {
        this.positionForThirdPerson();
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
