/**
 * Create a visual representation of a Helmet using instanced geometry.
 * Design: 5 bluish-gray boxes that wrap around the head.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface HelmetMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a Helmet mesh with 5 pieces (top, back, left, right, visor).
 * Returns the root node for direct position control.
 */
export function createHelmetMesh(name: string, scene: Scene, options?: HelmetMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Bluish-gray metallic color for helmet
  const helmetColor = new Color3(0.5, 0.55, 0.6);
  const helmetGlow = new Color3(0.1, 0.12, 0.14);

  // Helmet pickup is half size compared to player-worn helmet
  // All dimensions and positions scaled by 0.5

  // Top piece
  const top = primitives.createBoxInstance(`${name}_top`, 0.34, 0.06, 0.34, helmetColor, helmetGlow);
  top.position.set(0, 0.15, 0);

  // Back piece
  const back = primitives.createBoxInstance(`${name}_back`, 0.34, 0.26, 0.05, helmetColor, helmetGlow);
  back.position.set(0, 0, -0.145);

  // Left side flap
  const leftSide = primitives.createBoxInstance(`${name}_left`, 0.05, 0.26, 0.27, helmetColor, helmetGlow);
  leftSide.position.set(-0.145, 0, 0.025);

  // Right side flap
  const rightSide = primitives.createBoxInstance(`${name}_right`, 0.05, 0.26, 0.27, helmetColor, helmetGlow);
  rightSide.position.set(0.145, 0, 0.025);

  // Visor/forehead cover
  const visor = primitives.createBoxInstance(`${name}_visor`, 0.34, 0.12, 0.04, helmetColor, helmetGlow);
  visor.position.set(0, 0.06, 0.15);

  // Parent all pieces to root
  top.parent = root;
  back.parent = root;
  leftSide.parent = root;
  rightSide.parent = root;
  visor.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(top, true);
      sm.addShadowCaster(back, true);
      sm.addShadowCaster(leftSide, true);
      sm.addShadowCaster(rightSide, true);
      sm.addShadowCaster(visor, true);
    }
  }

  return root;
}

/**
 * Dispose of Helmet mesh and all children.
 */
export function disposeHelmetMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
