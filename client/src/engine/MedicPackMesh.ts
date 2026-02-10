/**
 * Create a visual representation of a medic pack using simple geometry.
 * Design: Short box with a red cross on the side.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface MedicPackMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a medic pack mesh with white box and red cross.
 * Returns the root node for direct position control.
 */
export function createMedicPackMesh(name: string, scene: Scene, options?: MedicPackMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions
  const boxColor = new Color3(0.95, 0.95, 0.95);         // Almost white
  const boxEmissive = new Color3(0.1, 0.1, 0.1);         // Slight glow
  const crossColor = new Color3(0.9, 0.1, 0.1);          // Bright red
  const crossEmissive = new Color3(0.8, 0.05, 0.05);     // Red glow

  // Main box (white/light gray medical case) using instanced rendering
  const box = primitives.createBoxInstance(
    `${name}_box`,
    0.4,   // width (X)
    0.3,   // height (Y)
    0.15,  // depth (Z)
    boxColor,
    boxEmissive
  );

  // Red cross - horizontal bar
  const crossH = primitives.createBoxInstance(
    `${name}_cross_h`,
    0.25,  // width (X)
    0.05,  // height (Y)
    0.02,  // depth (Z)
    crossColor,
    crossEmissive
  );

  // Red cross - vertical bar
  const crossV = primitives.createBoxInstance(
    `${name}_cross_v`,
    0.05,  // width (X)
    0.25,  // height (Y)
    0.02,  // depth (Z)
    crossColor,
    crossEmissive
  );

  // Position main box at center
  box.position.set(0, 0, 0);

  // Position red cross on the side (front face, offset slightly to sit on surface)
  crossH.position.set(0, 0, 0.076); // Z offset to sit on front face (depth/2 + 0.001)
  crossV.position.set(0, 0, 0.076); // Z offset to sit on front face (depth/2 + 0.001)

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
 * Dispose of medic pack mesh and all children.
 */
export function disposeMedicPackMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
