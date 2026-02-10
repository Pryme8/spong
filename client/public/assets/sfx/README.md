# Sound Effects Folder

Place all your `.mp3`, `.wav`, or `.ogg` audio files here.

## Supported Formats
- MP3 (recommended for web)
- WAV (uncompressed, larger files)
- OGG (good compression, web-friendly)

## Naming Convention
Use descriptive snake_case names:
- `pistol_shot.mp3`
- `player_hurt.mp3`
- `bullet_impact.mp3`
- `ui_click.mp3`

## Adding New Sounds

1. Add your audio file to this folder
2. Update `client/src/engine/soundManifest.ts` with a new entry
3. Specify properties:
   - `name`: Unique identifier
   - `path`: `/assets/sfx/your_file.mp3`
   - `channel`: `'sfx'`, `'music'`, `'ambient'`, `'voice'`, or `'ui'`
   - `maxInstances`: How many can play simultaneously (default 4)
   - `spatial`: `true` for 3D positioned sounds, `false` for 2D

## Example Manifest Entry

```typescript
{
  name: 'explosion',
  path: '/assets/sfx/explosion.mp3',
  channel: 'sfx',
  maxInstances: 8,
  spatial: true,
}
```
