/**
 * Create a visual representation of a pistol using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface PistolMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a pistol mesh (barrel + grip) parented to a root node.
 * Bright emissive glow so it's easy to spot in the world.
 * Returns the root node for direct position control.
 */
export function createPistolMesh(name: string, scene: Scene, options?: PistolMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition
  const diffuseColor = new Color3(0.6, 0.5, 0.0);      // Darker gold
  const emissiveColor = new Color3(0.15, 0.1, 0.0);   // Subtle glow

  // Grip (vertical box) using instanced rendering - 3/4 width
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.1,    // width (X) - 3/4 of 0.133
    0.233,  // height (Y) - 2/3 of 0.35
    0.133,  // depth (Z) - 2/3 of 0.2
    diffuseColor,
    emissiveColor
  );

  // Frame (horizontal box) using instanced rendering - matches grip width/depth, longer, slightly taller
  const frame = primitives.createBoxInstance(
    `${name}_frame`,
    0.133,  // width (X) - matches grip
    0.16,   // height (Y) - a hair taller
    0.6,    // depth (Z) - longer
    diffuseColor,
    emissiveColor
  );

  // Barrel (cylinder) - actual barrel protruding from frame
  const barrelRadius = 0.133 * 0.5; // 1/2 of frame width (doubled)
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    barrelRadius,  // diameter = radius
    0.15,          // height (length of barrel protruding)
    diffuseColor,
    emissiveColor
  );

  // Iron sight (small vertical box at front of frame) - half width
  const ironSight = primitives.createBoxInstance(
    `${name}_iron_sight`,
    0.02,   // width (X) - half of previous (was 0.04)
    0.075,  // height (Y) - tall enough to see
    0.04,   // depth (Z) - narrow
    diffuseColor,
    emissiveColor
  );

  // Position grip sitting on bottom of frame
  // Frame bottom = 0.1 - 0.16/2 = 0.02, grip top at Y + 0.233/2, so Y = 0.02 - 0.233/2 = -0.0965
  grip.position.set(0, -0.0965, -0.12);

  // Position frame to hang over grip slightly - moved back
  frame.position.set(0, 0.1, 0.0);

  // Rotate barrel to point forward (cylinders are vertical by default)
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;
  
  // Position barrel at end of frame, 2/3 up the frame, moved back into frame
  // Frame extends from z = 0.0 - 0.6/2 to 0.0 + 0.6/2 = -0.3 to 0.3
  // Frame Y position is 0.1, frame height 0.16, so 2/3 up = 0.1 + (0.16 * 2/3 - 0.16/2) = 0.1 + 0.02667 = 0.12667
  // Moved back into frame by 0.1: z = 0.275 (was 0.375)
  barrel.position.set(0, 0.12667, 0.275);

  // Position iron sight moved back by its depth (0.04) from previous position
  // Frame top = 0.1 + 0.16/2 = 0.18, iron sight bottom at Y - 0.075/2, so Y = 0.18 + 0.075/2 = 0.2175
  // Previous Z was 0.3, move back by 0.04 = 0.26
  ironSight.position.set(0, 0.2175, 0.26);

  // Parent all to the root
  frame.parent = root;
  grip.parent = root;
  barrel.parent = root;
  ironSight.parent = root;

  // Register shadows with self-shadowing if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(frame, true); // Enable self-shadows
      sm.addShadowCaster(grip, true); // Enable self-shadows
      sm.addShadowCaster(barrel, true); // Enable self-shadows
      sm.addShadowCaster(ironSight, true); // Enable self-shadows
    }
  }

  return root;
}

/**
 * Dispose of pistol mesh and all children.
 */
export function disposePistolMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
