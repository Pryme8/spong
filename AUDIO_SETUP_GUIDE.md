# Audio System Setup Guide

Complete guide for setting up and using the game's audio system.

## 📁 Folder Structure

```
client/
├── public/
│   └── assets/
│       └── sfx/              # Place ALL audio files here
│           ├── pistol_shot.mp3
│           ├── player_hurt.mp3
│           ├── bullet_impact.mp3
│           └── ... (all your sounds)
└── src/
    └── engine/
        ├── AudioManager.ts        # Main audio manager class
        ├── soundManifest.ts       # Sound registry/manifest
        ├── audioHelpers.ts        # Convenience functions
        └── audioIntegration.example.ts  # Usage examples
```

## 🚀 Quick Start

### 1. Add Your Audio Files

Place all audio files in `client/public/assets/sfx/`:
- Supported formats: MP3, WAV, OGG
- Recommended: MP3 for web compatibility
- Use descriptive names: `pistol_shot.mp3`, `player_hurt.mp3`

### 2. Update Sound Manifest

Edit `client/src/engine/soundManifest.ts` and add entries for each sound:

```typescript
{
  name: 'explosion',        // Unique ID to reference this sound
  path: '/assets/sfx/explosion.mp3',  // Path from public folder
  channel: 'sfx',           // Audio channel (sfx, music, ambient, voice, ui)
  maxInstances: 8,          // How many can play simultaneously
  spatial: true,            // true = 3D positioned, false = 2D
}
```

### 3. Initialize in GameView

Add to your `GameView.vue` setup:

```typescript
import { AudioManager } from '../engine/AudioManager';
import { SOUND_MANIFEST } from '../engine/soundManifest';

async function initializeGame() {
  // ... create scene ...
  
  // Initialize audio system
  const audioManager = AudioManager.initialize(scene);
  await audioManager.loadSounds(SOUND_MANIFEST);
  
  // Optional: Set volumes
  audioManager.setMasterVolume(0.8);
  
  console.log('Audio system ready!');
}
```

## 🎵 Audio Channels

The system has 5 built-in channels for organization:

| Channel | Purpose | Example Sounds |
|---------|---------|----------------|
| `sfx` | Sound effects | Weapons, footsteps, impacts |
| `music` | Background music | Menu music, gameplay music |
| `ambient` | Ambient loops | Wind, rain, environment |
| `voice` | Voice/announcer | Player voice lines, announcer |
| `ui` | UI feedback | Button clicks, menu sounds |

**Why use channels?**
- Volume control per category
- Mute/unmute entire categories
- Better audio mixing

## 🎮 Playing Sounds

### Basic Usage (2D Sounds)

```typescript
import { playSFX } from '../engine/audioHelpers';

// Play a UI sound
playSFX('ui_click', 0.5); // 50% volume

// Play with default volume
playSFX('menu_music');
```

### 3D Spatial Audio

```typescript
import { playSFX3D } from '../engine/audioHelpers';

// Play sound at world position
playSFX3D('pistol_shot', playerX, playerY, playerZ, 1.0);

// Play bullet impact where it hit
playSFX3D('bullet_impact', hitX, hitY, hitZ, 0.7);
```

### Looping Sounds

```typescript
import { playSFXLoop, stopSFX } from '../engine/audioHelpers';

// Start looping ambient wind
playSFXLoop('wind_loop', 0.3);

// Stop it later
stopSFX('wind_loop');
```

### Duration-Limited Sounds

```typescript
import { playSFXWithDuration } from '../engine/audioHelpers';

// Play for exactly 2.5 seconds, then auto-stop
playSFXWithDuration('engine_rev', 2.5, 0.8);
```

### Advanced Options

```typescript
import { AudioManager } from '../engine/AudioManager';

const audio = AudioManager.getInstance();

audio.play('footstep', {
  volume: 0.6,
  position: { x: 10, y: 0, z: 5 },
  playbackRate: 1.2,  // Pitch shift (1.0 = normal)
  duration: 1.5,      // Auto-stop after 1.5s
  loop: false
});
```

## 🎚️ Volume Control

### Master Volume

```typescript
import { setMasterVolume, setMasterMuted } from '../engine/audioHelpers';

// Set master volume (affects all sounds)
setMasterVolume(0.8); // 80%

// Mute/unmute everything
setMasterMuted(true);
setMasterMuted(false);
```

### Channel Volume

```typescript
import { setChannelVolume, setChannelMuted } from '../engine/audioHelpers';

// Reduce music volume
setChannelVolume('music', 0.5);

// Mute only SFX
setChannelMuted('sfx', true);
```

### Individual Sound Volume

```typescript
// Pass volume as second parameter
playSFX('pistol_shot', 0.6); // 60% of channel volume
```

**Volume stacking:**
Final volume = `soundVolume × channelVolume × masterVolume`

## 🔧 Integration Examples

### Weapon Fire

```typescript
// In your shooting code
function fireWeapon(weaponX: number, weaponY: number, weaponZ: number) {
  // Play gunshot at weapon position
  playSFX3D('pistol_shot', weaponX, weaponY, weaponZ, 0.9);
  
  // ... spawn projectile ...
}
```

### Player Damage

```typescript
// When player takes damage
function onPlayerDamaged(playerX: number, playerY: number, playerZ: number) {
  playSFX3D('player_hurt', playerX, playerY, playerZ, 0.8);
}
```

### Item Pickup

```typescript
// When player collects item
function onItemPickup(itemX: number, itemY: number, itemZ: number) {
  playSFX3D('item_pickup', itemX, itemY, itemZ, 0.7);
}
```

### UI Interactions

```typescript
// Button click
function onButtonClick() {
  playSFX('ui_click', 0.5);
}

// Menu hover
function onMenuHover() {
  playSFX('ui_hover', 0.3);
}
```

### Ambient Background

```typescript
// Start ambient sounds on level load
function startAmbient() {
  const audio = AudioManager.getInstance();
  
  // Wind loop at low volume
  audio.play('wind_loop', { loop: true, volume: 0.2 });
  
  // Background music
  audio.play('game_music', { loop: true, volume: 0.4 });
}
```

## ⚡ Sound Pooling

The system automatically pools sounds for you:

```typescript
{
  name: 'bullet_impact',
  maxInstances: 8,  // Up to 8 can play at once
  // ...
}
```

**How it works:**
- System pre-creates 8 `Sound` instances
- When you play, it grabs next available instance
- When sound ends, instance returns to pool
- If all 8 are playing, request is ignored (with warning)

**Tuning `maxInstances`:**
- Rapid-fire sounds: 6-8 instances
- Common sounds: 4 instances
- Rare sounds: 2 instances
- Unique sounds (music): 1 instance

## 🎯 Spatial Audio Settings

Spatial sounds use Babylon.js 3D audio with these defaults:

```typescript
{
  spatialSound: true,
  maxDistance: 100,      // Sound inaudible beyond this
  rolloffFactor: 1,      // How quickly volume drops off
  refDistance: 1,        // Distance at full volume
  distanceModel: 'linear'
}
```

**Distance model:**
- `'linear'` - Volume drops linearly (default)
- `'inverse'` - Realistic inverse square law
- `'exponential'` - Sharp drop-off

## 🛠️ Common Tasks

### Pause Audio on Game Pause

```typescript
import { pauseAllAudio, resumeAllAudio } from '../engine/audioHelpers';

function onGamePause() {
  pauseAllAudio();
}

function onGameResume() {
  resumeAllAudio();
}
```

### Stop All Sounds

```typescript
import { stopAllAudio } from '../engine/audioHelpers';

function onLevelEnd() {
  stopAllAudio();
}
```

### Check if Sound Exists

```typescript
const audio = AudioManager.getInstance();

if (audio.hasSound('explosion')) {
  playSFX('explosion');
}
```

### List All Loaded Sounds

```typescript
const audio = AudioManager.getInstance();
const allSounds = audio.getSoundNames();
console.log('Loaded sounds:', allSounds);
```

## 📝 Sound Manifest Tips

### Auto-generate manifest entries

If you have many files, use the helper:

```typescript
import { generateManifestFromFileList } from '../engine/soundManifest';

const fileList = ['pistol_shot.mp3', 'reload.mp3', 'hurt.mp3'];

const entries = generateManifestFromFileList(fileList, {
  channel: 'sfx',
  maxInstances: 4,
  spatial: true
});

// Add to SOUND_MANIFEST
```

### Organization

Group sounds by category in the manifest:

```typescript
export const SOUND_MANIFEST = [
  // ── Weapons ──
  { name: 'pistol_shot', /* ... */ },
  { name: 'pistol_reload', /* ... */ },
  
  // ── Player ──
  { name: 'player_hurt', /* ... */ },
  { name: 'footstep', /* ... */ },
  
  // ... etc
];
```

## 🐛 Troubleshooting

### "AudioManager not initialized"
- Make sure to call `AudioManager.initialize(scene)` before using audio
- Check that initialization happens after scene is created

### Sound not playing
- Verify file exists in `public/assets/sfx/`
- Check manifest entry is correct
- Ensure `maxInstances` isn't 0
- Check if all instances are in use (increase `maxInstances`)

### Sound too quiet/loud
- Check individual sound volume
- Check channel volume
- Check master volume
- Verify volume stacking: `sound × channel × master`

### 3D sound not spatial
- Ensure `spatial: true` in manifest
- Make sure passing `position` when playing
- Check camera is positioned correctly

### Sound file not loading
- Browser compatibility: Use MP3 for best support
- Check file path (case-sensitive on some servers)
- Open browser console for loading errors

## 📚 API Reference

### AudioManager Methods

| Method | Description |
|--------|-------------|
| `initialize(scene)` | Initialize singleton (static) |
| `getInstance()` | Get singleton instance (static) |
| `loadSounds(manifest)` | Load all sounds from manifest |
| `play(name, options)` | Play a sound |
| `stop(name)` | Stop all instances of a sound |
| `stopAll()` | Stop all sounds |
| `pauseAll()` | Pause all sounds |
| `resumeAll()` | Resume paused sounds |
| `setMasterVolume(v)` | Set master volume (0-1) |
| `setMasterMuted(m)` | Mute/unmute all |
| `getChannel(name)` | Get audio channel |
| `hasSound(name)` | Check if sound loaded |
| `getSoundNames()` | Get all loaded sound names |

### AudioChannel Properties

| Property | Description |
|----------|-------------|
| `volume` | Channel volume (0-1) |
| `muted` | Channel mute state (boolean) |

## 🎓 Best Practices

1. **Load sounds at startup** - Don't load mid-game (causes hitches)
2. **Use appropriate `maxInstances`** - Balance memory vs. playback flexibility
3. **Spatial for world sounds** - Makes game more immersive
4. **Non-spatial for UI** - UI sounds should be same volume everywhere
5. **Lower music volume** - 0.5-0.6 is good to not overpower SFX
6. **Pool rapid-fire sounds** - 6-8 instances for guns, impacts
7. **Stop loops manually** - Don't forget to stop ambient loops
8. **Use channels** - Makes volume mixing much easier
9. **Test on mobile** - Audio behaves differently on mobile browsers
10. **Respect auto-play policy** - Some browsers block audio until user interaction

## 🎬 Complete Example

See `client/src/engine/audioIntegration.example.ts` for complete integration examples.

---

**Need help?** Check the Babylon.js audio docs: https://doc.babylonjs.com/features/featuresDeepDive/audio/playingSoundsMusic
