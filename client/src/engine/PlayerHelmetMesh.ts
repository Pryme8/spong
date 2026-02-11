/**
 * Create visual helmet for players (5-piece bluish-gray helmet).
 * These are attached to the player head when they have a helmet.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from './MeshPrimitives';

/**
 * Create player helmet mesh (5 pieces wrapping the head).
 * Returns the root node for direct attachment to player head.
 */
export function createPlayerHelmetMesh(name: string, scene: Scene): TransformNode {
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_helmet_root`, scene);

  // Bluish-gray metallic color
  const helmetColor = new Color3(0.5, 0.55, 0.6);
  const helmetGlow = new Color3(0.1, 0.12, 0.14);

  // Player head is 0.6x0.6x0.6 at position (0, 1.3, 0) relative to body
  // These positions are relative to the head node
  // Move each piece half its size toward the head to eliminate gaps

  // Top piece (move down by half its height: 0.12/2 = 0.06)
  const top = primitives.createBoxInstance(`${name}_helmet_top`, 0.68, 0.12, 0.68, helmetColor, helmetGlow);
  top.position.set(0, 0.30, 0);

  // Back piece (move forward by half its depth: 0.1/2 = 0.05)
  const back = primitives.createBoxInstance(`${name}_helmet_back`, 0.68, 0.52, 0.1, helmetColor, helmetGlow);
  back.position.set(0, 0, -0.29);

  // Left side flap (move right by half its width: 0.1/2 = 0.05)
  const leftSide = primitives.createBoxInstance(`${name}_helmet_left`, 0.1, 0.52, 0.54, helmetColor, helmetGlow);
  leftSide.position.set(-0.29, 0, 0.05);

  // Right side flap (move left by half its width: 0.1/2 = 0.05)
  const rightSide = primitives.createBoxInstance(`${name}_helmet_right`, 0.1, 0.52, 0.54, helmetColor, helmetGlow);
  rightSide.position.set(0.29, 0, 0.05);

  // Visor/forehead cover (move back by half its depth: 0.08/2 = 0.04)
  const visor = primitives.createBoxInstance(`${name}_helmet_visor`, 0.68, 0.24, 0.08, helmetColor, helmetGlow);
  visor.position.set(0, 0.12, 0.30);

  // Parent to root
  top.parent = root;
  back.parent = root;
  leftSide.parent = root;
  rightSide.parent = root;
  visor.parent = root;

  return root;
}

/**
 * Dispose of player helmet mesh and all children.
 */
export function disposePlayerHelmetMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_helmet_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
