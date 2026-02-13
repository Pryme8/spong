/**
 * Shared weapon mesh part creators to eliminate duplication across weapon meshes.
 * All weapon meshes share common components with standardized dimensions.
 */

import { Color3, InstancedMesh } from '@babylonjs/core';
import { MeshPrimitives } from '../rendering/primitives/MeshPrimitives';

export interface WeaponColors {
  diffuse: Color3;
  emissive: Color3;
}

/**
 * Create a standard iron sight (small vertical box).
 * Used by: Pistol, SMG, AssaultRifle, Sniper
 * Dimensions: 0.02 × 0.075 × 0.04
 */
export function createIronSight(
  name: string,
  primitives: MeshPrimitives,
  colors: WeaponColors
): InstancedMesh {
  return primitives.createBoxInstance(
    `${name}_iron_sight`,
    0.02,   // width (X)
    0.075,  // height (Y)
    0.04,   // depth (Z)
    colors.diffuse,
    colors.emissive
  );
}

/**
 * Create a standard grip (vertical box).
 * Used by: Pistol, SMG, AssaultRifle, Sniper
 * Dimensions: 0.1 × 0.233 × 0.133
 */
export function createGrip(
  name: string,
  primitives: MeshPrimitives,
  colors: WeaponColors
): InstancedMesh {
  return primitives.createBoxInstance(
    `${name}_grip`,
    0.1,   // width (X)
    0.233, // height (Y)
    0.133, // depth (Z)
    colors.diffuse,
    colors.emissive
  );
}

/**
 * Create a barrel (cylinder) with standard rotation.
 * Used by: All weapons with cylindrical barrels
 * The barrel is rotated to point forward (cylinders are vertical by default).
 */
export function createBarrel(
  name: string,
  primitives: MeshPrimitives,
  diameter: number,
  length: number,
  colors: WeaponColors
): InstancedMesh {
  const barrel = primitives.createCylinderInstance(
    `${name}_barrel`,
    diameter,
    length,
    colors.diffuse,
    colors.emissive
  );
  
  // Rotate cylinder to point forward
  barrel.rotation.z = Math.PI * 0.5;
  barrel.rotation.y = Math.PI * 0.5;
  
  return barrel;
}

/**
 * Create a magazine (vertical box).
 * Common component for rifles and SMGs.
 */
export function createMagazine(
  name: string,
  primitives: MeshPrimitives,
  width: number,
  height: number,
  depth: number,
  colors: WeaponColors
): InstancedMesh {
  return primitives.createBoxInstance(
    `${name}_magazine`,
    width,
    height,
    depth,
    colors.diffuse,
    colors.emissive
  );
}

/**
 * Create a foregrip (forward grip box).
 * Common component for rifles and SMGs.
 */
export function createForegrip(
  name: string,
  primitives: MeshPrimitives,
  width: number,
  height: number,
  depth: number,
  colors: WeaponColors
): InstancedMesh {
  return primitives.createBoxInstance(
    `${name}_foregrip`,
    width,
    height,
    depth,
    colors.diffuse,
    colors.emissive
  );
}

/**
 * Create a stock (rear extension from grip).
 * Common component for rifles.
 */
export function createStock(
  name: string,
  primitives: MeshPrimitives,
  width: number,
  height: number,
  depth: number,
  colors: WeaponColors
): InstancedMesh {
  return primitives.createBoxInstance(
    `${name}_stock`,
    width,
    height,
    depth,
    colors.diffuse,
    colors.emissive
  );
}
