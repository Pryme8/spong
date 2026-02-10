/**
 * Create a visual representation of Kevlar armor using instanced geometry.
 * Design: Tan box with two tan boxes on top (shoulder straps).
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface KevlarMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a Kevlar vest mesh with shoulder straps.
 * Returns the root node for direct position control.
 */
export function createKevlarMesh(name: string, scene: Scene, options?: KevlarMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Tan color for kevlar
  const tanColor = new Color3(0.8, 0.7, 0.5);
  const tanGlow = new Color3(0.15, 0.12, 0.08);

  // Main vest body
  const vest = primitives.createBoxInstance(`${name}_vest`, 0.4, 0.5, 0.15, tanColor, tanGlow);

  // Left shoulder strap
  const leftStrap = primitives.createBoxInstance(`${name}_left_strap`, 0.08, 0.15, 0.08, tanColor, tanGlow);

  // Right shoulder strap
  const rightStrap = primitives.createBoxInstance(`${name}_right_strap`, 0.08, 0.15, 0.08, tanColor, tanGlow);

  // Position main vest at center
  vest.position.set(0, 0, 0);

  // Position straps on top of vest
  leftStrap.position.set(-0.12, 0.325, 0);  // Top left
  rightStrap.position.set(0.12, 0.325, 0);  // Top right

  // Parent to root
  vest.parent = root;
  leftStrap.parent = root;
  rightStrap.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(vest, true);
      sm.addShadowCaster(leftStrap, true);
      sm.addShadowCaster(rightStrap, true);
    }
  }

  return root;
}

/**
 * Dispose of Kevlar mesh and all children.
 */
export function disposeKevlarMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
