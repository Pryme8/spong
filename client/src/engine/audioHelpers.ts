/**
 * Audio helper utilities for common audio tasks.
 */

import { AudioManager } from './AudioManager';

/**
 * Play a 2D sound effect.
 */
export function playSFX(soundName: string, volume?: number): boolean {
  const audio = AudioManager.getInstance();
  return audio.play(soundName, { volume });
}

/**
 * Play a 3D spatial sound at a world position.
 */
export function playSFX3D(
  soundName: string,
  x: number,
  y: number,
  z: number,
  volume?: number
): boolean {
  const audio = AudioManager.getInstance();
  return audio.play(soundName, {
    position: { x, y, z },
    volume,
  });
}

/**
 * Play a sound with a duration (auto-stops after duration).
 */
export function playSFXWithDuration(
  soundName: string,
  duration: number,
  volume?: number
): boolean {
  const audio = AudioManager.getInstance();
  return audio.play(soundName, {
    duration,
    volume,
  });
}

/**
 * Play a looping sound (remember to stop it manually).
 */
export function playSFXLoop(soundName: string, volume?: number): boolean {
  const audio = AudioManager.getInstance();
  return audio.play(soundName, {
    loop: true,
    volume,
  });
}

/**
 * Stop a specific sound.
 */
export function stopSFX(soundName: string): void {
  const audio = AudioManager.getInstance();
  audio.stop(soundName);
}

/**
 * Stop all audio.
 */
export function stopAllAudio(): void {
  const audio = AudioManager.getInstance();
  audio.stopAll();
}

/**
 * Set master volume (0-1).
 */
export function setMasterVolume(volume: number): void {
  const audio = AudioManager.getInstance();
  audio.setMasterVolume(volume);
}

/**
 * Mute/unmute all audio.
 */
export function setMasterMuted(muted: boolean): void {
  const audio = AudioManager.getInstance();
  audio.setMasterMuted(muted);
}

/**
 * Get a channel and set its volume.
 */
export function setChannelVolume(channelName: string, volume: number): void {
  const audio = AudioManager.getInstance();
  const channel = audio.getChannel(channelName);
  if (channel) {
    channel.volume = volume;
  }
}

/**
 * Mute/unmute a specific channel.
 */
export function setChannelMuted(channelName: string, muted: boolean): void {
  const audio = AudioManager.getInstance();
  const channel = audio.getChannel(channelName);
  if (channel) {
    channel.muted = muted;
  }
}
