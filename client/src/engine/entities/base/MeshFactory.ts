/**
 * Centralized mesh factory with type registry and red cube fallback.
 * Replaces direct mesh creation and pistol defaults with proper fallback handling.
 */

import { Scene, TransformNode } from '@babylonjs/core';
import { createFallbackMesh, MeshOptions } from '../../utils/MeshUtils';

// Import all mesh creators
import { createPistolMesh } from '../weapons/PistolMesh';
import { createSMGMesh } from '../weapons/SMGMesh';
import { createAssaultRifleMesh } from '../weapons/AssaultRifleMesh';
import { createSniperMesh } from '../weapons/SniperMesh';
import { createShotgunMesh } from '../weapons/ShotgunMesh';
import { createDoubleBarrelShotgunMesh } from '../weapons/DoubleBarrelShotgunMesh';
import { createLMGMesh } from '../weapons/LMGMesh';
import { createDMRMesh } from '../weapons/DMRMesh';
import { createRocketLauncherMesh } from '../weapons/RocketLauncherMesh';
import { createHammerMesh } from '../weapons/HammerMesh';
import { createAppleMesh } from '../items/AppleMesh';
import { createMedicPackMesh } from '../items/MedicPackMesh';
import { createLargeMedicPackMesh } from '../items/LargeMedicPackMesh';
import { createPillBottleMesh } from '../items/PillBottleMesh';
import { createHelmetMesh } from '../items/HelmetMesh';
import { createKevlarMesh } from '../items/KevlarMesh';
import { createLadderMesh } from '../props/LadderMesh';

type MeshCreator = (name: string, scene: Scene, options?: any) => TransformNode;

/**
 * Centralized mesh factory for weapons, items, and props.
 * Automatically falls back to red cube for unregistered types.
 */
export class MeshFactory {
  private static registry = new Map<string, MeshCreator>();
  private static initialized = false;

  /**
   * Initialize the mesh factory registry.
   * Must be called before using create methods.
   */
  static initialize(): void {
    if (this.initialized) return;

    // Weapons
    this.registry.set('pistol', createPistolMesh);
    this.registry.set('smg', createSMGMesh);
    this.registry.set('assault', createAssaultRifleMesh);
    this.registry.set('sniper', createSniperMesh);
    this.registry.set('shotgun', createShotgunMesh);
    this.registry.set('doublebarrel', createDoubleBarrelShotgunMesh);
    this.registry.set('lmg', createLMGMesh);
    this.registry.set('dmr', createDMRMesh);
    this.registry.set('rocket', createRocketLauncherMesh);
    this.registry.set('hammer', createHammerMesh);

    // Items
    this.registry.set('apple', createAppleMesh);
    this.registry.set('medic_pack', createMedicPackMesh);
    this.registry.set('large_medic_pack', createLargeMedicPackMesh);
    this.registry.set('pill_bottle', createPillBottleMesh);
    this.registry.set('helmet', createHelmetMesh);
    this.registry.set('kevlar', createKevlarMesh);
    
    // Props
    this.registry.set('ladder', createLadderMesh);

    this.initialized = true;
    console.log(`[MeshFactory] Initialized with ${this.registry.size} mesh types`);
  }

  /**
   * Create a mesh by type string.
   * Falls back to red cube with console warning if type not found.
   */
  static create(
    type: string,
    name: string,
    scene: Scene,
    options?: MeshOptions
  ): TransformNode {
    if (!this.initialized) {
      console.warn('[MeshFactory] Not initialized! Call MeshFactory.initialize() first.');
      this.initialize();
    }

    const creator = this.registry.get(type);

    if (creator) {
      return creator(name, scene, options);
    }

    // RED CUBE FALLBACK
    return createFallbackMesh(`${name}_unknown_${type}`, scene, options);
  }

  /**
   * Check if a mesh type is registered.
   */
  static has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Get all registered mesh types.
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}
