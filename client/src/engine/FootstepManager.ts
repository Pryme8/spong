/**
 * FootstepManager - Manages looping footstep sounds for all players.
 * Uses footstep_running sound with dynamic volume and playback rate based on speed.
 * - Walking (slow): Lower volume, slower playback rate (75%)
 * - Running (fast): Higher volume, normal playback rate (100%)
 * - Crouching (future): Will use separate footstep sound
 * The spatial position is updated every frame.
 */

import { AudioManager } from './AudioManager';

interface FootstepState {
  soundInstanceId: string | null; // ID of the currently playing looping sound
  lastSpeed: number; // Track speed for smoothing
  stoppedFrames: number; // Count frames with near-zero velocity
}

const MOVEMENT_THRESHOLD = 0.8; // Minimum velocity to be considered "moving"
const MIN_VOLUME = 0.3; // Minimum footstep volume
const MAX_VOLUME = 0.7; // Maximum footstep volume
const MIN_PLAYBACK_RATE = 0.75; // Slower playback when walking (75% speed)
const MAX_PLAYBACK_RATE = 1.0; // Normal playback when sprinting (100% speed)

export class FootstepManager {
  private playerStates = new Map<number, FootstepState>();
  private audioManager: AudioManager;
  private localPlayerEntityId: number | null = null;

  constructor() {
    this.audioManager = AudioManager.getInstance();
  }

  /**
   * Update footsteps for a player based on their movement state.
   * Call this every frame for all players (local and remote).
   */
  updatePlayer(
    entityId: number,
    posX: number,
    posY: number,
    posZ: number,
    velX: number,
    velY: number,
    velZ: number,
    isGrounded: boolean,
    isInWater: boolean,
    isLocalPlayer = false
  ): void {
    // Track local player entity ID
    if (isLocalPlayer && this.localPlayerEntityId !== entityId) {
      // Clean up old local player footsteps if entity ID changed
      if (this.localPlayerEntityId !== null) {
        this.removePlayer(this.localPlayerEntityId);
      }
      this.localPlayerEntityId = entityId;
    }

    // Prevent duplicate footsteps: don't play remote footsteps for local player
    if (!isLocalPlayer && entityId === this.localPlayerEntityId) {
      return; // Skip remote footstep updates for the local player
    }

    let state = this.playerStates.get(entityId);
    if (!state) {
      state = { soundInstanceId: null, lastSpeed: 0, stoppedFrames: 0 };
      this.playerStates.set(entityId, state);
    }

    const speed = Math.sqrt(velX * velX + velZ * velZ); // Horizontal speed only
    const isMoving = speed > MOVEMENT_THRESHOLD;
    const shouldPlayFootsteps = isMoving && isGrounded && !isInWater;

    // Track consecutive frames with low speed
    if (speed < 0.1) {
      state.stoppedFrames++;
    } else {
      state.stoppedFrames = 0;
    }

    // Force stop if speed is very low for several frames (safety fallback)
    const forceStop = state.stoppedFrames > 3;

    // Debug logging for local player
    if (isLocalPlayer) {
      if (state.soundInstanceId || speed > 0.1) {
        console.log(`[Footsteps] Local - speed: ${speed.toFixed(3)}, vel:[${velX.toFixed(2)},${velY.toFixed(2)},${velZ.toFixed(2)}], moving: ${isMoving}, grounded: ${isGrounded}, water: ${isInWater}, shouldPlay: ${shouldPlayFootsteps}, forceStop: ${forceStop}, stopped frames: ${state.stoppedFrames}, instanceId: ${state.soundInstanceId}`);
      }
    }

    // Always stop the current sound if we shouldn't be playing footsteps OR force stop
    if (!shouldPlayFootsteps || forceStop) {
      if (state.soundInstanceId) {
        console.log(`[Footsteps] Stopping footsteps for entity ${entityId} (isLocal: ${isLocalPlayer}, reason: ${!shouldPlayFootsteps ? 'shouldntPlay' : 'forceStop'})`);
        const instanceToStop = state.soundInstanceId;
        this.audioManager.stopInstance(instanceToStop);
        
        // Additional safety: if this is local player and force stopping, kill ALL footstep sounds
        if (isLocalPlayer && forceStop) {
          console.log(`[Footsteps] Force stopping ALL footstep_running sounds for local player`);
          this.audioManager.stop('footstep_running');
        }
        
        state.soundInstanceId = null;
        state.stoppedFrames = 0;
      }
    } else {
      // Should be playing footsteps
      if (!state.soundInstanceId) {
        // No sound playing, start a new one
        let volume = this.calculateVolume(speed);
        if (isLocalPlayer) {
          volume *= 0.5; // Local footsteps are half as loud
        }
        const playbackRate = this.calculatePlaybackRate(speed);
        
        const instanceId = this.audioManager.play('footstep_running', {
          position: { x: posX, y: posY, z: posZ },
          volume,
          playbackRate,
          loop: true
        });
        
        // Only store the instance ID if play() succeeded
        if (instanceId) {
          state.soundInstanceId = instanceId;
        }
      } else {
        // Sound is playing, update its properties
        this.audioManager.updateInstancePosition(state.soundInstanceId, posX, posY, posZ);
        
        let volume = this.calculateVolume(speed);
        if (isLocalPlayer) {
          volume *= 0.5; // Local footsteps are half as loud
        }
        this.audioManager.updateInstanceVolume(state.soundInstanceId, volume);
        
        const playbackRate = this.calculatePlaybackRate(speed);
        this.audioManager.updateInstancePlaybackRate(state.soundInstanceId, playbackRate);
      }
    }
    
    state.lastSpeed = speed;
  }

  /**
   * Calculate footstep volume based on movement speed.
   * Returns a value between MIN_VOLUME and MAX_VOLUME.
   */
  private calculateVolume(speed: number): number {
    // Normalize speed (0 at MOVEMENT_THRESHOLD, 1 at max sprint speed 12)
    const normalizedSpeed = Math.max(0, Math.min(1, (speed - MOVEMENT_THRESHOLD) / 11.2));
    return MIN_VOLUME + normalizedSpeed * (MAX_VOLUME - MIN_VOLUME);
  }

  /**
   * Calculate footstep playback rate based on movement speed.
   * Returns slower playback when walking, normal when sprinting.
   */
  private calculatePlaybackRate(speed: number): number {
    // Normalize speed (0 at MOVEMENT_THRESHOLD, 1 at max sprint speed 12)
    const normalizedSpeed = Math.max(0, Math.min(1, (speed - MOVEMENT_THRESHOLD) / 11.2));
    return MIN_PLAYBACK_RATE + normalizedSpeed * (MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE);
  }

  /**
   * Forcefully stop any orphaned footstep sounds.
   * This is a safety fallback in case instance tracking gets out of sync.
   */
  private forceStopAllFootsteps(): void {
    this.audioManager.stop('footstep_running');
  }

  /**
   * Remove a player's footstep state when they leave.
   */
  removePlayer(entityId: number): void {
    const state = this.playerStates.get(entityId);
    if (state?.soundInstanceId) {
      this.audioManager.stopInstance(state.soundInstanceId);
    }
    this.playerStates.delete(entityId);
    
    // Clear local player tracking if removing the local player
    if (this.localPlayerEntityId === entityId) {
      this.localPlayerEntityId = null;
    }
  }

  /**
   * Clean up all states.
   */
  dispose(): void {
    // Stop all active footstep sounds
    for (const state of this.playerStates.values()) {
      if (state.soundInstanceId) {
        this.audioManager.stopInstance(state.soundInstanceId);
      }
    }
    this.playerStates.clear();
    this.localPlayerEntityId = null;
  }
}
