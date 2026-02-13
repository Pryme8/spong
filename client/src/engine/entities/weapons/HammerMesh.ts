/**
 * Create a visual representation of a hammer using simple geometry.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from '../../rendering/primitives/MeshPrimitives';
import { registerShadowCasters, disposeMeshRoot } from '../../utils/MeshUtils';

export interface HammerMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a hammer mesh (handle + head) parented to a root node.
 * Bright emissive glow so it's easy to spot in the world.
 * Returns the root node for direct position control.
 */
export function createHammerMesh(name: string, scene: Scene, options?: HammerMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - wood brown for handle, metallic for head
  const handleColor = new Color3(0.5, 0.3, 0.1);      // Brown wood
  const headColor = new Color3(0.6, 0.6, 0.6);        // Gray metal
  const emissiveColor = new Color3(0.1, 0.1, 0.1);    // Subtle glow

  // Handle (vertical cylinder/box) using instanced rendering
  const handle = primitives.createBoxInstance(
    `${name}_handle`,
    0.08,   // width (X)
    0.6,    // height (Y) - long handle
    0.08,   // depth (Z)
    handleColor,
    emissiveColor
  );

  // Hammer head (horizontal box) using instanced rendering
  const head = primitives.createBoxInstance(
    `${name}_head`,
    0.3,    // width (X) - wide head
    0.15,   // height (Y)
    0.15,   // depth (Z)
    headColor,
    emissiveColor
  );

  // Position handle vertically
  handle.position.set(0, 0, 0);

  // Position head at top of handle
  head.position.set(0, 0.35, 0);

  // Parent both to the root
  handle.parent = root;
  head.parent = root;

  // Register shadows with self-shadowing if enabled
  registerShadowCasters([handle, head], hasShadows, true);

  return root;
}

/**
 * Dispose of hammer mesh and all children.
 */
export function disposeHammerMesh(name: string, scene: Scene): void {
  disposeMeshRoot(name, scene);
}
