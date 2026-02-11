# World Class Refactor - Summary

## What Changed

### Created New Files
1. **`client/src/engine/World.ts`** - Singleton class for global environment state
2. **`client/src/components/WorldDebugPanel.vue`** - Debug panel for world properties
3. **`WORLD_CLASS.md`** - Comprehensive architecture documentation
4. **`WORLD_REFACTOR_SUMMARY.md`** - This file

**Note:** Wind-swaying foliage feature is disabled. Tree leaves and bushes use `StandardMaterial` (no vertex displacement). The World infrastructure is ready for future wind effects.

### Modified Files

#### Engine Classes
- **`client/src/engine/TimeManager.ts`**
  - Deprecated static properties, now delegates to `World.getInstance()`
  - Kept for backward compatibility
  
- **`client/src/engine/LevelWaterManager.ts`**
  - Changed from `TimeManager.Wind` to `World.getInstance().wind`
  - Removed wind parameters from `WaterParams` interface
  
- **`client/src/engine/LevelTreeManager.ts`**
  - Uses `StandardMaterial` for leaves (no wind displacement)
  - Ready to convert to `CustomMaterial` for wind sway if desired
  
- **`client/src/engine/LevelBushManager.ts`**
  - Uses `StandardMaterial` for bushes (no wind displacement)
  - Ready to convert to `CustomMaterial` for wind sway if desired

#### UI Components
- **`client/src/components/WaterDebugPanel.vue`**
  - Changed from `TimeManager.Wind` to `World.getInstance().wind`
  - Wind controls now affect global World state

#### Views
- **`client/src/views/GameView.vue`**
  - Added `WorldDebugPanel` import and component
  - Added `showWorldDebug` flag based on `?debugWorld` URL param
  
- **`client/src/views/BuilderView.vue`**
  - Added `WorldDebugPanel` import and component
  - Added `showWorldDebug` flag based on `?debugWorld` URL param

#### Documentation
- **`WIND_SWAY_IMPLEMENTATION.md`**
  - Updated to reference World class instead of TimeManager
  - Added WorldDebugPanel documentation

- **`TODO.md`**
  - Added completion entry for World class implementation

## Benefits

### Before
- Wind parameters scattered across different managers
- No unified sun direction storage
- TimeManager mixing time and environment state
- No single debug interface for world properties

### After
✅ **Single Source of Truth**: All world state in one place
✅ **Consistent Access**: `World.getInstance()` from anywhere
✅ **Better Organization**: Time, wind, and sun logically grouped
✅ **Extensibility**: Easy to add weather, seasons, gravity, etc.
✅ **Debug Interface**: Unified panel for all world properties
✅ **Backward Compatible**: Existing code using TimeManager still works

## Usage Examples

### Access Wind in Shader
```typescript
mat.onBindObservable.add(() => {
  const world = World.getInstance();
  effect.setFloat2('windDir', world.wind.directionX, world.wind.directionZ);
  effect.setFloat('windSpeed', world.wind.speed);
});
```

### Update World Time
```typescript
// In game loop
const world = World.getInstance();
world.updateTime(deltaSeconds);
```

### Set Sun Direction
```typescript
const world = World.getInstance();
world.setSunFromAngles(45, 135); // elevation, azimuth
```

### Debug World State
```
# Add URL parameter to any route:
http://localhost:5173/level?seed=test&debugWorld
http://localhost:5173/builder?debugWorld
http://localhost:5173/game?room=myroom&debugWorld
```

## Testing Checklist

- [x] No linter errors
- [x] TimeManager backward compatibility works
- [x] Wind affects water waves (trees/bushes static)
- [x] WorldDebugPanel displays correctly
- [x] URL parameter `?debugWorld` shows panel
- [x] Wind controls update World state
- [x] Sun controls update World.sun state
- [x] Game time displays and increments
- [x] Can combine with other debug panels (`?debugWorld&waterDebug`)
- [x] Tree leaves and bushes use StandardMaterial (no performance overhead)

## Future Enhancements

The World class is designed to grow with these planned features:

1. **Weather System**: `world.weather.type`, `world.weather.intensity`
2. **Day/Night Cycle**: Animate `world.sun.elevation` over time
3. **Seasons**: `world.season` affects colors, wind patterns
4. **Gravity**: `world.gravity` for per-level physics
5. **Network Sync**: Broadcast world state to clients
6. **Scripting**: Levels can override default world state
7. **Events**: Subscribe to state changes (`world.on('windChanged', ...)`)

## Migration Guide

### For New Code
✅ Use `World.getInstance()` directly:
```typescript
import { World } from '../engine/World';
const world = World.getInstance();
```

### For Existing Code
✅ No changes required! TimeManager delegates automatically:
```typescript
import { TimeManager } from '../engine/TimeManager';
const time = TimeManager.GameTime; // Still works
```

❌ But avoid using `TimeManager.Wind` (deprecated):
```typescript
// Old (still works, but deprecated)
TimeManager.Wind.directionX

// New (preferred)
World.getInstance().wind.directionX
```

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│            World (Singleton)             │
├─────────────────────────────────────────┤
│ • gameTime, deltaTime, deltaSeconds     │
│ • wind { directionX, directionZ, ... }  │
│ • sun { directionX, Y, Z, elevation ... }│
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌────▼────┐   ┌───▼────┐
│ Water │   │  Trees  │   │ Bushes │
│Manager│   │ Manager │   │Manager │
└───────┘   └─────────┘   └────────┘
    │             │             │
    └─────────────┼─────────────┘
                  │
          ┌───────▼────────┐
          │ WorldDebugPanel│
          │ WaterDebugPanel│
          └────────────────┘
```

## Commit Message

```
feat: create World singleton for global environment state

- Created World.ts singleton to centralize wind, sun, and time
- Refactored TimeManager to delegate to World (backward compatible)
- Updated water, tree, and bush managers to use World.getInstance()
- Created WorldDebugPanel component with ?debugWorld URL param
- Updated WaterDebugPanel to use World instead of TimeManager
- Added comprehensive WORLD_CLASS.md documentation
- All systems now share consistent global environment state

Benefits:
- Single source of truth for world properties
- Better organization and extensibility
- Unified debug interface
- Easy to add weather, seasons, day/night cycle in future
```

## Questions & Answers

**Q: Why keep TimeManager?**
A: Backward compatibility. Existing code continues to work without modification.

**Q: Should I use TimeManager or World in new code?**
A: Use `World.getInstance()` directly. TimeManager is deprecated.

**Q: Can I create multiple World instances?**
A: No, the constructor is private. Use `World.getInstance()`.

**Q: How do I reset world state?**
A: Call `World.reset()` to reset time to zero, or `World.dispose()` to destroy the singleton.

**Q: Will this affect performance?**
A: No. Singleton pattern is extremely lightweight. We actually improved performance by computing wind direction once per frame instead of in each system.

**Q: What if I want per-level wind/sun?**
A: On level load, call `world.setSunFromAngles()` and `world.setWindDirection()` with seed-based values.

## Related Documentation

- `WORLD_CLASS.md` - Full architecture and API reference
- `WIND_SWAY_IMPLEMENTATION.md` - Wind-swaying foliage system
- `TODO.md` - Project task list (updated with completion)
