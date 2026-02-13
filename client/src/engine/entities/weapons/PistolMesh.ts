/**
 * Create a visual representation of a pistol using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from '../../rendering/primitives/MeshPrimitives';
import { createGrip, createIronSight, createBarrel } from '../../utils/WeaponParts';
import { registerShadowCasters, disposeMeshRoot } from '../../utils/MeshUtils';

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
  const colors = { diffuse: diffuseColor, emissive: emissiveColor };

  // Grip (vertical box) using shared weapon part
  const grip = createGrip(name, primitives, colors);

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
  const barrel = createBarrel(name, primitives, barrelRadius, 0.15, colors);

  // Iron sight (small vertical box at front of frame) - using shared weapon part
  const ironSight = createIronSight(name, primitives, colors);

  // Position grip sitting on bottom of frame
  // Frame bottom = 0.1 - 0.16/2 = 0.02, grip top at Y + 0.233/2, so Y = 0.02 - 0.233/2 = -0.0965
  grip.position.set(0, -0.0965, -0.12);

  // Position frame to hang over grip slightly - moved back
  frame.position.set(0, 0.1, 0.0);

  // Position barrel at end of frame, 2/3 up the frame, moved back into frame
  // Frame extends from z = 0.0 - 0.6/2 to 0.0 + 0.6/2 = -0.3 to 0.3
  // Frame Y position is 0.1, frame height 0.16, so 2/3 up = 0.1 + (0.16 * 2/3 - 0.16/2) = 0.1 + 0.02667 = 0.12667
  // Moved back into frame by 0.1: z = 0.275 (was 0.375)
  // Note: barrel rotation handled by createBarrel()
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
  registerShadowCasters([frame, grip, barrel, ironSight], hasShadows, true);

  return root;
}

/**
 * Dispose of pistol mesh and all children.
 */
export function disposePistolMesh(name: string, scene: Scene): void {
  disposeMeshRoot(name, scene);
}
