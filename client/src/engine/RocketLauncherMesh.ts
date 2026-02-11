/**
 * Create a visual representation of a rocket launcher using simple geometry.
 * Design: Tube launcher with two pistol grips, stock, and side-mounted sights.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface RocketLauncherMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a rocket launcher mesh with tube, two grips, stock, and side sight.
 * Design: Bazooka-style launcher with pistol grips and compact stock.
 * Returns the root node for direct position control.
 */
export function createRocketLauncherMesh(name: string, scene: Scene, options?: RocketLauncherMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definition - military olive drab
  const diffuseColor = new Color3(0.25, 0.28, 0.20);
  const emissiveColor = new Color3(0.04, 0.05, 0.03);

  // Main tube (cylinder) - smaller radius, longer
  const tubeRadius = 0.18; // Smaller than before (was 0.25)
  const tubeLength = 1.3;  // Longer
  const tube = primitives.createCylinderInstance(
    `${name}_tube`,
    tubeRadius,
    tubeLength,
    diffuseColor,
    emissiveColor
  );

  // Grip 1 (pistol-style grip in middle of bottom)
  const grip1 = primitives.createBoxInstance(
    `${name}_grip1`,
    0.1,   // width (X) - pistol grip style
    0.233, // height (Y) - pistol height
    0.133, // depth (Z) - pistol depth
    diffuseColor,
    emissiveColor
  );

  // Grip 2 (pistol-style grip, quarter way from back = 3/4 from front)
  const grip2 = primitives.createBoxInstance(
    `${name}_grip2`,
    0.1,   // width (X) - pistol grip style
    0.233, // height (Y) - pistol height
    0.133, // depth (Z) - pistol depth
    diffuseColor,
    emissiveColor
  );

  // Stock (small stock on bottom, between grips)
  const stock = primitives.createBoxInstance(
    `${name}_stock`,
    0.12,  // width (X) - compact
    0.15,  // height (Y) - not very big
    0.2,   // depth (Z) - compact
    diffuseColor,
    emissiveColor
  );

  // Iron sight (small vertical box at front, on the left side)
  const ironSight = primitives.createBoxInstance(
    `${name}_iron_sight`,
    0.075, // width (X) - rotated so this becomes height
    0.02,  // height (Y) - thin
    0.04,  // depth (Z)
    diffuseColor,
    emissiveColor
  );

  // Rotate tube to point forward (cylinders are vertical by default)
  tube.rotation.z = Math.PI * 0.5;
  tube.rotation.y = Math.PI * 0.5;

  // Position tube forward and centered
  tube.position.set(0, 0, 0.25);

  // Tube extends from z = 0.25 - 1.3/2 to 0.25 + 1.3/2 = -0.4 to 0.9
  // Middle of tube: z = 0.25
  // Quarter way from FRONT = 0.9 - (1.3 * 0.25) = 0.9 - 0.325 = 0.575

  // Position grip1 in middle of bottom of tube, top of grip touching tube bottom
  // Tube bottom = 0 - 0.18 = -0.18
  // Move up 0.1 units from -0.29 to -0.19
  grip1.position.set(0, -0.19, 0.25);

  // Position grip2 quarter way from front, below tube, top touching tube bottom
  grip2.position.set(0, -0.19, 0.575);

  // Position stock back from middle grip, top touching tube bottom
  // Halfway between middle and back = (0.25 + -0.4) / 2 = -0.075
  // Move up 0.1 units from -0.25 to -0.15
  stock.position.set(0, -0.15, -0.075);

  // Rotate iron sight 90 degrees around Y axis so it sticks out to the side
  ironSight.rotation.y = Math.PI * 0.5;

  // Position iron sight on left side at front of tube, touching tube
  // Moving left half its width (0.075 / 2 = 0.0375)
  // 0.06875 - 0.0375 = 0.03125
  // Front of tube at z = 0.9
  ironSight.position.set(0.03125, 0, 0.88);

  // Parent all to root
  tube.parent = root;
  grip1.parent = root;
  grip2.parent = root;
  stock.parent = root;
  ironSight.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(tube, true);
      sm.addShadowCaster(grip1, true);
      sm.addShadowCaster(grip2, true);
      sm.addShadowCaster(stock, true);
      sm.addShadowCaster(ironSight, true);
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
