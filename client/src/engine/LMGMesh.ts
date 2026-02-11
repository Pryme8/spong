/**
 * Create a visual representation of a light machine gun using simple geometry.
 * LMG with rail, wide magazine, and bipod for suppressive fire.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface LMGMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an LMG mesh with frame, barrel, grip, wide magazine, bipod, stock, and rail.
 * Design: Heavy suppressive fire weapon with bipod support.
 * Returns the root node for direct position control.
 */
export function createLMGMesh(name: string, scene: Scene, options?: LMGMeshOptions): TransformNode {
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

  // Grip (vertical box at back) - matches DMR
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X) - matches DMR
    0.233, // height (Y) - matches DMR
    0.133, // depth (Z) - matches DMR
    diffuseColor,
    emissiveColor
  );

  // Magazine (box magazine forward of grip) - wide box magazine
  const magazine = primitives.createBoxInstance(
    `${name}_magazine`,
    0.35,  // width (X) - wider
    0.3,   // height (Y) - shorter
    0.15,  // depth (Z) - matches DMR
    diffuseColor,
    emissiveColor
  );

  // Bipod leg 1 (tall thin block) - left leg
  const bipodLeg1 = primitives.createBoxInstance(
    `${name}_bipod_leg1`,
    0.03,  // width (X) - thin
    0.32,  // height (Y) - longer
    0.03,  // depth (Z) - thin
    diffuseColor,
    emissiveColor
  );

  // Bipod leg 2 (tall thin block) - right leg
  const bipodLeg2 = primitives.createBoxInstance(
    `${name}_bipod_leg2`,
    0.03,  // width (X) - thin
    0.32,  // height (Y) - longer
    0.03,  // depth (Z) - thin
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

  // Barrel (cylinder) - longer barrel
  const barrelRadius = 0.16 * 0.5; // 1/2 of frame width
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius, // diameter = radius
    0.5,          // height (length of barrel protruding) - longer
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

  // Rail (small long cube on top of frame)
  const rail = primitives.createBoxInstance(
    `${name}_rail`,
    0.05,  // width (X) - small
    0.03,  // height (Y) - small
    0.75,  // depth (Z) - runs most of frame length
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
  grip.position.set(0, -0.1965, -0.5);

  // Position magazine forward of grip, below frame - moved back more
  magazine.position.set(0, -0.22, -0.225);

  // Position bipod legs forward of magazine, folded up against frame (V pointing out)
  // Left leg angled outward
  bipodLeg1.position.set(-0.08, -0.08, 0.25);
  bipodLeg1.rotation.x = -Math.PI * 0.5; // Flip 90 degrees (opposite direction)
  bipodLeg1.rotation.z = -Math.PI * 0.15; // Angle outward

  // Right leg angled outward
  bipodLeg2.position.set(0.08, -0.08, 0.25);
  bipodLeg2.rotation.x = -Math.PI * 0.5; // Flip 90 degrees (opposite direction)
  bipodLeg2.rotation.z = Math.PI * 0.15; // Angle outward

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

  // Position rail on top of frame (moved back a bit)
  // Frame top = 0 + 0.16/2 = 0.08, rail bottom at Y - 0.03/2, so Y = 0.08 + 0.03/2 = 0.095
  rail.position.set(0, 0.095, -0.25);

  // Parent all to root
  frame.parent = root;
  grip.parent = root;
  magazine.parent = root;
  bipodLeg1.parent = root;
  bipodLeg2.parent = root;
  stock.parent = root;
  barrel.parent = root;
  ironSight.parent = root;
  rail.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(magazine, true);
      sm.addShadowCaster(bipodLeg1, true);
      sm.addShadowCaster(bipodLeg2, true);
      sm.addShadowCaster(stock, true);
      sm.addShadowCaster(barrel, true);
      sm.addShadowCaster(ironSight, true);
      sm.addShadowCaster(rail, true);
    }
  }

  return root;
}

/**
 * Dispose of LMG mesh and all children.
 */
export function disposeLMGMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
