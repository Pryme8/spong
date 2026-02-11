/**
 * Create a visual representation of a shotgun using simple geometry.
 * Based on SMG but with magazine removed and horizontal forward grip (pump-action).
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface ShotgunMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a shotgun mesh with frame, barrel, grip, and horizontal foregrip.
 * Design: Pump-action shotgun with no magazine, horizontal forward grip.
 * Returns the root node for direct position control.
 */
export function createShotgunMesh(name: string, scene: Scene, options?: ShotgunMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - dark brown-metal (classic shotgun)
  const diffuseColor = new Color3(0.15, 0.13, 0.12);
  const emissiveColor = new Color3(0.03, 0.025, 0.02);

  // Frame (horizontal box) - bigger and longer than pistol
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.15,  // width (X) - bigger than pistol
    0.18,  // height (Y) - bigger than pistol
    0.8,   // depth (Z) - longer
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box at back) - same as SMG
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X) - 3/4 of 0.133
    0.233, // height (Y) - same as pistol
    0.133, // depth (Z) - same as pistol
    diffuseColor,
    emissiveColor
  );

  // Foregrip (horizontal box pointing forward - pump action)
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.12,  // width (X) - grip thickness
    0.1,   // height (Y) - shorter
    0.25,  // depth (Z) - grip length (horizontal)
    diffuseColor,
    emissiveColor
  );

  // Barrel (cylinder) - actual barrel protruding from frame, bigger diameter
  const barrelRadius = 0.15 * 0.6; // bigger diameter
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius, // diameter = radius
    0.2,          // height (length of barrel protruding)
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

  // Position frame to hang back past grip (0.05 units)
  // Grip at z = -0.25, frame back edge should be at -0.3, so frame center at -0.3 + 0.8/2 = 0.1
  frame.position.set(0, 0, 0.1);

  // Position grip sitting on bottom of frame at back
  // Frame bottom = 0 - 0.18/2 = -0.09, grip top at Y + 0.233/2, so Y = -0.09 - 0.233/2 = -0.2065
  grip.position.set(0, -0.2065, -0.25);

  // Position foregrip forward, below frame (horizontal pump-action grip)
  foregrip.position.set(0, -0.15, 0.3);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;

  // Position barrel at end of frame, 2/3 up the frame
  // Frame extends from z = 0.1 - 0.8/2 to 0.1 + 0.8/2 = -0.3 to 0.5
  // Frame Y position is 0, frame height 0.18, so 2/3 up = 0 + (0.18 * 2/3 - 0.18/2) = 0.03
  // Barrel length 0.2, sticks out by 0.05, so center at 0.5 + 0.05 = 0.55
  barrel.position.set(0, 0.03, 0.55);

  // Position iron sight moved back by its depth from end of frame, sitting on top
  // Frame top = 0 + 0.18/2 = 0.09, iron sight bottom at Y - 0.075/2, so Y = 0.09 + 0.075/2 = 0.1275
  // z = 0.5 - 0.04 (moved back by sight depth) = 0.46
  ironSight.position.set(0, 0.1275, 0.46);

  // Parent all to root
  frame.parent = root;
  grip.parent = root;
  foregrip.parent = root;
  barrel.parent = root;
  ironSight.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(foregrip, true);
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(ironSight, true);
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
