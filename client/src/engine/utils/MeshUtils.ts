/**
 * Shared utilities for mesh creation, disposal, and shadow management.
 */

import { Scene, TransformNode, AbstractMesh, Color3 } from '@babylonjs/core';
import { ShadowManager } from '../systems/ShadowManager';
import { MeshPrimitives } from '../rendering/primitives/MeshPrimitives';

export interface MeshOptions {
  hasShadows?: boolean;
}

/**
 * Dispose a mesh root and all its children by name.
 */
export function disposeMeshRoot(name: string, scene: Scene, rootSuffix = '_root'): void {
  const root = scene.getTransformNodeByName(`${name}${rootSuffix}`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}

/**
 * Register meshes as shadow casters.
 */
export function registerShadowCasters(
  meshes: AbstractMesh[],
  hasShadows: boolean,
  selfShadowing = true
): void {
  if (!hasShadows) return;
  const sm = ShadowManager.getInstance();
  if (sm) {
    meshes.forEach(m => sm.addShadowCaster(m, selfShadowing));
  }
}

/**
 * Create a red cube fallback mesh when the requested mesh type doesn't exist.
 * Makes missing meshes instantly visible for debugging.
 */
export function createFallbackMesh(name: string, scene: Scene, options?: MeshOptions): TransformNode {
  console.warn(`[MeshUtils] No mesh builder found for "${name}", using red cube fallback`);
  
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();
  const root = new TransformNode(`${name}_root`, scene);
  
  // Create a bright red cube to make it obvious something is missing
  const fallbackCube = primitives.createBoxInstance(
    `${name}_fallback`,
    0.5, 0.5, 0.5,
    new Color3(1, 0, 0), // Bright red
    new Color3(0.3, 0, 0) // Red glow
  );
  
  fallbackCube.parent = root;
  
  if (hasShadows) {
    registerShadowCasters([fallbackCube], true);
  }
  
  return root;
}
