/**
 * Abstract base class for visual effects that use dynamic textures.
 * Provides common patterns for texture management and ready state.
 */

import { Scene, DynamicTexture } from '@babylonjs/core';

export abstract class BaseEffect {
  protected scene: Scene;
  protected isReady: boolean = false;
  protected textures: DynamicTexture[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Check if the effect is ready to use.
   */
  ready(): boolean {
    return this.isReady;
  }

  /**
   * Generate the effect's textures.
   * Must be implemented by subclasses.
   */
  abstract generate(): Promise<void>;

  /**
   * Dispose of all textures.
   */
  dispose(): void {
    for (const texture of this.textures) {
      texture.dispose();
    }
    this.textures = [];
    this.isReady = false;
  }
}
