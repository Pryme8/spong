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

  // Barrel (horizontal box) using instanced rendering
  const barrel = primitives.createBoxInstance(
    `${name}_barrel`,
    0.2,    // width (X)
    0.2,    // height (Y)
    0.5,    // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Grip (vertical box) using instanced rendering
  const grip = primitives.createBoxInstance(
    `${name}_grip`,
    0.2,    // width (X)
    0.35,   // height (Y)
    0.2,    // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Position barrel forward and slightly up
  barrel.position.set(0, 0.1, 0.12);

  // Position grip below and behind barrel
  grip.position.set(0, -0.12, -0.12);

  // Parent both to the root
  barrel.parent = root;
  grip.parent = root;

  // Register shadows with self-shadowing if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(barrel, true); // Enable self-shadows
      sm.addShadowCaster(grip, true); // Enable self-shadows
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
