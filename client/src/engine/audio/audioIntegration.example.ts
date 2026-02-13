/**
 * Example integration of AudioManager into your game.
 * This shows how to initialize and use audio in your GameView.
 */

import { Scene } from '@babylonjs/core';
import { AudioManager } from './AudioManager';
import { SOUND_MANIFEST } from './soundManifest';
import { playSFX, playSFX3D, stopSFX } from './audioHelpers';

/**
 * Initialize audio system during game setup.
 * Call this in your GameView setup, after scene is created.
 */
export async function initializeAudio(scene: Scene): Promise<void> {
  console.log('[Game] Initializing audio system...');

  // Initialize AudioManager
  const audioManager = AudioManager.initialize(scene);

  // Load all sounds from manifest
  await audioManager.loadSounds(SOUND_MANIFEST);

  // Optional: Set initial volumes
  audioManager.setMasterVolume(0.8);

  const sfxChannel = audioManager.getChannel('sfx');
  if (sfxChannel) {
    sfxChannel.volume = 1.0;
  }

  const musicChannel = audioManager.getChannel('music');
  if (musicChannel) {
    musicChannel.volume = 0.6;
  }

  console.log('[Game] Audio system ready');
}

// ────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Example: Play weapon fire sound at player position.
 */
export function playWeaponFire(x: number, y: number, z: number): void {
  playSFX3D('pistol_shot', x, y, z, 1.0);
}

/**
 * Example: Play reload sound.
 */
export function playReload(x: number, y: number, z: number): void {
  playSFX3D('pistol_reload', x, y, z, 0.8);
}

/**
 * Example: Play UI click sound (non-spatial).
 */
export function playUIClick(): void {
  playSFX('ui_click', 0.5);
}

/**
 * Example: Play hurt sound at player position.
 */
export function playPlayerHurt(x: number, y: number, z: number): void {
  playSFX3D('player_hurt', x, y, z, 0.9);
}

/**
 * Example: Play impact sound where bullet hits.
 */
export function playBulletImpact(x: number, y: number, z: number): void {
  playSFX3D('bullet_impact', x, y, z, 0.7);
}

/**
 * Example: Play item pickup sound.
 */
export function playItemPickup(x: number, y: number, z: number): void {
  playSFX3D('item_pickup', x, y, z, 0.8);
}

/**
 * Example: Play ambient wind loop (background).
 */
export function playAmbientWind(): void {
  const audioManager = AudioManager.getInstance();
  audioManager.play('wind_loop', { loop: true, volume: 0.3 });
}

/**
 * Example: Stop ambient wind.
 */
export function stopAmbientWind(): void {
  stopSFX('wind_loop');
}

/**
 * Example: Play menu music.
 */
export function playMenuMusic(): void {
  const audioManager = AudioManager.getInstance();
  audioManager.play('menu_music', { loop: true, volume: 0.5 });
}

/**
 * Example: Stop all music.
 */
export function stopAllMusic(): void {
  const audioManager = AudioManager.getInstance();
  const musicChannel = audioManager.getChannel('music');
  if (musicChannel) {
    musicChannel.volume = 0; // Fade or just stop
  }
}
