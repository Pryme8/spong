/**
 * Create a visual representation of a ladder using cylindrical geometry.
 * Design: Two vertical poles with horizontal rungs between them.
 * Returns the root TransformNode so position can be updated directly.
 */

import { Color3, Scene, TransformNode } from '@babylonjs/core';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';

export interface LadderMeshOptions {
  hasShadows?: boolean;
}

/**
 * Create a single ladder segment (0.5 units tall).
 * Contains two vertical poles and one horizontal rung.
 */
export function createLadderMesh(name: string, scene: Scene, options?: LadderMeshOptions): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions - brown/wood appearance
  const poleColor = new Color3(0.4, 0.25, 0.15);      // Dark brown wood
  const rungColor = new Color3(0.45, 0.3, 0.18);      // Slightly lighter brown
  const emissiveColor = new Color3(0.05, 0.03, 0.02); // Subtle warm glow

  // Measurements (as per spec)
  const poleHeight = 0.5;
  const poleRadius = 0.05;
  const poleSeparation = 1.0; // center to center
  const rungLength = 1.0;
  const rungRadius = 0.03;
  const rungPositionY = 0.25; // Middle of segment

  // Left pole (vertical cylinder)
  const leftPole = primitives.createCylinderInstance(
    `${name}_leftPole`,
    poleRadius * 2, // diameter
    poleHeight,
    poleColor,
    emissiveColor
  );

  // Right pole (vertical cylinder)
  const rightPole = primitives.createCylinderInstance(
    `${name}_rightPole`,
    poleRadius * 2, // diameter
    poleHeight,
    poleColor,
    emissiveColor
  );

  // Horizontal rung (rotated cylinder)
  const rung = primitives.createCylinderInstance(
    `${name}_rung`,
    rungRadius * 2, // diameter
    rungLength,
    rungColor,
    emissiveColor
  );

  // Position left pole
  leftPole.position.set(-poleSeparation * 0.5, 0, 0);

  // Position right pole
  rightPole.position.set(poleSeparation * 0.5, 0, 0);

  // Position and rotate rung (rotate 90 degrees to make it horizontal along X axis)
  rung.position.set(0, rungPositionY, 0);
  rung.rotation.z = Math.PI * 0.5; // Rotate to horizontal

  // Parent all to root
  leftPole.parent = root;
  rightPole.parent = root;
  rung.parent = root;

  // Register shadows if enabled
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(leftPole, true);
      sm.addShadowCaster(rightPole, true);
      sm.addShadowCaster(rung, true);
    }
  }

  return root;
}

/**
 * Create a multi-segment ladder (numSegments * 0.5 units tall).
 * Each segment is stacked vertically with rungs at 0.5 unit intervals.
 */
export function createLadderSegmentMesh(
  name: string,
  scene: Scene,
  numSegments: number,
  options?: LadderMeshOptions
): TransformNode {
  const hasShadows = options?.hasShadows ?? true;
  const primitives = MeshPrimitives.getInstance();

  const root = new TransformNode(`${name}_root`, scene);

  // Color definitions
  const poleColor = new Color3(0.4, 0.25, 0.15);
  const rungColor = new Color3(0.45, 0.3, 0.18);
  const emissiveColor = new Color3(0.05, 0.03, 0.02);

  // Measurements
  const poleRadius = 0.05;
  const poleSeparation = 1.0;
  const rungRadius = 0.03;
  const segmentHeight = 0.5;
  const totalHeight = numSegments * segmentHeight;

  // Create two long vertical poles
  const leftPole = primitives.createCylinderInstance(
    `${name}_leftPole`,
    poleRadius * 2,
    totalHeight,
    poleColor,
    emissiveColor
  );

  const rightPole = primitives.createCylinderInstance(
    `${name}_rightPole`,
    poleRadius * 2,
    totalHeight,
    poleColor,
    emissiveColor
  );

  // Position poles (centered at origin, extending upward)
  leftPole.position.set(-poleSeparation * 0.5, totalHeight * 0.5, 0);
  rightPole.position.set(poleSeparation * 0.5, totalHeight * 0.5, 0);

  // Parent poles to root
  leftPole.parent = root;
  rightPole.parent = root;

  // Create horizontal rungs at each segment
  for (let i = 0; i < numSegments; i++) {
    const rungY = segmentHeight * 0.5 + i * segmentHeight; // 0.25, 0.75, 1.25, etc.

    const rung = primitives.createCylinderInstance(
      `${name}_rung_${i}`,
      rungRadius * 2,
      poleSeparation,
      rungColor,
      emissiveColor
    );

    rung.position.set(0, rungY, 0);
    rung.rotation.z = Math.PI * 0.5; // Horizontal
    rung.parent = root;

    // Register shadow
    if (hasShadows) {
      const sm = ShadowManager.getInstance();
      if (sm) {
        sm.addShadowCaster(rung, true);
      }
    }
  }

  // Register pole shadows
  if (hasShadows) {
    const sm = ShadowManager.getInstance();
    if (sm) {
      sm.addShadowCaster(leftPole, true);
      sm.addShadowCaster(rightPole, true);
    }
  }

  return root;
}

/**
 * Dispose of ladder mesh and all children.
 */
export function disposeLadderMesh(name: string, scene: Scene): void {
  const root = scene.getTransformNodeByName(`${name}_root`);
  if (root) {
    root.getChildMeshes().forEach(m => m.dispose());
    root.dispose();
  }
}
