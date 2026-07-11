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

    // Make it invisible but pickable.
    // isVisible = false hides it from the main render and scene picking UI, but
    // Babylon's RTT render list ignores isVisible — so we also set visibility = 0
    // (the float) to satisfy the CloudPostProcess mask-pass guard which filters
    // out visibility-0 meshes to prevent them blacking out the sky in the mask RTT.
    this.sphere.isVisible = false;
    this.sphere.visibility = 0;
    this.sphere.isPickable = true;

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
