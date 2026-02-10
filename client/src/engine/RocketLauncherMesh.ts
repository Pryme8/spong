/**
 * Create a visual representation of a rocket launcher using simple geometry.
 * Design: Large cylinder tube with a grip underneath.
 * Returns the root TransformNode so position can be updated directly.
 */

import { MeshBuilder, StandardMaterial, Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';

export interface RocketLauncherMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a rocket launcher mesh with cylindrical tube and grip.
 * Design: Military-style tube launcher with handle 2/3 from front.
 * Returns the root node for direct position control.
 */
export function createRocketLauncherMesh(name: string, scene: Scene, options?: RocketLauncherMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;

  const root = new TransformNode(`${name}_root`, scene);

  // Main tube (large cylinder)
  const tube = MeshBuilder.CreateCylinder(`${name}_tube`, {
    diameter: 0.25,  // Thick tube
    height: 1.0,     // Long tube
    tessellation: 16
  }, scene);
  
  // Rotate cylinder to point forward (cylinders are vertical by default)
  tube.rotation.x = Math.PI / 2;

  // Grip (vertical box underneath, 2/3 from front)
  const grip = MeshBuilder.CreateBox(`${name}_grip`, {
    width: 0.15,   // X - thickness
    height: 0.30,  // Y - height
    depth: 0.18    // Z - depth
  }, scene);

  // Rear sight/trigger housing (small box at back)
  const housing = MeshBuilder.CreateBox(`${name}_housing`, {
    width: 0.18,   // X - width
    height: 0.15,  // Y - height
    depth: 0.20    // Z - depth
  }, scene);

  // Military green/olive drab material
  const material = new StandardMaterial(`${name}_mat`, scene);
  material.diffuseColor = new Color3(0.25, 0.28, 0.20);   // Olive drab
  material.emissiveColor = new Color3(0.04, 0.05, 0.03);
  material.specularColor = new Color3(0.3, 0.3, 0.3);     // Less shiny than metal

  tube.material = material;
  grip.material = material;
  housing.material = material;

  // Position tube forward and centered
  tube.position.set(0, 0, 0.2);

  // Position grip 2/3 from front, below tube
  // Tube extends from z=-0.3 to z=0.7, so 2/3 from front is around z=0.3
  grip.position.set(0, -0.22, 0.1);

  // Position housing at back, on top of tube
  housing.position.set(0, 0.02, -0.35);

  // Parent all to root
  tube.parent = root;
  grip.parent = root;
  housing.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(tube, true);
      sm.addShadowCaster(grip, true);
      sm.addShadowCaster(housing, true);
    }
  }

  return root;
}

/**
 * Dispose of rocket launcher mesh and all children.
 */
export function disposeRocketLauncherMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
