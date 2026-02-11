# Wind-Swaying Foliage Implementation

## Status: Infrastructure Ready, Feature Disabled

The global `World` class infrastructure is in place to support wind-swaying foliage, but the feature is currently **disabled**. Tree leaves and bushes use `StandardMaterial` without vertex displacement.

### Why Infrastructure First?
- World class provides centralized wind state for water and future systems
- Easy to re-enable wind sway by converting materials to CustomMaterial
- Zero performance impact when disabled (no shader overhead)

### To Enable Wind Sway
Simply replace `StandardMaterial` with `CustomMaterial` and add vertex displacement shaders (see git history for implementation).

---

## Implementation Overview (When Enabled)
Implemented a global wind system that creates synchronized wind effects across water waves, tree leaves, and bushes. All foliage sways naturally in response to shared wind parameters.

## Architecture

### Global Wind System (`World.ts`)
Created a `World` singleton class that provides global wind parameters:
- `wind.directionX` / `wind.directionZ`: Wind direction vector
- `wind.speed`: Animation speed multiplier
- `wind.strength`: Intensity multiplier for foliage displacement

**Note:** `TimeManager` now delegates to `World.getInstance()` for backward compatibility.

### Vertex Displacement Shaders
Both tree leaves and bushes now use `CustomMaterial` with vertex shaders that:
1. Sample procedural noise based on world position and wind parameters
2. Apply height-based displacement (vertices higher up sway more)
3. Create pseudo-3D motion with XZ horizontal sway and subtle Y bobbing
4. Use the same noise functions as water for visual consistency

### Shared Wind Parameters
- Water waves, tree leaves, and bushes all read from `TimeManager.Wind`
- Adjusting wind in debug panel affects all systems simultaneously
- Wind direction matches between water cellular waves and foliage movement

## Implementation Details

### Tree Leaves (`LevelTreeManager.ts`)
- **Currently**: Uses `StandardMaterial` (static, no wind)
- **When enabled**: Convert to `CustomMaterial` with vertex displacement
- Height factor: `max(0.0, position.y + 8.0) * 0.1` (leaves offset up from origin)
- Sway amplitude: `0.2 * heightFactor * windStrength`
- Noise scale: `0.3` (medium frequency variation)

### Bushes (`LevelBushManager.ts`)
- **Currently**: Uses `StandardMaterial` (static, no wind)
- **When enabled**: Convert to `CustomMaterial` with vertex displacement
- Height factor: `max(0.0, position.y) * 0.15` (bushes start at ground level)
- Sway amplitude: `0.25 * heightFactor * windStrength`
- Noise scale: `0.4` (higher frequency for smaller plants)
- Faster wind phase: `windPhase * 2.5` vs trees' `windPhase * 2.0`

### Water (`LevelWaterManager.ts`)
- Updated to read wind from `World.getInstance()` instead of local params
- Removed `windDirX`, `windDirZ`, `windSpeed` from `WaterParams` interface
- Cellular wave direction matches foliage wind direction

## Debug Controls

### WorldDebugPanel Component (`?debugWorld`)
New dedicated panel for world-level properties:
- **Wind Direction X/Z**: Controls wind direction for all systems
- **Wind Speed**: Animation speed (0-2, default 0.3)
- **Wind Strength**: Foliage displacement intensity (0-3, default 1.0)
- **Sun Elevation/Azimuth**: Control global sun direction
- **Real-time Info**: Game time, computed directions

### WaterDebugPanel Component (`?waterDebug`)
Still includes wind controls for convenience:
- Section renamed to "Global Wind (Affects Water + Foliage)"
- Controls update `World.getInstance().wind` directly

## Technical Notes

### Noise Function
Uses the same 2D hash-based noise as water:
```glsl
float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // Smoothstep
  // ... hash-based interpolation
}
```

### Wind Phase Calculation
```glsl
float windPhase = windTime * 2.0 + worldPos.x * 0.3 + worldPos.z * 0.3;
vec3 sway = vec3(
  sin(windPhase) * windDir.x + noise * 0.5,      // Horizontal X
  sin(windPhase * 1.3) * 0.3,                     // Vertical bob
  sin(windPhase) * windDir.y + noise * 0.5       // Horizontal Z
) * heightFactor * windStrength * amplitude;
```

### Height-Based Displacement
- Only vertices above ground sway (prevents root/trunk stretching)
- Linear height multiplier creates natural "lever arm" effect
- Higher vertices move more, creating realistic bending motion

## Performance Impact
- Minimal: Vertex shader calculations are very lightweight
- No additional draw calls (materials replaced in-place)
- Noise is simple 2D hash function, not texture lookup
- Per-vertex cost: ~10 shader instructions (negligible on modern GPUs)

## Future Enhancements
- [ ] Add gust system (periodic wind strength spikes)
- [ ] Seed-based wind variation per level
- [ ] Time-of-day wind patterns (calmer at dawn/dusk)
- [ ] Weather-synced wind (stronger during rain/storms)
- [ ] Individual tree/bush variation using instance ID
- [ ] Optional turbulence layer for chaotic gusts
