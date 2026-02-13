/**
 * Sound manifest - defines all available sounds and their properties.
 * Add new sounds here as you add them to assets/sfx folder.
 */

export interface SoundManifestEntry {
  /** Unique identifier for the sound */
  name: string;
  /** Path to the audio file relative to public folder */
  path: string;
  /** Audio channel (sfx, music, ambient, voice, ui) */
  channel?: string;
  /** Maximum simultaneous instances (pooling) */
  maxInstances?: number;
  /** Whether this sound should be spatial (3D positioned) */
  spatial?: boolean;
  /** Start time offset in seconds (skips silence at beginning) */
  startTime?: number;
  /** Distance at which volume is 100% (default: 5) */
  refDistance?: number;
  /** Distance beyond which sound is inaudible (default: 150) */
  maxDistance?: number;
  /** How quickly volume drops with distance (default: 1.5) */
  rolloffFactor?: number;
}

/**
 * Complete sound manifest.
 * Scan your assets/sfx folder and add entries here.
 */
export const SOUND_MANIFEST: SoundManifestEntry[] = [
  // ── Weapon Sounds ────────────────────────────────────
  // Gunshots carry far - high maxDistance, generous refDistance
  {
    name: 'pistol_shot',
    path: '/assets/sfx/pistol_shot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
    refDistance: 8,
    maxDistance: 200,
    rolloffFactor: 1.2,
  },
  {
    name: 'pistol_reload',
    path: '/assets/sfx/pistol_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 4,
    maxDistance: 40,
  },
  {
    name: 'empty_click',
    path: '/assets/sfx/empty_click.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 3,
    maxDistance: 20,
  },

  // ── Impact Sounds ────────────────────────────────────
  {
    name: 'bullet_impact',
    path: '/assets/sfx/bullet_impact.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
    refDistance: 5,
    maxDistance: 100,
  },

  // ── Player Sounds ────────────────────────────────────
  {
    name: 'player_hurt',
    path: '/assets/sfx/player_hurt.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 5,
    maxDistance: 60,
  },
  {
    name: 'footstep',
    path: '/assets/sfx/footsteps.wav',
    channel: 'sfx',
    maxInstances: 16, // One per player + some extra
    spatial: true,
    refDistance: 2,
    maxDistance: 25,
    rolloffFactor: 2.5,
  },
  {
    name: 'footstep_running',
    path: '/assets/sfx/footsteps_running.wav',
    channel: 'sfx',
    maxInstances: 16, // One per player + some extra
    spatial: true,
    refDistance: 2,
    maxDistance: 25,
    rolloffFactor: 2.5,
  },

  // ── Environment Sounds ───────────────────────────────
  {
    name: 'rustle',
    path: '/assets/sfx/rustle.mp3',
    channel: 'ambient',
    maxInstances: 3,
    spatial: true,
    refDistance: 3,
    maxDistance: 25,
    rolloffFactor: 2,
  },
  {
    name: 'heartbeat',
    path: '/assets/sfx/heartbeat.wav',
    channel: 'sfx',
    maxInstances: 1,
    spatial: false,
  },

  // ── Item Sounds ──────────────────────────────────────
  {
    name: 'item_pickup',
    path: '/assets/sfx/item_pickup.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 3,
    maxDistance: 30,
  },
  {
    name: 'item_drop',
    path: '/assets/sfx/item_drop.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 3,
    maxDistance: 30,
  },

  // ── Shotgun Sounds ───────────────────────────────────
  {
    name: 'shotgun_shoot',
    path: '/assets/sfx/shotgun_shoot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
    refDistance: 10,
    maxDistance: 250,
    rolloffFactor: 1,
  },
  {
    name: 'shotgun_reload',
    path: '/assets/sfx/shotgun_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 4,
    maxDistance: 40,
  },
  {
    name: 'shotgun_cocking',
    path: '/assets/sfx/shotgun_cocking.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    startTime: 2.0, // Skip 2 seconds of silence at the start
    refDistance: 4,
    maxDistance: 40,
  },

  // ── LMG Sounds ───────────────────────────────────────
  {
    name: 'LMG_shoot',
    path: '/assets/sfx/LMG_shoot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
    refDistance: 10,
    maxDistance: 250,
    rolloffFactor: 1,
  },
  {
    name: 'LMG_reload',
    path: '/assets/sfx/LMG_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    refDistance: 4,
    maxDistance: 40,
  },

];

/**
 * Helper to automatically scan a folder and generate manifest entries.
 * Use this during development to quickly add new sounds.
 */
export function generateManifestFromFileList(
  files: string[],
  options: {
    channel?: string;
    maxInstances?: number;
    spatial?: boolean;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
  } = {}
): SoundManifestEntry[] {
  return files.map((file) => {
    // Extract name from filename (remove extension and path)
    const name = file.split('/').pop()?.replace(/\.[^/.]+$/, '') || file;

    return {
      name,
      path: `/assets/sfx/${file}`,
      channel: options.channel || 'sfx',
      maxInstances: options.maxInstances || 4,
      spatial: options.spatial !== undefined ? options.spatial : true,
      refDistance: options.refDistance,
      maxDistance: options.maxDistance,
      rolloffFactor: options.rolloffFactor,
    };
  });
}
