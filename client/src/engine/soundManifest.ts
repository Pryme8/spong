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
}

/**
 * Complete sound manifest.
 * Scan your assets/sfx folder and add entries here.
 */
export const SOUND_MANIFEST: SoundManifestEntry[] = [
  // ── Weapon Sounds ────────────────────────────────────
  {
    name: 'pistol_shot',
    path: '/assets/sfx/pistol_shot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
  },
  {
    name: 'pistol_reload',
    path: '/assets/sfx/pistol_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },
  {
    name: 'empty_click',
    path: '/assets/sfx/empty_click.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },

  // ── Impact Sounds ────────────────────────────────────
  {
    name: 'bullet_impact',
    path: '/assets/sfx/bullet_impact.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
  },

  // ── Player Sounds ────────────────────────────────────
  {
    name: 'player_hurt',
    path: '/assets/sfx/player_hurt.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },
  {
    name: 'footstep',
    path: '/assets/sfx/footstep.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },

  // ── Environment Sounds ───────────────────────────────
  {
    name: 'rustle',
    path: '/assets/sfx/rustle.mp3',
    channel: 'ambient',
    maxInstances: 3,
    spatial: false,
  },

  // ── Item Sounds ──────────────────────────────────────
  {
    name: 'item_pickup',
    path: '/assets/sfx/item_pickup.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },
  {
    name: 'item_drop',
    path: '/assets/sfx/item_drop.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },

  // ── Shotgun Sounds ───────────────────────────────────
  {
    name: 'shotgun_shoot',
    path: '/assets/sfx/shotgun_shoot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
  },
  {
    name: 'shotgun_reload',
    path: '/assets/sfx/shotgun_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
  },
  {
    name: 'shotgun_cocking',
    path: '/assets/sfx/shotgun_cocking.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
    startTime: 2.0, // Skip 2 seconds of silence at the start
  },

  // ── LMG Sounds ───────────────────────────────────────
  {
    name: 'LMG_shoot',
    path: '/assets/sfx/LMG_shoot.mp3',
    channel: 'sfx',
    maxInstances: 8,
    spatial: true,
  },
  {
    name: 'LMG_reload',
    path: '/assets/sfx/LMG_reload.mp3',
    channel: 'sfx',
    maxInstances: 4,
    spatial: true,
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
    };
  });
}
