/**
 * FootstepManager - One-shot footstep sounds for the local player.
 * Uses a step timer: when it fires, plays one of footstep_a..d (non-3D), then notifies
 * the game to send FootstepEvent to the server so other clients play the same step with 3D.
 * Rate and volume are derived from horizontal speed.
 */

import { AudioManager } from './AudioManager';

const FOOTSTEP_VARIANT_NAMES = ['footstep_a', 'footstep_b', 'footstep_c', 'footstep_d'] as const;
const MOVEMENT_THRESHOLD = 0.8;
const MIN_VOLUME = 0.3;
const MAX_VOLUME = 0.7;
const MIN_INTERVAL = 0.28;  // run
const MAX_INTERVAL = 0.48;  // walk
const SPEED_FOR_NORMALIZATION = 11.2; // max sprint ~12, 0 at MOVEMENT_THRESHOLD
const PITCH_VARIATION = 0.08; // ±8% random pitch for local steps only

export type OnFootstepCallback = (variant: number, posX: number, posY: number, posZ: number, volume: number) => void;

interface LocalState {
  stepTimer: number;
}

export class FootstepManager {
  private audioManager: AudioManager;
  private localEntityId: number | null = null;
  private state: LocalState | null = null;
  private onStep: OnFootstepCallback | null = null;

  constructor() {
    this.audioManager = AudioManager.getInstance();
  }

  setOnStep(cb: OnFootstepCallback | null): void {
    this.onStep = cb;
  }

  /**
   * Update local player footsteps. Call every frame or fixed tick with deltaTime.
   * When the step timer fires: plays one random variant (non-3D), invokes onStep, resets timer.
   */
  updateLocal(
    entityId: number,
    posX: number,
    posY: number,
    posZ: number,
    velX: number,
    velY: number,
    velZ: number,
    isGrounded: boolean,
    isInWater: boolean,
    deltaTime: number
  ): void {
    if (this.localEntityId !== entityId) {
      this.localEntityId = entityId;
      this.state = { stepTimer: 0 };
    }
    let state = this.state!;

    const speed = Math.sqrt(velX * velX + velZ * velZ);
    const shouldPlay = speed > MOVEMENT_THRESHOLD && isGrounded && !isInWater;

    if (!shouldPlay) {
      state.stepTimer = 0;
      return;
    }

    state.stepTimer -= deltaTime;
    if (state.stepTimer > 0) return;

    const variant = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
    const volume = this.calculateVolume(speed);
    const pitch = 1 + (Math.random() * 2 - 1) * PITCH_VARIATION;
    const soundName = FOOTSTEP_VARIANT_NAMES[variant];
    this.audioManager.play(soundName, { volume, loop: false, playbackRate: pitch });

    this.onStep?.(variant, posX, posY, posZ, volume);

    const interval = this.calculateInterval(speed);
    state.stepTimer = interval;
  }

  private calculateVolume(speed: number): number {
    const t = Math.max(0, Math.min(1, (speed - MOVEMENT_THRESHOLD) / SPEED_FOR_NORMALIZATION));
    return MIN_VOLUME + t * (MAX_VOLUME - MIN_VOLUME);
  }

  private calculateInterval(speed: number): number {
    const t = Math.max(0, Math.min(1, (speed - MOVEMENT_THRESHOLD) / SPEED_FOR_NORMALIZATION));
    return MAX_INTERVAL - t * (MAX_INTERVAL - MIN_INTERVAL);
  }

  removePlayer(entityId: number): void {
    if (this.localEntityId === entityId) {
      this.localEntityId = null;
      this.state = null;
    }
  }

  dispose(): void {
    this.localEntityId = null;
    this.state = null;
    this.onStep = null;
  }

  /** Resolve sound name from variant 0–3 (for remote spatial playback). */
  static getVariantName(variant: number): string {
    const i = Math.max(0, Math.min(3, Math.floor(variant)));
    return FOOTSTEP_VARIANT_NAMES[i];
  }
}
