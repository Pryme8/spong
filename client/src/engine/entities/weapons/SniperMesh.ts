/**
 * Create a visual representation of a sniper rifle using simple geometry.
 * Based on DMR with shorter frame, longer barrel, and horizontal foregrip.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from '../../rendering/primitives/MeshPrimitives';
import { createGrip, createIronSight, createBarrel, createMagazine, createStock } from '../../utils/WeaponParts';
import { registerShadowCasters, disposeMeshRoot } from '../../utils/MeshUtils';

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
  const colors = { diffuse: diffuseColor, emissive: emissiveColor };

  // Frame (horizontal box) - shorter than DMR
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.16,  // width (X)
    0.16,  // height (Y)
    0.7,   // depth (Z) - shorter than DMR
    diffuseColor,
    emissiveColor
  );

  // Shared weapon parts
  const grip = createGrip(name, primitives, colors);
  const magazine = createMagazine(name, primitives, 0.075, 0.1, 0.15, colors);
  const stock = createStock(name, primitives, 0.12, 0.25, 0.25, colors);
  const barrel = createBarrel(name, primitives, 0.16 * 0.5, 0.7, colors);
  const ironSight = createIronSight(name, primitives, colors);
  
  // Foregrip (horizontal box) - custom for sniper
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.12,  // width (X) - grip thickness
    0.1,   // height (Y) - shorter
    0.25,  // depth (Z) - grip length (horizontal)
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

  // Position barrel at end of frame, 2/3 up the frame, longer barrel
  // Note: barrel rotation handled by createBarrel()
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
  registerShadowCasters([frame, grip, magazine, foregrip, stock, barrel, ironSight, scope], hasShadows, true);

  return root;
}

/**
 * Dispose of sniper mesh and all children.
 */
export function disposeSniperMesh(name: string, scene: Scene): void {
  disposeMeshRoot(name, scene);
}
