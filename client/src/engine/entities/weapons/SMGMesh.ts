/**
 * Create a visual representation of a submachine gun using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from '../../rendering/primitives/MeshPrimitives';
import { createGrip, createIronSight, createBarrel, createMagazine, createForegrip } from '../../utils/WeaponParts';
import { registerShadowCasters, disposeMeshRoot } from '../../utils/MeshUtils';

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
  const colors = { diffuse: diffuseColor, emissive: emissiveColor };

  // Frame (horizontal box) - bigger and longer than pistol
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.15,  // width (X) - bigger than pistol
    0.18,  // height (Y) - bigger than pistol
    0.7,   // depth (Z) - longer than pistol
    diffuseColor,
    emissiveColor
  );

  // Shared weapon parts
  const grip = createGrip(name, primitives, colors);
  const magazine = createMagazine(name, primitives, 0.075, 0.25, 0.15, colors);
  const foregrip = createForegrip(name, primitives, 0.1, 0.175, 0.1, colors);
  const barrel = createBarrel(name, primitives, 0.15 * 0.5, 0.2, colors);
  const ironSight = createIronSight(name, primitives, colors);

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

  // Position barrel at end of frame, 2/3 up the frame, half as much protruding
  // Note: barrel rotation handled by createBarrel()
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
  registerShadowCasters([frame, grip, magazine, foregrip, barrel, ironSight], hasShadows, true);

  return root;
}

/**
 * Dispose of SMG mesh and all children.
 */
export function disposeSMGMesh(name: string, scene: Scene): void {
  disposeMeshRoot(name, scene);
}
