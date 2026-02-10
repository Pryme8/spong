/**
 * Create a visual representation of an apple using instanced geometry.
 * Design: Red sphere with brown stem and green rotated leaf.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface AppleMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create an apple mesh with red sphere body, brown stem, and green leaf.
 * Returns the root node for direct position control.
 */
export function createAppleMesh(name: string, scene: Scene, options?: AppleMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions
  const appleRed = new Color3(0.9, 0.15, 0.1);       // Bright red apple
  const appleShine = new Color3(0.2, 0.05, 0.05);    // Subtle red glow
  const stemBrown = new Color3(0.4, 0.25, 0.15);     // Brown stem
  const leafGreen = new Color3(0.2, 0.7, 0.2);       // Bright green leaf
  const leafGlow = new Color3(0.1, 0.3, 0.1);        // Green glow

  // Apple body (red sphere) - 0.3 diameter
  const apple = primitives.createSphereInstance(
    `${name}_body`,
    0.3,
    appleRed,
    appleShine
  );

  // Stem (thin brown vertical box at top)
  const stem = primitives.createBoxInstance(
    `${name}_stem`,
    0.03,  // width (X) - very thin
    0.08,  // height (Y) - small vertical stick
    0.03,  // depth (Z) - very thin
    stemBrown
  );

  // Leaf (green box rotated 45 degrees)
  const leaf = primitives.createBoxInstance(
    `${name}_leaf`,
    0.12,  // width (X)
    0.02,  // height (Y) - thin flat leaf
    0.06,  // depth (Z)
    leafGreen,
    leafGlow
  );

  // Position apple at center
  apple.position.set(0, 0, 0);

  // Position stem at top of apple
  stem.position.set(0, 0.19, 0); // Top of apple (0.15 radius + 0.04 half stem height)

  // Position and rotate leaf at base of stem
  leaf.position.set(0.04, 0.18, 0); // Slightly offset to the side
  leaf.rotation.set(0, 0, Math.PI / 4); // Rotate 45 degrees around Z axis

  // Parent all to root
  apple.parent = root;
  stem.parent = root;
  leaf.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(apple, true);
      sm.addShadowCaster(stem, true);
      sm.addShadowCaster(leaf, true);
    }
  }

  return root;
}

/**
 * Dispose of apple mesh and all children.
 */
export function disposeAppleMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
