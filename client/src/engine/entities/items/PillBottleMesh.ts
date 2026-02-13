/**
 * Create a visual representation of a pill bottle using instanced geometry.
 * Design: Orange cylinder body with white cap on top.
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, Color3, Scene, TransformNode, InstancedMesh, StandardMaterial, Color4 } from '@babylonjs/core';
import { registerShadowCasters, disposeMeshRoot } from '../../utils/MeshUtils';

export interface PillBottleMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a pill bottle mesh with orange body and white cap.
 * Returns the root node for direct position control.
 */
export function createPillBottleMesh(name: string, scene: Scene, options?: PillBottleMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions
  const orangeBody = new Color3(1.0, 0.5, 0.1);      // Bright orange
  const orangeGlow = new Color3(0.3, 0.15, 0.05);    // Orange glow
  const whiteCap = new Color3(0.95, 0.95, 0.95);     // White cap
  const whiteGlow = new Color3(0.1, 0.1, 0.1);       // Slight glow

  // Create orange cylinder body
  const bodyMaterial = new StandardMaterial(`${name}_body_mat`, scene);
  bodyMaterial.diffuseColor = orangeBody;
  bodyMaterial.emissiveColor = orangeGlow;
  bodyMaterial.specularColor = new Color3(0.4, 0.2, 0.1);

  const body = MeshBuilder.CreateCylinder(`${name}_body`, {
    diameter: 0.2,  // Cylinder diameter
    height: 0.35,   // Cylinder height
    tessellation: 16
  }, scene);
  body.material = bodyMaterial;

  // Create white cap (slightly larger radius)
  const capMaterial = new StandardMaterial(`${name}_cap_mat`, scene);
  capMaterial.diffuseColor = whiteCap;
  capMaterial.emissiveColor = whiteGlow;
  capMaterial.specularColor = new Color3(0.5, 0.5, 0.5);

  const cap = MeshBuilder.CreateCylinder(`${name}_cap`, {
    diameter: 0.24,  // Slightly larger than body
    height: 0.08,    // Short cap
    tessellation: 16
  }, scene);
  cap.material = capMaterial;

  // Position body at center
  body.position.set(0, 0, 0);

  // Position cap on top of body
  cap.position.set(0, 0.215, 0); // (body height/2) + (cap height/2)

  // Parent both to root
  body.parent = root;
  cap.parent = root;

  // Register shadows if enabled
  registerShadowCasters([body, cap], hasShadows, true);

  return root;
}

/**
 * Dispose of pill bottle mesh and all children.
 */
export function disposePillBottleMesh(name: string, scene: Scene): void {
  disposeMeshRoot(name, scene);
}
