/**
 * Global time manager - provides centralized timing for shaders and effects.
 * Updated once per frame at the start of scene.onBeforeRenderObservable.
 * 
 * @deprecated Use World.getInstance() for game time and world state.
 * This class is kept for backward compatibility.
 */

import type { Scene } from '@babylonjs/core';
import { World } from './World';

export class TimeManager {
  static get GameTime(): number {
    return World.getInstance().gameTime;
  }

  static get DeltaTime(): number {
    return World.getInstance().deltaTime;
  }

  static get DeltaSeconds(): number {
    return World.getInstance().deltaSeconds;
  }

  static Now: number = 0;

  private static initialized = false;

  static Initialize(scene: Scene): void {
    if (this.initialized) {
      console.warn('[TimeManager] Already initialized');
      return;
    }

    World.getInstance(); // Ensure World singleton exists
    this.Now = performance.now();
    this.initialized = true;

    console.log('[TimeManager] Initialized - call Update() from fixed timestep loop');
  }

  /**
   * Update time (call from fixed timestep loop at 60Hz).
   * @param deltaTimeSeconds Delta time in seconds (typically FIXED_TIMESTEP = 1/60)
   */
  static Update(deltaTimeSeconds: number): void {
    World.getInstance().updateTime(deltaTimeSeconds);
    this.Now = performance.now();
  }

  static Dispose(): void {
    World.dispose();
    this.Now = 0;
    this.initialized = false;
    console.log('[TimeManager] Disposed');
  }
}
