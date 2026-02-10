# Project TODO List

This is the master TODO list for the Spong project. Agents should check this list when working on tasks and update it accordingly.

Tasks are organized by priority tier. **Work top-down** -- higher tiers should be completed before lower tiers to ensure the core game loop is solid before adding content and polish.

---

## Tier 0 — Blocking Bugs

These are showstoppers that break existing systems. Fix before anything else.

- [ ] **Fix client prediction desync (Priority 1 physics refactor)**
  - [x] Ensure `BuildingCollisionManager` is integrated into `GameView` and `useTransformSync`
  - [x] Pass block colliders to `stepCharacter()` in `LocalTransform.ts` (lines 197, 240)
  - [x] Listen for `BuildingInitialState`, `BlockPlaced`, `BlockRemoved` opcodes in GameView (via useGameSession)
  - [x] Verify tree and rock colliders are passed to client-side `stepCharacter()` calls
  - [ ] Test: no rubber-banding on building blocks at 50ms, 100ms, 200ms latency

## Tier 1 — Core Game Loop

These make Spong a playable game rather than a tech demo. Aim for a playable vertical slice.

- [x] ~~**Implement game mode / round system**~~ ✅ COMPLETE
  - [x] ~~Add FFA deathmatch mode with score limit or timer~~ (Server + client complete)
  - [x] ~~Implement round start/end flow with countdown~~ (Server + client complete)
  - [x] ~~Broadcast round state to all players~~ (Server + client complete)
  - [x] ~~Handle round reset (respawn all players, reset scores)~~ (Server + client complete)
  - [x] ~~Create useRoundState.ts composable~~ (Complete)
  - [x] ~~Wire network listeners in useGameSession.ts~~ (Complete)
  - [x] ~~Create CountdownOverlay.vue component~~ (Complete)
  - [x] ~~Create VictoryScreen.vue component~~ (Complete)
- [x] ~~**Implement respawn system**~~ *(Already exists - instant respawn on death)*
  - [x] ~~Handle player death when health reaches 0~~ (Already implemented)
  - [x] ~~Broadcast death/respawn events to all players~~ (EntityDeath opcode exists)
- [x] ~~**Implement kill feed / scoreboard UI**~~ ✅ COMPLETE
  - [x] ~~Track per-player stats (kills/deaths) server-side~~ (Complete)
  - [x] ~~Create KillFeed.vue component~~ (Complete - shows suicides, top-right)
  - [x] ~~Create Scoreboard.vue component~~ (Complete - Tab key, shows connection info)
  - [x] ~~Integrate into GameView.vue~~ (Complete)
- [x] ~~**Victory screen / round end UI**~~ ✅ COMPLETE
  - [x] ~~Show match winner at round end~~ (Server + client complete)
  - [x] ~~Display final scores~~ (VictoryScreen.vue complete)
  - [x] ~~Auto-transitions to next round after 10 seconds~~ (Server handles)
- [ ] **Implement inventory system and equip hotbar (1-4 keys)**
  - [ ] Create inventory data model (slots, stacking, capacity)
  - [ ] Build inventory/hotbar UI in GameHud
  - [ ] 1-4 keys cycle through equipped items
  - [ ] Increase collectable variety, make some collectables non-droppable
- [ ] **Finalize building system UX**
  - [ ] Make a finalize building input that replaces delete build
  - [ ] Move delete build to same mode but right click button
  - [ ] When building finalized, user gains 50% of materials back
  - [ ] Greedy mesh the grid on finalization
  - [ ] Dispose all temporary blocks and colliders
  - [ ] Generate new collider for greedy mesh or use greedy mesh as collider

## Tier 2 — Feel & Polish

These make the game fun to play. Prioritize after the core loop works.

- [ ] **Implement ladder climbing behavior (Phase 2 of ladder system)**
- [ ] **Add hit feedback systems**
  - [ ] Damage numbers on hit
  - [ ] Hit marker crosshair flash
  - [ ] Screen flash / vignette on taking damage
  - [ ] Directional damage indicator
- [ ] **Implement death camera / kill cam**
  - [ ] Camera follows killer briefly on death
  - [ ] Spectator mode when dead (cycle through alive players)
- [ ] **Sound design pass**
  - [ ] Footstep sounds (surface-dependent if possible)
  - [ ] Distinct gunshot sounds per weapon type
  - [ ] Impact / hit sounds
  - [ ] Ambient environment audio
  - [ ] Building placement / destruction sounds
  - [ ] UI interaction sounds
- [ ] **Implement cloud shadow projection system**
  - [ ] Set up RTT (render-to-texture) from sun's perspective capturing cloud positions
  - [ ] Create screen-space shadow projection shader that samples cloud RTT
  - [ ] Project cloud shadows onto terrain/objects based on sun direction
  - [ ] Optimize shadow map resolution and update frequency
  - [ ] Blend cloud shadows with existing directional light shadows

## Tier 3 — Visual Identity

These give Spong its distinctive look.

- [ ] **Define and implement art direction**
  - [ ] Choose a cohesive visual style (low-poly, voxel-painterly, neon-tron, etc.)
  - [ ] Create material/color palette guidelines
  - [ ] Apply consistent style across terrain, props, weapons, UI
- [ ] **Implement weather system**
  - [ ] Add rain/fog/snow weather types to SunConfig generation (seed-based)
  - [ ] Create particle systems for weather effects (rain, snow)
  - [ ] Implement fog density adjustments based on weather
  - [ ] Add weather-appropriate sky shader modifications
  - [ ] Network sync weather state for multiplayer consistency
- [ ] **Implement night time support**
  - [ ] Extend sun elevation range to include below-horizon angles (negative elevation for night)
  - [ ] Add moon light source (opposite sun direction, cool blue/white color)
  - [ ] Adjust sky shader to render night sky (stars, moon visibility)
  - [ ] Implement smooth day/night transitions with twilight colors
  - [ ] Add point lights or emissive materials for artificial lighting at night

## Tier 4 — Scale & Content

These add replayability and social features. Build after the game is fun at small scale.

- [ ] **Expand lobby configuration options for item spawns**
  - [x] Add pistol count configuration (0-100)
  - [ ] Add SMG count configuration
  - [ ] Add LMG count configuration
  - [ ] Add shotgun count configuration
  - [ ] Add assault rifle count configuration
  - [ ] Add armor vest spawn configuration
  - [ ] Add helmet spawn configuration
  - [ ] Add materials/resource pack configuration
  - [ ] Create organized UI tabs/sections for different config categories
- [ ] **Implement terrain ring system with chunked terrain generation**
  - [ ] Spawn ring of terrain chunks around center terrain using same noise generation
  - [ ] Implement terrain chunking system that divides terrain by position offsets
  - [ ] Randomize tree/rock spawns on outer terrains based on center terrain spawn counts
  - [ ] Spread gun and item spawns across entire ring dimensions instead of center only
  - [ ] Extend hardcoded player movement limits to cover entire ring extents
  - [ ] Ensure collision detection works across terrain chunk boundaries
- [ ] **Implement building design save/load system with URL hashes**
  - [ ] Add save button in builder mode that serializes building state
  - [ ] Send building data to server and generate hash
  - [ ] Update URL with generated hash
  - [ ] Server-side: Store building designs by hash
  - [ ] On page load with hash, fetch and restore building state from server
  - [ ] Client-side: Restore blocks and building state from loaded data

## Technical Debt & Infrastructure

Non-feature work that prevents future pain. Weave into other tiers as capacity allows.

- [ ] **Decompose Room.ts** — physics tick method spans 800+ lines; extract into PhysicsSystem, ProjectileSystem, BuildingSystem
- [ ] **Add physics unit tests** — deterministic stepCharacter must produce identical output on client and server; add round-trip codec tests
- [ ] **Server-side validation basics** — rate limit shoot requests, position sanity checks, speed validation
- [ ] **Network reconnection resilience** — verify game state resync on reconnect (room rejoin, full state snapshot)
- [ ] **Player disconnect cleanup audit** — confirm entities, projectiles, and building state are properly disposed
- [ ] **Mobile input completeness audit** — verify mobile players can build, use inventory, switch weapons
- [ ] **Performance profiling pass** — benchmark physics tick per entity, collision query time, measure against <2ms and <1ms targets
- [ ] **Consolidate cursor rules** — three overlapping physics rules + collision rule can be merged after physics refactor
- [ ] **Fix PHYSICS_REFACTOR_COMPLETE.md** — file contains codec.ts source code instead of refactor summary; fix or delete
- [ ] **Clean up root documentation** — consolidate 11 root markdown files into a `docs/` folder or prune completed plans

---

## Completed Tasks

- [x] ~~Sync user colors between clients~~ (Completed: Player colors are now assigned server-side using HSL-based generation, included in PlayerInfo protocol, and synced to all clients. Colors are displayed consistently across all players in both game and lobby views.)
- [x] ~~Implement Game route pre-lobby system~~ (Completed: Created PreLobbyView.vue with player list showing synced colors, lobby chat system, seed/config selection for room owner, and Start button. Implemented all lobby opcodes (ChatMessage, ChatBroadcast, LobbyConfig, LobbyStart) with server-side validation. Room owner can configure seed and start the game, migrating all players to the level route with proper URL parameters.)
- [x] ~~Implement Level route (direct-to-game)~~ (Completed: /level route now accepts both seed and room query params. GameView.vue prioritizes room param for pre-lobby redirects. Added Quick Play button to HomeView for instant random-seed games. /game route now shows PreLobbyView, /level route drops directly into the game.)
- [x] ~~Seed-based random sun position per level instance~~ (Completed: shared `generateSunConfig(seed)` generates deterministic sun elevation/azimuth, light color, sky shader params, and ambient lighting. Applied via `createGameScene` when a level seed is present.)
- [x] ~~Create ladders (Phase 1: Placement System)~~ — Implemented ladder placement with raycast validation, multi-segment preview, server/client entity spawning, and full network synchronization. Players now spawn with ladder equipped for testing. See LADDER_SYSTEM_PLAN.md for implementation details.
- [x] ~~Unified physics constants (Priority 2)~~ — Created `physicsConstants.ts` as single source of truth for all physics values across client and server.
- [x] ~~Unified collision manager infrastructure (Priority 3)~~ — Created `CollisionWorld` class and helper functions. Infrastructure ready, full migration deferred.
- [x] ~~Enable build system in game cycle~~ (Completed: BuildSystem was already fully integrated into GameView via the shared `useGameSession` composable used by both GameView and BuilderView. All building network opcodes (BuildingInitialState, BlockPlaced, BlockRemoved, BuildingTransformed, BuildingDestroyed) are handled in useGameSession and update both BuildingCollisionManager for physics and BuildSystem for visuals. BuildingCollisionManager is passed to useTransformSync and LocalTransform, which correctly passes block colliders to stepCharacter in both prediction paths. Server spawns 5 hammers randomly across terrain in level rooms. Players can pick up a hammer and use keys 1-4 to switch build modes, with full collision synchronization across all clients.)

---

**Instructions for Agents:**
1. Check if your current task relates to any TODO item
2. Work top-down through tiers — Tier 0 before Tier 1, etc.
3. If completing a TODO, move it to "Completed Tasks" section with strikethrough
4. Add new TODOs as they arise during implementation — place them in the appropriate tier
5. Keep the list organized and up-to-date
