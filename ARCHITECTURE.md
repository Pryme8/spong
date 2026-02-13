# Spong — Architecture Overview

This document describes system boundaries, data flow, and extension patterns for the Spong game client and server. Use it when adding features or refactoring to keep the architecture consistent.

---

## 1. High-Level Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Client (Vue + Babylon.js)                                               │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐ │
│  │  GameView   │───▶│  useGameSession  │───▶│  Engine (Babylon)       │ │
│  │  (canvas)   │    │  (composable)    │    │  scene, systems, loop   │ │
│  └─────────────┘    └────────┬─────────┘    └─────────────────────────┘ │
│                               │                                          │
│                    ┌──────────┼──────────┐                               │
│                    ▼          ▼          ▼                               │
│             useTransformSync  useRoundState  useRoom                     │
│             useLobbySession   useMobileInput                            │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ WebSocket (opcodes + binary)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Server (Node.js)                                                         │
│  ┌─────────────┐    ┌─────────────────────────────────────────────────┐│
│  │ RoomManager │───▶│  Room.ts (single room: physics, projectiles,      ││
│  └─────────────┘    │  building, items, round, network dispatch)         ││
│                     └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Shared package
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Shared (@spong/shared)                                                  │
│  protocol (Opcode, message types), physics, codec, components,           │
│  levelgen, treegen, rockgen, bushgen, cloudgen, weaponStats, items      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Client:** Vue views own the UI and canvas; composables own session state and wire the engine to the network.
- **Server:** One `Room` per game; all game logic currently lives in `Room.ts` (target: decompose into systems).
- **Shared:** Single source of truth for protocol, physics, and game constants so client and server stay in sync.

---

## 2. Client Architecture

### 2.1 Entry Points and Ownership

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **View** | `client/src/views/GameView.vue` | Mounts canvas, calls `session.init(canvas, config)` on mount, `session.dispose()` on unmount. Binds HUD to session refs. |
| **Session** | `client/src/composables/useGameSession.ts` | Creates engine, scene, and all engine systems; registers network handlers; starts GameLoop; exposes reactive state and `dispose()`. |
| **Engine** | `client/src/engine/` | Babylon.js scene, systems, managers. No direct network or Vue; receives data via composable callbacks. |

Only the **view** holds the canvas ref. Only **useGameSession** creates or disposes the engine, scene, and engine systems. Engine code does not import composables or views.

### 2.2 Composables

Composables sit between the network and the engine. They own reactive state and translate opcodes into engine updates.

| Composable | Purpose |
|------------|---------|
| **useGameSession** | Full game lifecycle: init/dispose, network handler registration, GameLoop, refs for HUD (health, ammo, round, etc.). Creates and disposes engine systems. |
| **useTransformSync** | Holds `Map<entityId, LocalTransform>`. Handles `Opcode.TransformUpdate`, creates/removes transforms, runs `fixedUpdateAll` / `updateAll`, and `cleanup()`. |
| **useRoundState** | Round state: countdown, ended, winner, scores. Fed by `Opcode.RoundState` (and related). |
| **useRoom** | Room connection and join/leave. Used by session and lobby. |
| **useLobbySession** | Pre-game lobby: config, chat, start countdown. |
| **useMobileInput** | Mobile touch controls and input forwarding. |

**Rule:** Composables do not reach into each other’s internals. They receive `NetworkClient` and/or scene/engine APIs and call into them. Session is the only composable that creates engine systems and wires them to the network.

### 2.3 Data Flow (Client)

**Network → engine**

1. Messages arrive on `NetworkClient` (WebSocket).
2. Handlers registered in **useGameSession** (e.g. `networkClient.onHighFrequency(Opcode.TransformUpdate, ...)`) run.
3. Handlers update composable state and/or call into engine:
   - **TransformUpdate** → `useTransformSync`: `transform.applyServerState(data)`.
   - **ItemSpawn** → `itemSystem.handleSpawn(payload, scene)`.
   - **BlockPlaced** → `buildSystem.handleBlockPlaced(data)`.
   - etc.

**Input → server**

1. **InputManager** (keyboard/pointer) and/or **useMobileInput** produce input.
2. **GameLoop** runs at fixed timestep; before physics it calls `onFixedTick` (capture input, send to server).
3. Client sends `Opcode.PlayerInput` (and optionally ShootRequest, ReloadRequest, etc.).
4. Server runs authoritative physics and broadcasts `TransformUpdate` and other opcodes.

**Render loop**

1. **GameLoop** (variable tick): `transformSync.updateAll(deltaTime, physicsAlpha)`, `projectileManager.update()`, `cameraController.update()`, then `scene.render()`.
2. **CameraController** follows the local player target; **LocalTransform** interpolates and applies error offset for reconciliation.

So: **Network → composable → engine** for incoming data; **InputManager / composable → GameLoop → network** for outgoing input; **GameLoop** drives both fixed (physics) and variable (render) updates.

### 2.4 Engine Folder Layout

Engine code lives under `client/src/engine/`. Prefer putting new systems in the folder that matches their role.

| Folder | Role | Examples |
|--------|------|----------|
| **audio/** | Sound playback, footsteps | AudioManager, FootstepManager, soundManifest |
| **building/** | Build mode, grids, collision, ladders | BuildSystem, BuildGrid, BuildingCollisionManager, LadderPlacementSystem |
| **camera/** | Camera and pointer lock | CameraController |
| **core/** | Loop, time, world, local player/remote representation | GameLoop, LocalTransform, TimeManager, World |
| **entities/** | Mesh factories for weapons, items, props | entities/weapons, entities/items, entities/props |
| **input/** | Keyboard and pointer input | InputManager |
| **managers/** | Level content (trees, rocks, water, bushes, clouds) | LevelTreeManager, LevelWaterManager, etc. |
| **rendering/** | Post-process, particles, effects | CloudPostProcess, FinalPostProcess, DamagePopupSystem |
| **setup/** | Scene creation, level mesh, sky pick | setupScene, LevelMesh, SkyPickSphere |
| **systems/** | Gameplay systems and shared interface | WeaponSystem, ItemSystem, ProjectileManager, WeaponHolder, ShadowManager |
| **utils/** | Shared helpers | MeshUtils, SeededRandom, WeaponParts |

Singletons (e.g. **AudioManager**, **ShadowManager**, **World**, **TimeManager**) are created once per game session and disposed in **useGameSession.dispose()**.

### 2.5 System Lifecycle (Init / Update / Dispose)

Engine systems that own resources (meshes, materials, listeners, timers) must be disposable and follow a single lifecycle.

**Interface (optional but recommended):** `client/src/engine/systems/base/IGameSystem.ts`

```ts
interface IGameSystem {
  fixedUpdate?(dt: number): void;
  update?(deltaTime: number): void;
  dispose?(): void;
}
```

**Rules:**

1. **Init:** Systems are constructed (and optionally initialized) when the session starts, in **useGameSession.init()**. Pass in `scene`, `camera`, `networkClient`, and getters (e.g. colliders, voxel grid) as needed.
2. **Update:** Fixed-step logic runs from **GameLoop** (e.g. `transformSync.fixedUpdateAll(dt)`, `projectileManager.fixedUpdate(dt)`). Variable-step logic runs in the same loop (e.g. `transformSync.updateAll()`, `cameraController.update()`).
3. **Dispose:** Every system that holds Babylon resources (meshes, materials, textures, post-processes) or DOM/window listeners must implement `dispose()` and be called from **useGameSession.dispose()** in reverse order of creation. No leaked observers, event listeners, or refs.

**Order in useGameSession.dispose() (conceptual):** Stop game loop → dispose input/camera → dispose projectiles → cleanup transforms → dispose item/build/ladder systems → dispose level managers (trees, rocks, water, etc.) → dispose post-processes and effects → dispose scene and engine. Add new systems to this chain when you add them to the session.

### 2.6 Client–Server Physics Consistency

- Server runs physics at a fixed timestep (e.g. 60 Hz) and broadcasts state (e.g. 30 Hz).
- Client predicts locally at the same fixed timestep and reconciles with server state.
- **Shared physics:** Both sides use the same code from `@spong/shared` (e.g. `stepCharacter`, `stepProjectile`) and the same constants. The client must use the same collision data as the server (voxel grid, trees, rocks, building colliders) so prediction matches. See `.cursor/rules/client-server-physics.mdc` for details.

---

## 3. Server Architecture

### 3.1 Current Shape

- **Room** (`server/src/rooms/Room.ts`): One class per game room. It currently contains all game logic: connection lifecycle, physics tick, projectiles, building, items, round logic, and network dispatch. Target is to decompose it into smaller systems (see TODO).
- **RoomManager**: Creates and tracks rooms; hands off connections to the right room.
- **ConnectionHandler**: WebSocket handling and opcode routing into the room.

The server has no renderer; it uses a null engine and shared physics/collision for deterministic simulation only.

### 3.2 Target Decomposition (from TODO)

- **PhysicsSystem** – character stepping, collision, ground detection; Room calls `physicsSystem.tick(dt)`.
- **ProjectileSystem** – spawn, step, hit detection, destroy; emits events for damage/death/network.
- **BuildingSystem** – block place/remove/transform/finalize; owns building state; Room delegates opcodes.
- **ItemSystem** – spawn, pickup, drop; clean interface for future inventory.
- **Room** – thin orchestrator: lifecycle, system wiring, network dispatch (~200 lines).

New server features (inventory, water sync, ladder climbing, spectator) should plug into these systems rather than grow Room further.

---

## 4. Shared Package

- **protocol.ts** – `Opcode` enum and message type definitions. High-frequency messages (e.g. TransformUpdate, PlayerInput) are often binary-encoded; low-frequency are JSON. Group opcodes by system when adding new ones.
- **physics.ts / physicsConstants** – Character and projectile stepping, collision. Must stay in sync with client and server.
- **codec.ts** – Encode/decode for binary opcodes so client and server agree on wire format.
- **components/** – ECS-style component types used by the server (health, ammo, weapon, etc.).
- **levelgen, treegen, rockgen, bushgen, cloudgen** – Deterministic level and prop generation from seed; used by both server (collision/spawn) and client (visuals).
- **weaponStats, items** – Canonical weapon and item definitions.

When changing physics or protocol, consider both client and server and any shared tests.

---

## 5. Extension Patterns

### 5.1 Adding a New Client-Side System

1. **Place it** in the right engine folder (e.g. `systems/`, `managers/`, `rendering/`).
2. **Implement** init (constructor or explicit init), update/fixedUpdate if needed, and **dispose()** (remove listeners, dispose meshes/materials).
3. **Create and dispose** it in **useGameSession**: in `init()` after scene/engine are ready, and in `dispose()` in reverse order.
4. **Wire network** in useGameSession: register `networkClient.onHighFrequency` / `onLowFrequency` for the opcodes that affect this system and call into the system (e.g. `mySystem.handleMessage(payload)`).
5. **Expose state to the HUD** via refs returned from useGameSession (or from a small composable used by the session) and bind in the view.

### 5.2 Adding a New Opcode

1. **Define** the opcode in `shared/src/protocol.ts` and the message type(s).
2. **Encode/decode** in `shared/src/codec.ts` if the message is binary.
3. **Server:** In Room (or the right system after decomposition), handle the opcode and update state; broadcast to clients as needed.
4. **Client:** In useGameSession (or the composable that owns that feature), register a handler and update engine state or call into the right system.

### 5.3 Adding a New Level Content Type (e.g. “flowers”)

1. **Shared:** Add generator/mesh logic (or reuse existing pattern from treegen/rockgen/bushgen); expose collision/spawn data if the server needs it.
2. **Server:** In Room, spawn instances (e.g. from seed), write collision if needed, and send a spawn opcode (e.g. FlowerSpawn) with positions/ids.
3. **Client:** Add a manager (e.g. `LevelFlowerManager`) in `managers/`, create meshes from spawn data, dispose in useGameSession.
4. **Client physics:** If it affects movement, add collision data to the same getters used by LocalTransform (e.g. tree/rock colliders) so client prediction matches server.

---

## 6. Documentation and Conventions

- **README.md** – Project overview and how to run.
- **QUICKSTART.md** – Minimal steps to get the game running.
- **TODO.md** – Current tasks; Architecture / Polish / New Features tracks.
- **docs/** – Deeper guides (e.g. AUDIO_SETUP_GUIDE.md, LADDER_SYSTEM_PLAN.md).
- **.cursor/rules/** – Rules for AI and humans (e.g. client-server physics, TODO management).

Prefer small, self-contained changes. When adding a feature, check whether the system it touches needs architecture or polish first; do that first when it does.
