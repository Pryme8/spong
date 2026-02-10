/**
 * Create a visual representation of a light machine gun using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface LMGMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an LMG mesh with barrel, grip, large magazine, foregrip, and stock.
 * Design: same as SMG but with stock behind grip and 4x wider magazine.
 * Returns the root node for direct position control.
 */
export function createLMGMesh(name: string, scene: Scene, options?: LMGMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Barrel (longer horizontal box, same as SMG)
  const barrel = MeshBuilder.CreateBox(`${name}_barrel`, {
    width: 0.15,   // X - thickness
    height: 0.15,  // Y - height
    depth: 0.8     // Z - length
  }, scene);

  // Grip (vertical box at back, same as SMG)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.18,   // X - thickness
    height: 0.35,  // Y - height
    depth: 0.2     // Z - depth
  }, scene);

  // Magazine (3/4 as wide, 1/3 taller: 0.6 * 0.75 = 0.45, 0.25 * 1.333 = 0.333)
  const magazine = MeshBuilder.CreateBox(`${name}_magazine`, {
    width: 0.45,   // X - 3/4 as wide
    height: 0.333, // Y - 1/3 taller
    depth: 0.15    // Z - depth
  }, scene);

  // Foregrip (forward box, same as SMG)
  const foregrip = MeshBuilder.CreateBox(`${name}_foregrip`, {
    width: 0.18,   // X - same as grip
    height: 0.22,  // Y - shorter than grip
    depth: 0.15    // Z - depth
  }, scene);

  // Stock (extends back from grip for shoulder support - 2x height, 3/4 length)
  const stock = MeshBuilder.CreateBox(`${name}_stock`, {
    width: 0.12,   // X - narrower than grip
    height: 0.24,  // Y - 2x as tall
    depth: 0.3     // Z - 3/4 as long
  }, scene);

  // Dark metal material with slight color variation
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.18, 0.2, 0.22);   // Darker gunmetal
  material.emissiveColor = new Color3(0.04, 0.05, 0.06); // Subtle glow
  material.specularColor = new Color3(0.5, 0.55, 0.6);   // Metallic shine

  barrel.material = material;
  grip.material = material;
  magazine.material = material;
  foregrip.material = material;
  stock.material = material;

  // Position barrel forward and centered
  barrel.position.set(0, 0, 0.2);

  // Position grip at back, below barrel
  grip.position.set(0, -0.17, -0.25);

  // Position magazine forward of grip, below barrel (4x wider)
  magazine.position.set(0, -0.15, 0.0);

  // Position foregrip forward of magazine, below barrel
  foregrip.position.set(0, -0.13, 0.25);

  // Position stock behind grip, aligned with barrel height
  stock.position.set(0, -0.08, -0.55);

  // Parent all to root
  barrel.parent = root;
  grip.parent = root;
  magazine.parent = root;
  foregrip.parent = root;
  stock.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(foregrip, true);
      sm.addShadowCaster(stock, true);
    }
  }

  return root;
}

/**
 * Dispose of LMG mesh and all children.
 */
export function disposeLMGMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
