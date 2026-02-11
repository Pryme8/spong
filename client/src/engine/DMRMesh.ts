/**
 * Create a visual representation of a DMR (Designated Marksman Rifle) using simple geometry.
 * Precision rifle with scope for medium-long range engagements.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface DMRMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a DMR mesh with frame, barrel, grip, magazine, foregrip, stock, and scope.
 * Design: Precision marksman rifle with tactical elements.
 * Returns the root node for direct position control.
 */
export function createDMRMesh(name: string, scene: Scene, options?: DMRMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - tactical black
  const diffuseColor = new Color3(0.12, 0.12, 0.14);
  const emissiveColor = new Color3(0.02, 0.02, 0.03);

  // Frame (horizontal box) - longer
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.16,  // width (X)
    0.16,  // height (Y)
    0.9,   // depth (Z) - longer
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

  // Magazine (box magazine forward of grip) - a little shorter
  const magazine = primitives.createBoxInstance(
    `${name}_magazine`,
    0.075, // width (X) - matches SMG
    0.3,   // height (Y) - a little shorter
    0.15,  // depth (Z) - matches SMG
    diffuseColor,
    emissiveColor
  );

  // Foregrip (horizontal box like shotgun)
  const foregrip = primitives.createBoxInstance(
    `${name}_foregrip`,
    0.12,  // width (X) - grip thickness (less wide)
    0.1,   // height (Y) - shorter
    0.25,  // depth (Z) - grip length (longer)
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

  // Barrel (cylinder) - longer barrel for marksman rifle
  const barrelRadius = 0.16 * 0.5; // 1/2 of frame width
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius, // diameter = radius
    0.5,          // height (length of barrel protruding) - longer to match
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

  // Scope (cylinder for marksman rifle)
  const scope = primitives.createCylinderInstance(
    `${name}_scope`,
    0.18,  // diameter - 3x larger
    0.2,   // length - a bit shorter
    new Color3(0.15, 0.15, 0.18),
    new Color3(0.04, 0.04, 0.06)
  );

  // Position stock behind grip - moved back more
  stock.position.set(0, -0.08, -0.8);

  // Position frame to touch stock - moved back more
  // Stock front edge at z = -0.8 + 0.25/2 = -0.675
  // Frame back edge should touch stock, so frame center at -0.675 + 0.9/2 = -0.225
  frame.position.set(0, 0, -0.225);

  // Position grip sitting on bottom of frame at back
  // Frame bottom = 0 - 0.16/2 = -0.08, grip top at Y + 0.233/2, so Y = -0.08 - 0.233/2 = -0.1965
  grip.position.set(0, -0.1965, -0.575);

  // Position magazine forward of grip, below frame - moved back more
  magazine.position.set(0, -0.22, -0.225);

  // Position foregrip forward of magazine, below frame (horizontal) - moved back more
  foregrip.position.set(0, -0.15, 0.0);

  // Rotate scope to point forward (horizontal cylinder) and 90 degrees on Y
  scope.rotation.z = Math.PI * 0.5;
  scope.rotation.y = Math.PI * 0.5;

  // Position scope on top of frame
  scope.position.set(0, 0.14, -0.275);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;

  // Position barrel at end of frame, 2/3 up the frame, longer barrel
  // Frame extends from z = -0.225 - 0.9/2 to -0.225 + 0.9/2 = -0.675 to 0.225
  // Frame Y position is 0, frame height 0.16, so 2/3 up = 0 + (0.16 * 2/3 - 0.16/2) = 0.02667
  // Barrel length 0.5, sticks out by 0.125, so center at 0.225 + 0.125 = 0.35
  barrel.position.set(0, 0.02667, 0.35);

  // Position iron sight moved back by its depth from end of frame, sitting on top - moved back more
  // Frame top = 0 + 0.16/2 = 0.08, iron sight bottom at Y - 0.075/2, so Y = 0.08 + 0.075/2 = 0.1175
  // z = 0.225 - 0.04 (moved back by sight depth) = 0.185
  ironSight.position.set(0, 0.1175, 0.185);

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
 * Dispose of DMR mesh and all children.
 */
export function disposeDMRMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
