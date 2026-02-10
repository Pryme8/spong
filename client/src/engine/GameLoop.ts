import type { Engine, Scene } from '@babylonjs/core';
import type { CameraController } from './CameraController';
import type { ProjectileManager } from './ProjectileManager';
import type { SkyPickSphere } from './SkyPickSphere';
import type { LocalTransform } from './LocalTransform';
import type { WeaponSystem } from './WeaponSystem';
import type { InputManager } from './InputManager';
import type { NetworkClient } from '../network/NetworkClient';
import { FIXED_TIMESTEP } from '@spong/shared';
import { Ref } from 'vue';

interface GameLoopDependencies {
  transformSync: {
    fixedUpdateAll: (dt: number) => void;
    updateAll: (frameDelta: number, physicsAlpha: number) => void;
  };
  projectileManager: ProjectileManager | null;
  cameraController: CameraController;
  myTransformRef: Ref<LocalTransform | null>;
  weaponSystem: WeaponSystem;
  inputManager: InputManager | null;
  networkClient: NetworkClient | null;
  scene: Scene;
  skyPickSphere?: SkyPickSphere | null;
  onPositionUpdate?: (x: number, y: number, z: number) => void;
}

export class GameLoop {
  private lastFrameTime = performance.now();
  private physicsAccumulator = 0;
  private stopHandle: (() => void) | null = null;

  /**
   * Start the game loop
   */
  start(engine: Engine, scene: Scene, deps: GameLoopDependencies): void {
    if (this.stopHandle) {
      console.warn('[GameLoop] Already running');
      return;
    }

    this.lastFrameTime = performance.now();
    this.physicsAccumulator = 0;

    engine.runRenderLoop(() => {
      const now = performance.now();
      const frameDelta = (now - this.lastFrameTime) * 0.001;
      this.lastFrameTime = now;

      // Cap accumulated time to prevent spiral of death
      this.physicsAccumulator += Math.min(frameDelta, 0.25);

      // Fixed timestep physics updates
      while (this.physicsAccumulator >= FIXED_TIMESTEP) {
        deps.transformSync.fixedUpdateAll(FIXED_TIMESTEP);
        deps.projectileManager?.fixedUpdate(FIXED_TIMESTEP);
        this.physicsAccumulator -= FIXED_TIMESTEP;
      }

      // Variable rate: interpolation + camera + render
      // Calculate physics interpolation alpha (how far between last and next physics tick)
      const physicsAlpha = this.physicsAccumulator / FIXED_TIMESTEP;

      deps.transformSync.updateAll(frameDelta, physicsAlpha);
      deps.projectileManager?.update();

      const myTransform = deps.myTransformRef.value;
      if (myTransform) {
        const pos = myTransform.getPosition();
        deps.cameraController.setTarget(pos);
        deps.cameraController.update(frameDelta);

        // Update sky pick sphere to follow player
        if (deps.skyPickSphere) {
          deps.skyPickSphere.setPosition(pos.x, pos.y, pos.z);
        }

        // Update local player's head rotation to match camera pitch
        myTransform.setHeadPitch(deps.cameraController.getPitch());

        // Notify position update (for HUD display)
        if (deps.onPositionUpdate) {
          deps.onPositionUpdate(pos.x, pos.y, pos.z);
        }
      }

      // Update reload progress
      deps.weaponSystem.updateReload(now);

      // Handle auto-fire for automatic weapons (SMG, LMG)
      if (myTransform && deps.inputManager?.isMouseHeld() && deps.weaponSystem.isAutoFireWeapon()) {
        if (deps.cameraController && deps.projectileManager && deps.networkClient) {
          deps.weaponSystem.shoot(myTransform, deps.cameraController, deps.scene, deps.projectileManager, deps.networkClient);
        }
      }

      scene.render();
    });

    this.stopHandle = () => {
      engine.stopRenderLoop();
    };

    console.log('[GameLoop] Started');
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (this.stopHandle) {
      this.stopHandle();
      this.stopHandle = null;
      console.log('[GameLoop] Stopped');
    }
  }
}
