/**
 * Create a visual representation of a submachine gun using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface SMGMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an SMG mesh with barrel, grip, magazine, and foregrip.
 * Design: longer barrel than pistol, magazine box forward of grip, foregrip forward of magazine.
 * Returns the root node for direct position control.
 */
export function createSMGMesh(name: string, scene: Scene, options?: SMGMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Barrel (longer horizontal box)
  const barrel = MeshBuilder.CreateBox(`${name}_barrel`, {
    width: 0.15,   // X - thickness (slimmer than pistol)
    height: 0.15,  // Y - height
    depth: 0.8     // Z - length (longer than pistol)
  }, scene);

  // Grip (vertical box at back)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.18,   // X - thickness
    height: 0.35,  // Y - height
    depth: 0.2     // Z - depth
  }, scene);

  // Magazine (narrower box forward of grip)
  const magazine = MeshBuilder.CreateBox(`${name}_magazine`, {
    width: 0.12,   // X - narrower than grip
    height: 0.25,  // Y - shorter than grip
    depth: 0.15    // Z - depth
  }, scene);

  // Foregrip (forward box, same width as grip, shorter)
  const foregrip = MeshBuilder.CreateBox(`${name}_foregrip`, {
    width: 0.18,   // X - same as grip
    height: 0.22,  // Y - shorter than grip
    depth: 0.15    // Z - depth
  }, scene);

  // Dark metal material
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.2, 0.2, 0.25);    // Dark gunmetal
  material.emissiveColor = new Color3(0.05, 0.05, 0.08); // Subtle glow
  material.specularColor = new Color3(0.6, 0.6, 0.7);    // Metallic shine

  barrel.material = material;
  grip.material = material;
  magazine.material = material;
  foregrip.material = material;

  // Position barrel forward and centered
  barrel.position.set(0, 0, 0.2);

  // Position grip at back, below barrel
  grip.position.set(0, -0.17, -0.25);

  // Position magazine forward of grip, below barrel
  magazine.position.set(0, -0.15, 0.0);

  // Position foregrip forward of magazine, below barrel, touching barrel
  foregrip.position.set(0, -0.13, 0.25);

  // Parent all to root
  barrel.parent = root;
  grip.parent = root;
  magazine.parent = root;
  foregrip.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(foregrip, true);
    }
  }

  return root;
}

/**
 * Dispose of SMG mesh and all children.
 */
export function disposeSMGMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
