/**
 * Create visual armor pieces for players (front and back tan boxes).
 * These are attached to the player body when they have armor.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { MeshPrimitives } from './MeshPrimitives';

/**
 * Create player armor meshes (front and back plates).
 * Returns the root node for direct attachment to player body.
 */
export function createPlayerArmorMesh(name: string, scene: Scene): TransformNode {
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_armor_root`, scene);

  // Tan color for armor plates
  const tanColor = new Color3(0.8, 0.7, 0.5);
  const tanGlow = new Color3(0.15, 0.12, 0.08);

  // Front armor plate (0.60 wide x 0.65 tall x 0.06 thick)
  const frontPlate = primitives.createBoxInstance(`${name}_armor_front`, 0.60, 0.65, 0.06, tanColor, tanGlow);

  // Back armor plate
  const backPlate = primitives.createBoxInstance(`${name}_armor_back`, 0.60, 0.65, 0.06, tanColor, tanGlow);

  // Position plates on player body
  // Body extends from -0.4 to +0.4 in Z, centered at y=0.5
  // Place plates just outside the body surface
  frontPlate.position.set(0, 0, 0.43);  // Front of torso
  backPlate.position.set(0, 0, -0.43);  // Back of torso

  // Parent to root
  frontPlate.parent = root;
  backPlate.parent = root;

  return root;
}

/**
 * Dispose of player armor mesh and all children.
 */
export function disposePlayerArmorMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_armor_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
