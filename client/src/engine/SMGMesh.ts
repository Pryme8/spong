/**
 * Create a visual representation of a submachine gun using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface SMGMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an SMG mesh with frame, barrel, grip, magazine, and foregrip.
 * Design: longer frame than pistol, cylindrical barrel, magazine, and foregrip.
 * Returns the root node for direct position control.
 */
export function createSMGMesh(name: string, scene: Scene, options?: SMGMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - dark gunmetal
  const diffuseColor = new Color3(0.2, 0.2, 0.25);
  const emissiveColor = new Color3(0.05, 0.05, 0.08);

  // Frame (horizontal box) - bigger and longer than pistol
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.15,  // width (X) - bigger than pistol
    0.18,  // height (Y) - bigger than pistol
    0.7,   // depth (Z) - longer than pistol
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box at back) - same as pistol, 3/4 width
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X) - 3/4 of 0.133
    0.233, // height (Y) - same as pistol
    0.133, // depth (Z) - same as pistol
    diffuseColor,
    emissiveColor
  );

  // Magazine (box forward of grip) - half width of frame
  const magazine = primitives.createBoxInstance(
    `${name}_magazine`,
    0.075, // width (X) - half of frame width (0.15 / 2)
    0.25,  // height (Y)
    0.15,  // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Foregrip (forward box) - 3/4 height of back grip, 3/4 width
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.1,   // width (X) - 3/4 of 0.133
    0.175, // height (Y) - 3/4 of 0.233
    0.1,   // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Barrel (cylinder) - actual barrel protruding from frame
  const barrelRadius = 0.15 * 0.5; // 1/2 of frame width
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
  // Grip at z = -0.25, frame back edge should be at -0.3, so frame center at -0.3 + 0.7/2 = 0.05
  frame.position.set(0, 0, 0.05);

  // Position grip sitting on bottom of frame at back
  // Frame bottom = 0 - 0.18/2 = -0.09, grip top at Y + 0.233/2, so Y = -0.09 - 0.233/2 = -0.2065
  grip.position.set(0, -0.2065, -0.25);

  // Position magazine forward of grip, below frame
  magazine.position.set(0, -0.15, 0.0);

  // Position foregrip forward of magazine, below frame
  foregrip.position.set(0, -0.14, 0.3);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;

  // Position barrel at end of frame, 2/3 up the frame, half as much protruding
  // Frame extends from z = 0.05 - 0.7/2 to 0.05 + 0.7/2 = -0.3 to 0.4
  // Frame Y position is 0, frame height 0.18, so 2/3 up = 0 + (0.18 * 2/3 - 0.18/2) = 0.03
  // Barrel length 0.2, sticks out by 0.05, so center at 0.4 + 0.05 = 0.45
  barrel.position.set(0, 0.03, 0.45);

  // Position iron sight moved back by its depth from end of frame, sitting on top
  // Frame top = 0 + 0.18/2 = 0.09, iron sight bottom at Y - 0.075/2, so Y = 0.09 + 0.075/2 = 0.1275
  // z = 0.4 - 0.04 (moved back by sight depth) = 0.36
  ironSight.position.set(0, 0.1275, 0.36);

  // Parent all to root
  frame.parent = root;
  grip.parent = root;
  magazine.parent = root;
  foregrip.parent = root;
  barrel.parent = root;
  ironSight.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(foregrip, true);
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(ironSight, true);
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
