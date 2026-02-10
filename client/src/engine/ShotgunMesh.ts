/**
 * Create a visual representation of a shotgun using simple geometry.
 * Based on SMG but with magazine removed and foregrip rotated forward.
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface ShotgunMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a shotgun mesh with barrel, grip, and forward-pointing foregrip.
 * Design: longer barrel, no magazine, pump-action foregrip.
 * Returns the root node for direct position control.
 */
export function createShotgunMesh(name: string, scene: Scene, options?: ShotgunMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Barrel (longer horizontal box)
  const barrel = MeshBuilder.CreateBox(`${name}_barrel`, {
    width: 0.15,   // X - thickness
    height: 0.15,  // Y - height
    depth: 0.9     // Z - length (longer than SMG)
  }, scene);

  // Grip (vertical box at back)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.18,   // X - thickness
    height: 0.35,  // Y - height
    depth: 0.2     // Z - depth
  }, scene);

  // Foregrip (horizontal box pointing forward, like a pump)
  const foregrip = MeshBuilder.CreateBox(`${name}_foregrip`, {
    width: 0.18,   // X - same as grip
    height: 0.14,  // Y - a bit taller for better grip
    depth: 0.35    // Z - longer (pointing forward)
  }, scene);

  // Dark metal material with slight brown tint (classic shotgun look)
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.15, 0.13, 0.12);   // Dark brown-metal
  material.emissiveColor = new Color3(0.03, 0.025, 0.02); // Very subtle glow
  material.specularColor = new Color3(0.5, 0.5, 0.5);     // Metallic shine

  barrel.material = material;
  grip.material = material;
  foregrip.material = material;

  // Position barrel forward and centered
  barrel.position.set(0, 0, 0.25);

  // Position grip at back, below barrel
  grip.position.set(0, -0.17, -0.2);

  // Position foregrip further forward on barrel (pump-action position)
  foregrip.position.set(0, -0.15, 0.30);

  // Parent all to root
  barrel.parent = root;
  grip.parent = root;
  foregrip.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(foregrip, true);
    }
  }

  return root;
}

/**
 * Dispose of shotgun mesh and all children.
 */
export function disposeShotgunMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
