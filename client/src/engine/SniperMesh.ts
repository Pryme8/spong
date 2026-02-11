/**
 * Create a visual representation of a sniper rifle using simple geometry.
 * Based on DMR with shorter frame, longer barrel, and horizontal foregrip.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface SniperMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a sniper mesh with frame, barrel, grip, magazine, foregrip, stock, and scope.
 * Design: Long-range precision rifle with short frame and extended barrel.
 * Returns the root node for direct position control.
 */
export function createSniperMesh(name: string, scene: Scene, options?: SniperMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - tactical black
  const diffuseColor = new Color3(0.12, 0.12, 0.14);
  const emissiveColor = new Color3(0.02, 0.02, 0.03);

  // Frame (horizontal box) - shorter than DMR
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.16,  // width (X)
    0.16,  // height (Y)
    0.7,   // depth (Z) - shorter than DMR
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box at back) - matches DMR
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X) - matches DMR
    0.233, // height (Y) - matches DMR
    0.133, // depth (Z) - matches DMR
    diffuseColor,
    emissiveColor
  );

  // Magazine (box magazine forward of grip) - 1/3 height of DMR
  const magazine = primitives.createBoxInstance(
    `${name}_magazine`,
    0.075, // width (X) - matches DMR
    0.1,   // height (Y) - 1/3 of DMR height (0.3 / 3)
    0.15,  // depth (Z) - matches DMR
    diffuseColor,
    emissiveColor
  );

  // Foregrip (horizontal box)
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.12,  // width (X) - grip thickness
    0.1,   // height (Y) - shorter
    0.25,  // depth (Z) - grip length (horizontal)
    diffuseColor,
    emissiveColor
  );

  // Stock (extends back from grip) - taller
  const stock = primitives.createBoxInstance(
    `${name}_stock`,
    0.12,  // width (X)
    0.25,  // height (Y) - taller
    0.25,  // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Barrel (cylinder) - longer barrel for sniper rifle
  const barrelRadius = 0.16 * 0.5; // 1/2 of frame width
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius, // diameter = radius
    0.7,          // height (length of barrel protruding) - longer
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

  // Scope (cylinder for sniper rifle)
  const scope = primitives.createCylinderInstance(
    `${name}_scope`,
    0.18,  // diameter - 3x larger
    0.2,   // length - a bit shorter
    new Color3(0.15, 0.15, 0.18),
    new Color3(0.04, 0.04, 0.06)
  );

  // Position stock behind grip - moved back more
  stock.position.set(0, -0.08, -0.8);

  // Position frame to touch stock
  // Stock front edge at z = -0.8 + 0.25/2 = -0.675
  // Frame back edge should touch stock, so frame center at -0.675 + 0.7/2 = -0.325
  frame.position.set(0, 0, -0.325);

  // Position grip sitting on bottom of frame at back - moved forward a hair
  // Frame bottom = 0 - 0.16/2 = -0.08, grip top at Y + 0.233/2, so Y = -0.08 - 0.233/2 = -0.1965
  grip.position.set(0, -0.1965, -0.625);

  // Position magazine forward of grip, below frame
  magazine.position.set(0, -0.13, -0.325);

  // Position foregrip forward of magazine, below frame (horizontal)
  foregrip.position.set(0, -0.15, -0.075);

  // Rotate scope to point forward (horizontal cylinder) and 90 degrees on Y
  scope.rotation.z = Math.PI * 0.5;
  scope.rotation.y = Math.PI * 0.5;

  // Position scope on top of frame - moved back
  scope.position.set(0, 0.14, -0.425);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;

  // Position barrel at end of frame, 2/3 up the frame, longer barrel
  // Frame extends from z = -0.325 - 0.7/2 to -0.325 + 0.7/2 = -0.675 to 0.025
  // Frame Y position is 0, frame height 0.16, so 2/3 up = 0 + (0.16 * 2/3 - 0.16/2) = 0.02667
  // Barrel length 0.7, sticks out by 0.35, so center at 0.025 + 0.35 = 0.375
  barrel.position.set(0, 0.02667, 0.375);

  // Position iron sight moved back by its depth from end of frame, sitting on top
  // Frame top = 0 + 0.16/2 = 0.08, iron sight bottom at Y - 0.075/2, so Y = 0.08 + 0.075/2 = 0.1175
  // z = 0.025 - 0.04 (moved back by sight depth) = -0.015
  ironSight.position.set(0, 0.1175, -0.015);

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
 * Dispose of sniper mesh and all children.
 */
export function disposeSniperMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
