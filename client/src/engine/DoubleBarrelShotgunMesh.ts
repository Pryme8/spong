/**
 * Create a visual representation of a double barrel shotgun using simple geometry.
 * Based on shotgun but with two side-by-side barrels and frame width/height swapped.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface DoubleBarrelShotgunMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a double barrel shotgun mesh with frame, two barrels, grip, and horizontal foregrip.
 * Design: Classic double barrel shotgun with side-by-side barrels.
 * Returns the root node for direct position control.
 */
export function createDoubleBarrelShotgunMesh(name: string, scene: Scene, options?: DoubleBarrelShotgunMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - dark brown-metal (classic shotgun)
  const diffuseColor = new Color3(0.15, 0.13, 0.12);
  const emissiveColor = new Color3(0.03, 0.025, 0.02);

  // Frame (horizontal box) - width and height swapped from shotgun
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.2,   // width (X) - swapped with height
    0.15,  // height (Y) - swapped with width
    0.8,   // depth (Z) - same as shotgun
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box at back) - same as shotgun
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X)
    0.233, // height (Y)
    0.133, // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Front pistol grip (vertical)
  const frontGrip = primitives.createBoxInstance(
    `${name}_front_grip`,
    0.09,  // width (X)
    0.18,  // height (Y)
    0.12,  // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Barrel 1 (left cylinder)
  const barrelDiameter = 0.15 * 0.6; // same diameter as shotgun
  const barrelRadius = barrelDiameter * 0.5;
  const barrel1 = primitives.createCylinderInstance(
    `${name}_barrel1`,
    barrelDiameter,
    0.2,
    diffuseColor,
    emissiveColor
  );

  // Barrel 2 (right cylinder)
  const barrel2 = primitives.createCylinderInstance(
    `${name}_barrel2`,
    barrelDiameter,
    0.2,
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

  // Position frame to hang back past grip
  frame.position.set(0, 0, 0.1);

  // Position grip sitting on bottom of frame at back
  // Frame bottom = 0 - 0.15/2 = -0.075, grip top at Y + 0.233/2, so Y = -0.075 - 0.233/2 = -0.1915
  grip.position.set(0, -0.1915, -0.25);

  // Position front grip forward, below frame
  frontGrip.position.set(0, -0.17, 0.24);

  // Rotate barrels to point forward
  barrel1.rotation.z = Math.PI * 0.5;
  barrel1.rotation.y = Math.PI * 0.5;
  barrel2.rotation.z = Math.PI * 0.5;
  barrel2.rotation.y = Math.PI * 0.5;

  // Position barrel 1 (left) - offset to the left
  // Frame extends from z = 0.1 - 0.8/2 to 0.1 + 0.8/2 = -0.3 to 0.5
  // Frame Y position is 0, frame height 0.15, so 2/3 up = 0 + (0.15 * 2/3 - 0.15/2) = 0.025
  // Barrel length 0.2, sticks out by 0.05, so center at 0.5 + 0.05 = 0.55
  // Offset left by barrel radius so barrels touch
  const barrelSpacing = barrelRadius;
  barrel1.position.set(-barrelSpacing, 0.025, 0.55);

  // Position barrel 2 (right) - offset to the right
  barrel2.position.set(barrelSpacing, 0.025, 0.55);

  // Position iron sight moved back by its depth from end of frame, sitting on top
  // Frame top = 0 + 0.15/2 = 0.075, iron sight bottom at Y - 0.075/2, so Y = 0.075 + 0.075/2 = 0.1125
  // z = 0.5 - 0.04 (moved back by sight depth) = 0.46
  ironSight.position.set(0, 0.1125, 0.46);

  // Parent all to root
  frame.parent = root;
  grip.parent = root;
  frontGrip.parent = root;
  barrel1.parent = root;
  barrel2.parent = root;
  ironSight.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(frontGrip, true);
      sm.addShadowCaster(barrel1, true);
      sm.addShadowCaster(barrel2, true);
      sm.addShadowCaster(ironSight, true);
    }
  }

  return root;
}

/**
 * Dispose of double barrel shotgun mesh and all children.
 */
export function disposeDoubleBarrelShotgunMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
