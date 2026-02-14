import type { Engine, Scene } from '@babylonjs/core';
import type { CameraController } from '../camera/CameraController';
import type { ProjectileManager } from '../systems/ProjectileManager';
import type { SkyPickSphere } from '../setup/SkyPickSphere';
import type { LocalTransform } from './LocalTransform';
import type { WeaponSystem } from '../systems/WeaponSystem';
import type { InputManager } from '../input/InputManager';
import type { NetworkClient } from '../network/NetworkClient';
import { FIXED_TIMESTEP } from '@spong/shared';
import { Ref } from 'vue';
import { TimeManager } from './TimeManager';
import { AudioManager } from '../audio/AudioManager';

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
  /** Called once per physics tick BEFORE fixedUpdateAll. Use for input capture + network send. */
  onFixedTick?: () => void;
  /** Called every frame after interpolation. Use for timer updates and per-frame logic. */
  onVariableTick?: (deltaTime: number) => void;
  /** Drain deferred network updates (run in same rAF as game to avoid long separate rAF). */
  drainNetworkQueue?: () => void;
}

/** Enable with ?frameTiming=1 in the URL to see per-section timings in the Performance tab. */
function isFrameTimingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('frameTiming') === '1';
}

export class GameLoop {
  private lastFrameTime = performance.now();
  private physicsAccumulator = 0;
  private stopHandle: (() => void) | null = null;
  private frameTiming = false;

  /**
   * Start the game loop
   */
  start(engine: Engine, scene: Scene, deps: GameLoopDependencies): void {
    if (this.stopHandle) {
      return;
    }

    this.lastFrameTime = performance.now();
    this.physicsAccumulator = 0;
    this.frameTiming = isFrameTimingEnabled();

    engine.runRenderLoop(() => {
      const t = this.frameTiming ? (name: string) => {
        performance.mark(`frame-${name}-start`);
        return () => {
          performance.mark(`frame-${name}-end`);
          performance.measure(`frame: ${name}`, `frame-${name}-start`, `frame-${name}-end`);
        };
      } : () => () => {};

      const endDrain = t('drainNetworkQueue');
      deps.drainNetworkQueue?.();
      endDrain();

      const now = performance.now();
      const frameDelta = (now - this.lastFrameTime) * 0.001;
      this.lastFrameTime = now;

      // Cap accumulated time to prevent spiral of death
      this.physicsAccumulator += Math.min(frameDelta, 0.25);

      const endPhysics = t('physics');
      // Fixed timestep physics updates
      while (this.physicsAccumulator >= FIXED_TIMESTEP) {
        // Update global time manager at fixed 60Hz
        TimeManager.Update(FIXED_TIMESTEP);
        
        // Capture input + send to server BEFORE stepping physics
        // This ensures 1:1 sequence-to-physics-tick correspondence
        deps.onFixedTick?.();
        deps.transformSync.fixedUpdateAll(FIXED_TIMESTEP);
        deps.projectileManager?.fixedUpdate(FIXED_TIMESTEP);
        this.physicsAccumulator -= FIXED_TIMESTEP;
      }
      endPhysics();

      // Variable rate: interpolation + camera + render
      // Calculate physics interpolation alpha (how far between last and next physics tick)
      const physicsAlpha = this.physicsAccumulator / FIXED_TIMESTEP;

      const endTransforms = t('transformSync.updateAll');
      deps.transformSync.updateAll(frameDelta, physicsAlpha);
      endTransforms();

      const endProjectiles = t('projectileManager.update');
      deps.projectileManager?.update();
      endProjectiles();

      const endVariableTick = t('onVariableTick');
      deps.onVariableTick?.(frameDelta);
      endVariableTick();

      const endCamera = t('cameraAndWeapon');
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

        // Update local player's weapon holder (first-person or debug third-person view)
        if (deps.cameraController.isDebugThirdPersonActive()) {
          // Debug third-person: weapon on player node (like remote players)
          myTransform.updateWeaponHolder();
        } else {
          // Normal first-person: weapon attached to camera
          myTransform.updateWeaponHolder(deps.cameraController.getCamera());
        }

        // Update audio listener to follow camera for spatial audio
        try {
          const camPos = deps.cameraController.getPosition();
          const forward = deps.cameraController.getForwardDirection();
          AudioManager.getInstance().updateListener(
            camPos.x, camPos.y, camPos.z,
            forward.x, forward.y, forward.z
          );
        } catch (_e) { /* AudioManager not initialized yet */ }

        // Notify position update (for HUD display)
        if (deps.onPositionUpdate) {
          deps.onPositionUpdate(pos.x, pos.y, pos.z);
        }
      }

      // Update reload progress
      deps.weaponSystem.updateReload(now);

      // Update weapon bloom decay — handling scaled by speed; doubles when jumping
      const state = myTransform?.getState();
      const horizSpeed = state ? Math.sqrt(state.velX * state.velX + state.velZ * state.velZ) : 0;
      const isInAir = state ? !state.isGrounded && !state.isInWater : false;
      deps.weaponSystem.updateBloom(frameDelta, 1, horizSpeed, isInAir);

      // Handle auto-fire for automatic weapons (SMG, LMG)
      if (myTransform && deps.inputManager?.isMouseHeld() && deps.weaponSystem.isAutoFireWeapon()) {
        if (deps.cameraController && deps.projectileManager && deps.networkClient) {
          deps.weaponSystem.shoot(myTransform, deps.cameraController, deps.scene, deps.projectileManager, deps.networkClient);
        }
      }
      endCamera();

      const endRender = t('scene.render');
      scene.render();
      endRender();
    });

    this.stopHandle = () => {
      engine.stopRenderLoop();
    };
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (this.stopHandle) {
      this.stopHandle();
      this.stopHandle = null;
    }
  }
}
