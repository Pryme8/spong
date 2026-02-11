/**
 * Create a visual representation of an assault rifle using simple geometry.
 * Combines elements from sniper (longer barrel, scope) and SMG (magazine, foregrip).
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface AssaultRifleMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an assault rifle mesh with frame, barrel, grip, magazine, foregrip, stock, and scope.
 * Design: Military-style rifle with tactical elements.
 * Returns the root node for direct position control.
 */
export function createAssaultRifleMesh(name: string, scene: Scene, options?: AssaultRifleMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - tactical black
  const diffuseColor = new Color3(0.12, 0.12, 0.14);
  const emissiveColor = new Color3(0.02, 0.02, 0.03);

  // Frame (horizontal box) - a tad bit longer
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.16,  // width (X)
    0.16,  // height (Y)
    0.75,  // depth (Z) - a tad longer
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box at back) - matches SMG
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X) - matches SMG
    0.233, // height (Y) - matches SMG
    0.133, // depth (Z) - matches SMG
    diffuseColor,
    emissiveColor
  );

  // Magazine (box magazine forward of grip) - 1.5x taller than SMG
  const magazine = primitives.createBoxInstance(
    `${name}_magazine`,
    0.075, // width (X) - matches SMG
    0.375, // height (Y) - 1.5x SMG (0.25 * 1.5)
    0.15,  // depth (Z) - matches SMG
    diffuseColor,
    emissiveColor
  );

  // Foregrip (forward box) - matches SMG
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.1,   // width (X) - matches SMG
    0.175, // height (Y) - matches SMG
    0.1,   // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Stock (extends back from grip) - taller
  const stock = primitives.createBoxInstance(
    `${name}_stock`,
    0.12,  // width (X)
    0.25,  // height (Y) - taller (was 0.18)
    0.25,  // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Barrel (cylinder) - actual barrel protruding from frame
  const barrelRadius = 0.16 * 0.5; // 1/2 of frame width
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius, // diameter = radius
    0.25,         // height (length of barrel protruding)
    diffuseColor,
    emissiveColor
  );

  // Iron sight (small vertical box at front of frame)
  const ironSight = primitives.createBoxInstance(
    `${name}_iron_sight`,
    0.02,   // width (X)
    0.075,  // height (Y)
    0.04,   // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Small scope/red dot sight (using MeshBuilder for custom material)
  const scope = MeshBuilder.CreateBox(`${name}_scope`, {
    width: 0.08,
    height: 0.12,
    depth: 0.2
  }, scene);

  const scopeMaterial = new StandardMaterial(`${name}_scope_mat`, scene);
  scopeMaterial.diffuseColor = new Color3(0.15, 0.15, 0.18);
  scopeMaterial.emissiveColor = new Color3(0.04, 0.04, 0.06);
  scopeMaterial.specularColor = new Color3(0.7, 0.7, 0.8);
  scope.material = scopeMaterial;

  // Position stock behind grip - moved back a bit
  stock.position.set(0, -0.08, -0.6);

  // Position frame to touch stock
  // Stock front edge at z = -0.6 + 0.25/2 = -0.475
  // Frame back edge should touch stock, so frame center at -0.475 + 0.75/2 = -0.1
  frame.position.set(0, 0, -0.1);

  // Position grip sitting on bottom of frame at back
  // Frame bottom = 0 - 0.16/2 = -0.08, grip top at Y + 0.233/2, so Y = -0.08 - 0.233/2 = -0.1965
  grip.position.set(0, -0.1965, -0.35);

  // Position magazine forward of grip, below frame
  magazine.position.set(0, -0.22, -0.05);

  // Position foregrip forward of magazine, below frame
  foregrip.position.set(0, -0.14, 0.2);

  // Position small scope on top of frame, between magazine and grip
  scope.position.set(0, 0.13, -0.2);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;

  // Position barrel at end of frame, 2/3 up the frame, protruding slightly
  // Frame extends from z = -0.1 - 0.75/2 to -0.1 + 0.75/2 = -0.475 to 0.275
  // Frame Y position is 0, frame height 0.16, so 2/3 up = 0 + (0.16 * 2/3 - 0.16/2) = 0.02667
  // Barrel length 0.25, sticks out by 0.05, so center at 0.275 + 0.05 = 0.325
  barrel.position.set(0, 0.02667, 0.325);

  // Position iron sight moved back by its depth from end of frame, sitting on top
  // Frame top = 0 + 0.16/2 = 0.08, iron sight bottom at Y - 0.075/2, so Y = 0.08 + 0.075/2 = 0.1175
  // z = 0.275 - 0.04 (moved back by sight depth) = 0.235
  ironSight.position.set(0, 0.1175, 0.235);

  // Parent all to root
  frame.parent = root;
  grip.parent = root;
  magazine.parent = root;
  foregrip.parent = root;
  stock.parent = root;
  barrel.parent = root;
  ironSight.parent = root;
  scope.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(foregrip, true);
      sm.addShadowCaster(stock, true);
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(ironSight, true);
      sm.addShadowCaster(scope, true);
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
