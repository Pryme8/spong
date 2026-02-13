/**
 * Invisible sphere that follows the player for catching sky raycast shots.
 * Ensures bullets have a consistent direction when aiming at the sky.
 */

import { Scene, MeshBuilder, AbstractMesh, StandardMaterial, Color3 } from '@babylonjs/core';

export class SkyPickSphere {
  private sphere: AbstractMesh;

  constructor(scene: Scene) {
    // Create large invisible sphere at 200 radius
    this.sphere = MeshBuilder.CreateSphere(
      'skyPickSphere',
      { diameter: 400, segments: 16 },
      scene
    );

    // Make it invisible but pickable
    this.sphere.isVisible = false;
    this.sphere.isPickable = true;

    // Create invisible material (just in case visibility fails)
    const mat = new StandardMaterial('skyPickSphereMat', scene);
    mat.alpha = 0;
    this.sphere.material = mat;

    // Render on back faces only (inside of sphere)
    if (this.sphere.material) {
      this.sphere.material.backFaceCulling = false;
    }
  }

  /**
   * Update sphere position to follow the player
   */
  setPosition(x: number, y: number, z: number): void {
    this.sphere.position.set(x, y, z);
  }

  dispose(): void {
    this.sphere.dispose();
  }
}
