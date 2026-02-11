# World Class Architecture

## Overview
The `World` class is a singleton that centralizes all global environment state for the game. It provides a single source of truth for time, wind, sun direction, and other world-level properties that need to be shared across multiple systems.

## Architecture

### Singleton Pattern
```typescript
const world = World.getInstance();
```

The World class uses the singleton pattern to ensure only one instance exists throughout the application. This provides consistent access to global state from any system.

### State Categories

#### 1. Time State
- `gameTime`: Total elapsed game time in seconds
- `deltaTime`: Frame delta time in milliseconds
- `deltaSeconds`: Frame delta time in seconds

#### 2. Wind State
```typescript
wind: {
  directionX: number;   // Wind direction X component (-1 to 1)
  directionZ: number;   // Wind direction Z component (-1 to 1)
  speed: number;        // Animation speed multiplier (0-2)
  strength: number;     // Displacement intensity (0-3)
}
```

Used by:
- Water cellular wave direction
- Tree leaf vertex displacement
- Bush vertex displacement
- Any future wind-affected systems

#### 3. Sun State
```typescript
sun: {
  directionX: number;   // Sun direction X component
  directionY: number;   // Sun direction Y component  
  directionZ: number;   // Sun direction Z component
  elevation: number;    // Angle above horizon (0-90°)
  azimuth: number;      // Compass direction (0-360°)
}
```

Used by:
- Directional lighting
- Shadow calculations
- Sky shader
- Future day/night cycle

## Usage Patterns

### Updating Time
Called from game loop (60Hz):
```typescript
world.updateTime(deltaTimeSeconds);
```

### Accessing State in Shaders
Materials can bind uniforms in their `onBindObservable`:
```typescript
mat.onBindObservable.add(() => {
  const world = World.getInstance();
  effect.setFloat('gameTime', world.gameTime);
  effect.setFloat2('windDir', world.wind.directionX, world.wind.directionZ);
  effect.setFloat('windSpeed', world.wind.speed);
  effect.setFloat('windStrength', world.wind.strength);
});
```

### Setting Wind Direction
```typescript
const world = World.getInstance();
world.setWindDirection(1.0, 0.5); // Normalized automatically
```

### Setting Sun from Angles
```typescript
const world = World.getInstance();
world.setSunFromAngles(45, 135); // elevation, azimuth in degrees
```

### Setting Sun from Direction Vector
```typescript
const world = World.getInstance();
world.setSunFromDirection(directionalLight.direction);
```

## Systems Using World

### Current Integrations

1. **TimeManager** (deprecated wrapper)
   - Provides backward-compatible static accessors
   - Delegates to World singleton

2. **LevelWaterManager**
   - Reads wind state for wave direction
   - Updates every frame via onBindObservable

3. **LevelTreeManager**
   - Uses `StandardMaterial` (static, no wind displacement)
   - Infrastructure ready for future `CustomMaterial` wind sway

4. **LevelBushManager**
   - Uses `StandardMaterial` (static, no wind displacement)
   - Infrastructure ready for future `CustomMaterial` wind sway

### Future Integrations

Planned systems that should use World:
- **SkyManager**: Sun position, time of day
- **WeatherSystem**: Wind affects rain/snow particles
- **CloudSystem**: Wind affects cloud movement
- **ParticleEffects**: Wind affects smoke, dust, leaves
- **AudioSystem**: Wind volume based on wind.strength
- **DayNightCycle**: Sun elevation animates over time

## Debug Interface

### WorldDebugPanel Component
Accessible via `?debugWorld` URL parameter:
- Real-time wind direction control
- Sun elevation/azimuth adjustment
- Live display of computed values (sun direction vector, game time)
- Reset to defaults button

Example URL:
```
http://localhost:5173/builder?debugWorld
http://localhost:5173/level?seed=test&debugWorld
```

### Features
- **Wind Controls**: Adjust direction, speed, and strength
- **Sun Controls**: Set elevation and azimuth angles
- **Live Info Display**: 
  - Current game time
  - Computed sun direction vector
  - Normalized wind direction
- **Green/nature themed UI** (distinct from water debug panel's blue theme)

## Migration from TimeManager

The `TimeManager` class is now deprecated but kept for backward compatibility:

**Old Pattern:**
```typescript
import { TimeManager } from './TimeManager';
effect.setFloat('time', TimeManager.GameTime);
```

**New Pattern:**
```typescript
import { World } from './World';
const world = World.getInstance();
effect.setFloat('time', world.gameTime);
```

Static getters on `TimeManager` now delegate to `World.getInstance()`, so existing code continues to work without modification.

## Benefits

### 1. Centralized State
- Single source of truth for world properties
- No need to pass parameters through multiple layers
- Easy to access from any system

### 2. Consistency
- Wind direction is identical across all systems
- Time is synchronized automatically
- Sun position updates propagate instantly

### 3. Debuggability
- Single panel to control all world state
- Easy to test different conditions
- Real-time feedback on changes

### 4. Extensibility
- Easy to add new world properties (weather, seasons, etc.)
- New systems can access existing state immediately
- No need to refactor multiple systems when adding properties

### 5. Performance
- Singleton pattern avoids repeated object creation
- State is computed once per frame, not per-system
- Shader uniforms reference same values

## Best Practices

### DO
✅ Read from World in shader `onBindObservable`
✅ Update World time once per frame from game loop
✅ Use setter methods (`setWindDirection`, `setSunFromAngles`)
✅ Access via `World.getInstance()` in non-singleton classes

### DON'T
❌ Create new World instances manually
❌ Update time from multiple places
❌ Mutate state directly without using setters
❌ Store copies of World state (always read fresh)

## Testing

### Manual Testing Checklist
- [ ] Wind changes affect water, trees, and bushes simultaneously
- [ ] Sun direction updates lighting in scene
- [ ] Game time increments smoothly
- [ ] Debug panel controls update world state correctly
- [ ] Multiple systems read consistent values

### URL Parameters for Testing
```
?debugWorld          # Show world debug panel
?waterDebug          # Show water debug panel (also has wind controls)
?shadowDebug         # Show shadow debug panel
```

Combine multiple:
```
?debugWorld&waterDebug&shadowDebug
```

## Future Enhancements

### Planned Features
1. **Seed-based initialization**: Generate wind/sun from level seed
2. **Time of day system**: Animate sun elevation over time
3. **Weather states**: Rain, fog, storms affect wind strength
4. **Seasonal variations**: Different default values per season
5. **Network sync**: Broadcast world state to multiplayer clients
6. **Persistence**: Save/load world state to local storage
7. **Scripting**: Allow levels to define custom world state
8. **Events**: Subscribe to world state changes (onWindChanged, onSunChanged)

### API Extensions
```typescript
// Potential future additions
world.weather.type: 'clear' | 'rain' | 'fog' | 'storm';
world.weather.intensity: number; // 0-1

world.timeOfDay: number; // 0-24 hours
world.season: 'spring' | 'summer' | 'fall' | 'winter';

world.gravity: number; // Allow per-level gravity
world.ambientSound: string; // Background audio loop

// Event system
world.on('windChanged', (newWind) => { ... });
world.on('timeOfDayChanged', (newTime) => { ... });
```

## Related Documentation
- `WIND_SWAY_IMPLEMENTATION.md` - Wind-affected foliage system
- `WATER_SYSTEM.md` - Water wave generation (if exists)
- `SHADOW_SYSTEM.md` - Shadow mapping setup (if exists)
