/**
 * Create a visual representation of a large medic pack using simple geometry.
 * Design: Same as small medic pack but 2x larger.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface LargeMedicPackMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a large medic pack mesh with white box and red cross (2x scale).
 * Returns the root node for direct position control.
 */
export function createLargeMedicPackMesh(name: string, scene: Scene, options?: LargeMedicPackMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions
  const boxColor = new Color3(0.95, 0.95, 0.95);         // Almost white
  const boxEmissive = new Color3(0.1, 0.1, 0.1);         // Slight glow
  const crossColor = new Color3(0.9, 0.1, 0.1);          // Bright red
  const crossEmissive = new Color3(0.8, 0.05, 0.05);     // Red glow

  // Main box (white/light gray medical case) - 2x size using instanced rendering
  const box = primitives.createBoxInstance(
    `${name}_box`,
    0.8,   // width (X) - 2x
    0.6,   // height (Y) - 2x
    0.3,   // depth (Z) - 2x
    boxColor,
    boxEmissive
  );

  // Red cross - horizontal bar (2x)
  const crossH = primitives.createBoxInstance(
    `${name}_cross_h`,
    0.5,   // width (X) - 2x
    0.1,   // height (Y) - 2x
    0.04,  // depth (Z) - 2x
    crossColor,
    crossEmissive
  );

  // Red cross - vertical bar (2x)
  const crossV = primitives.createBoxInstance(
    `${name}_cross_v`,
    0.1,   // width (X) - 2x
    0.5,   // height (Y) - 2x
    0.04,  // depth (Z) - 2x
    crossColor,
    crossEmissive
  );

  // Position main box at center
  box.position.set(0, 0, 0);

  // Position red cross on the side (front face, offset slightly to sit on surface)
  crossH.position.set(0, 0, 0.152); // Z offset to sit on front face (depth/2 + 0.002)
  crossV.position.set(0, 0, 0.152); // Z offset to sit on front face (depth/2 + 0.002)

  // Parent all to root
  box.parent = root;
  crossH.parent = root;
  crossV.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(box, true);
      sm.addShadowCaster(crossH, true);
      sm.addShadowCaster(crossV, true);
    }
  }

  return root;
}

/**
 * Dispose of large medic pack mesh and all children.
 */
export function disposeLargeMedicPackMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
