/**
 * Create a visual representation of a sniper rifle using simple geometry.
 * Based on LMG design but without magazine and foregrip (single-shot weapon).
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface SniperMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a sniper rifle mesh with long barrel, grip, and stock.
 * Design: long barrel, grip, and stock - no magazine or foregrip (single shot).
 * Returns the root node for direct position control.
 */
export function createSniperMesh(name: string, scene: Scene, options?: SniperMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Barrel (extra long for sniper rifle)
  const barrel = MeshBuilder.CreateBox(`${name}_barrel`, {
    width: 0.12,   // X - thinner than LMG
    height: 0.12,  // Y - thinner
    depth: 1.2     // Z - much longer
  }, scene);

  // Grip (vertical box at back)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.18,   // X - thickness
    height: 0.35,  // Y - height
    depth: 0.2     // Z - depth
  }, scene);

  // Stock (extends back from grip for shoulder support)
  const stock = MeshBuilder.CreateBox(`${name}_stock`, {
    width: 0.12,   // X - narrower than grip
    height: 0.24,  // Y - tall for shoulder
    depth: 0.35    // Z - longer than LMG stock for stability
  }, scene);

  // Scope (small box on top of barrel)
  const scope = MeshBuilder.CreateBox(`${name}_scope`, {
    width: 0.08,   // X - narrow
    height: 0.15,  // Y - raised above barrel
    depth: 0.3     // Z - length of scope
  }, scene);

  // Dark metal material with slight color variation
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.15, 0.16, 0.18);   // Very dark gunmetal
  material.emissiveColor = new Color3(0.03, 0.03, 0.04); // Minimal glow
  material.specularColor = new Color3(0.6, 0.65, 0.7);   // High metallic shine

  // Scope material (slightly different for glass/optic look)
  const scopeMaterial = new StandardMaterial(`${name}_scope_mat`, scene);
  scopeMaterial.diffuseColor = new Color3(0.1, 0.1, 0.12);
  scopeMaterial.emissiveColor = new Color3(0.05, 0.05, 0.08);
  scopeMaterial.specularColor = new Color3(0.8, 0.8, 0.9); // More reflective

  barrel.material = material;
  grip.material = material;
  stock.material = material;
  scope.material = scopeMaterial;

  // Position barrel forward and centered (longer than LMG)
  barrel.position.set(0, 0, 0.4);

  // Position grip at back, below barrel
  grip.position.set(0, -0.17, -0.3);

  // Position stock behind grip, aligned with barrel height
  stock.position.set(0, -0.08, -0.625);

  // Position scope on top of barrel, towards the back
  scope.position.set(0, 0.14, 0.1);

  // Parent all to root
  barrel.parent = root;
  grip.parent = root;
  stock.parent = root;
  scope.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(stock, true);
      sm.addShadowCaster(scope, true);
    }
  }

  return root;
}

/**
 * Dispose of sniper mesh and all children.
 */
export function disposeSniperMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
