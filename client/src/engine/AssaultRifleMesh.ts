/**
 * Create a visual representation of an assault rifle using simple geometry.
 * Combines elements from sniper (longer barrel, scope) and SMG (magazine, foregrip).
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface AssaultRifleMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an assault rifle mesh with medium-long barrel, grip, magazine, foregrip, and small scope.
 * Design: Military-style rifle with tactical elements.
 * Returns the root node for direct position control.
 */
export function createAssaultRifleMesh(name: string, scene: Scene, options?: AssaultRifleMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Barrel (medium-long, between SMG and sniper)
  const barrel = MeshBuilder.CreateBox(`${name}_barrel`, {
    width: 0.14,   // X - thickness
    height: 0.14,  // Y - height
    depth: 1.0     // Z - length (longer than SMG, shorter than sniper)
  }, scene);

  // Grip (vertical box at back)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.18,   // X - thickness
    height: 0.35,  // Y - height
    depth: 0.2     // Z - depth
  }, scene);

  // Magazine (box magazine forward of grip)
  const magazine = MeshBuilder.CreateBox(`${name}_magazine`, {
    width: 0.15,   // X - wider than SMG mag
    height: 0.35,  // Y - tall magazine (30 rounds)
    depth: 0.18    // Z - depth
  }, scene);

  // Foregrip (forward box, tactical grip)
  const foregrip = MeshBuilder.CreateBox(`${name}_foregrip`, {
    width: 0.16,   // X - slightly narrower than grip
    height: 0.18,  // Y - shorter than grip
    depth: 0.14    // Z - depth
  }, scene);

  // Small scope/red dot sight
  const scope = MeshBuilder.CreateBox(`${name}_scope`, {
    width: 0.08,   // X - narrow
    height: 0.12,  // Y - small sight
    depth: 0.2     // Z - length
  }, scene);

  // Stock (extends back from grip)
  const stock = MeshBuilder.CreateBox(`${name}_stock`, {
    width: 0.12,   // X - narrower than grip
    height: 0.18,  // Y - medium height
    depth: 0.25    // Z - short tactical stock
  }, scene);

  // Tactical black material
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.12, 0.12, 0.14);    // Dark tactical black
  material.emissiveColor = new Color3(0.02, 0.02, 0.03); // Minimal glow
  material.specularColor = new Color3(0.5, 0.5, 0.6);    // Moderate metallic shine

  // Scope/sight material (slightly different for optic)
  const scopeMaterial = new StandardMaterial(`${name}_scope_mat`, scene);
  scopeMaterial.diffuseColor = new Color3(0.15, 0.15, 0.18);
  scopeMaterial.emissiveColor = new Color3(0.04, 0.04, 0.06);
  scopeMaterial.specularColor = new Color3(0.7, 0.7, 0.8);

  barrel.material = material;
  grip.material = material;
  magazine.material = material;
  foregrip.material = material;
  stock.material = material;
  scope.material = scopeMaterial;

  // Position barrel forward and centered
  barrel.position.set(0, 0, 0.3);

  // Position grip at back, below barrel
  grip.position.set(0, -0.17, -0.3);

  // Position magazine forward of grip, below barrel
  magazine.position.set(0, -0.22, -0.05);

  // Position foregrip forward of magazine, below barrel
  foregrip.position.set(0, -0.13, 0.35);

  // Position small scope on top of barrel, centered
  scope.position.set(0, 0.13, 0.1);

  // Position stock behind grip
  stock.position.set(0, -0.08, -0.525);

  // Parent all to root
  barrel.parent = root;
  grip.parent = root;
  magazine.parent = root;
  foregrip.parent = root;
  scope.parent = root;
  stock.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(foregrip, true);
      sm.addShadowCaster(scope, true);
      sm.addShadowCaster(stock, true);
    }
  }

  return root;
}

/**
 * Dispose of assault rifle mesh and all children.
 */
export function disposeAssaultRifleMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
