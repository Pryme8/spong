# Spong — Project TODO

> **Last reorganized:** 2026-02-10
>
> This is a **research and refinement project** — there is no planned release. The goal is to build a modular, extendable game engine where new features plug in cleanly. We keep piling on features, but we **polish what we have** and **keep the architecture healthy** so the codebase stays a pleasure to work in.
>
> Work is organized into three tracks that run in parallel:
> - **🔧 Architecture & Modularity** — Make systems clean, decoupled, and extendable. This track has priority when it conflicts with features.
> - **✨ Polish Existing Systems** — Finish and refine what's already built before starting new things in the same area.
> - **🆕 New Features** — Expand the game. Only pick up new features when the systems they touch are in good shape.
>
> **Rules for agents:**
> 1. Before adding a new feature, check if the system it touches needs architecture or polish work first — do that first.
> 2. When completing a task, check its box `[x]` in-place.
> 3. If a task generates new work, add it to the appropriate section at the right priority.
> 4. Prefer small, self-contained PRs that leave the codebase better than they found it.
> 5. New systems should follow existing patterns (shared types, opcode-based protocol, composable on client, extracted system on server).

---

## 🔧 Architecture & Modularity

These make the codebase sustainable. A well-structured project means any new feature can be added without fighting the existing code. **Prioritize these when they intersect with feature work.**

### Server Decomposition *(highest priority — blocks everything server-side)*

Room.ts is 800+ lines with physics, projectiles, building, items, and round logic all interleaved. Every new server feature (inventory, water sync, ladder climbing, spectator) piles onto it. Decompose first.

- [ ] **Extract PhysicsSystem from Room.ts**
  - [ ] Move character stepping, collision resolution, and ground detection into `server/src/engine/PhysicsSystem.ts`
  - [ ] PhysicsSystem takes a CollisionWorld + entity list, returns updated states
  - [ ] Room.ts calls `physicsSystem.tick(dt)` — no physics logic remains in Room
- [ ] **Extract ProjectileSystem from Room.ts**
  - [ ] Move projectile lifecycle (spawn, step, hit detection, destroy) into `server/src/engine/ProjectileSystem.ts`
  - [ ] System emits events (hit, destroy) that Room wires to damage/death/network
- [ ] **Extract BuildingSystem from Room.ts**
  - [ ] Move block placement, removal, transformation, finalization into `server/src/engine/BuildingSystem.ts`
  - [ ] System owns building state; Room delegates opcode handling to it
- [ ] **Extract ItemSystem from Room.ts**
  - [ ] Move item spawning, pickup, drop logic into `server/src/engine/ItemSystem.ts`
  - [ ] Clean interface for inventory integration later
- [ ] **Room.ts becomes orchestrator only**
  - [ ] Target: ~200 lines — lifecycle management, system wiring, network dispatch
  - [ ] Each system is independently testable

### Shared Type & Protocol Hygiene

- [ ] **Audit `shared/src/protocol.ts` opcode organization**
  - [ ] Group opcodes by system (physics, building, items, round, water, ladder)
  - [ ] Add doc comments for each opcode's payload shape
  - [ ] Ensure all message types have corresponding encode/decode in codec if binary
- [ ] **Add physics unit tests**
  - [ ] Deterministic `stepCharacter` must produce bit-identical output on client and server for same inputs
  - [ ] Round-trip codec tests (encode → decode → compare) for all binary message types
  - [ ] Water physics edge cases (entry, exit, surface boundary, drowning tick)

### Client Architecture

- [ ] **Audit composable boundaries**
  - [ ] Verify `useGameSession`, `useTransformSync`, `useRoundState` have clean separation of concerns
  - [ ] No composable should directly reach into another's internals
  - [ ] Document the data flow: network → composable → engine system → renderer
- [ ] **Standardize engine system lifecycle**
  - [ ] Every engine system (BuildSystem, LadderPlacementSystem, WeaponSystem, ItemSystem, etc.) should follow the same init/update/dispose pattern
  - [ ] Create a lightweight `GameSystem` interface or base that new systems implement
  - [ ] Audit dispose paths — confirm no leaked meshes, observers, or event listeners on scene teardown

### Documentation & Repo Cleanup

- [ ] **Clean up root markdown files** — 19 `.md` files at root, most are completed plan artifacts
  - [ ] Keep: README.md, QUICKSTART.md, TODO.md
  - [ ] Move to `docs/`: AUDIO_SETUP_GUIDE.md, LADDER_SYSTEM_PLAN.md (has Phase 2 spec)
  - [ ] Delete the rest (13 files) — completed implementation summaries belong in git history, not root
- [ ] **Add ARCHITECTURE.md** documenting system boundaries, data flow, and extension patterns

---

## ✨ Polish Existing Systems

Finish what's already built. Each section groups the remaining work for a system that's partially implemented.

### Client Prediction *(almost done — needs validation)*

- [ ] **Validate at real latencies**
  - [ ] Test: no rubber-banding on building blocks at 50ms, 100ms, 200ms simulated latency
  - [ ] Document any remaining desync edge cases and file as bugs

### Building System *(functional — needs UX finalization)*

- [ ] **Finalize building UX**
  - [ ] Add "Finalize" input — locks building, returns 50% materials
  - [ ] Move demolish to right-click while in build mode
  - [ ] Greedy-mesh the grid on finalization for performance
  - [ ] Dispose temporary block meshes/colliders; generate single collider from greedy mesh
- [ ] **Building sounds**
  - [ ] Block placement sound
  - [ ] Block destruction sound
  - [ ] Building finalization sound

### Water System *(Phases 1–3 complete — needs visual/audio/combat polish)*

- [ ] **Visual effects**
  - [ ] Underwater post-process (blue tint, vignette, slight blur)
  - [ ] Splash particle effect on water entry/exit
  - [ ] Low-breath visual warning (screen darkening, panic vignette)
  - [ ] Underwater fog (reduce render distance, blue/green fog)
  - [ ] Bubble particle system when moving underwater
  - [ ] Caustics shader effect (light rays through water surface)
  - [ ] Water droplets on camera when exiting water
- [ ] **Audio**
  - [ ] Splash sound on water entry/exit (volume ∝ velocity)
  - [ ] Muffled audio when head submerged (low-pass filter on AudioManager)
  - [ ] Swimming movement sounds (gentle splashing)
  - [ ] Drowning audio cues (heartbeat at low breath, gasp on surfacing)
  - [ ] Ambient bubble sounds underwater
- [ ] **Combat rules**
  - [ ] Disable or heavily slow gun firing underwater
  - [ ] Disable building placement underwater
  - [ ] Fall damage negation when entering deep water (depth > 3)
  - [ ] Slow reload speed underwater
  - [ ] Dropped items float on water surface
- [ ] **Server sync hardening**
  - [ ] Broadcast water entry/exit state to other clients
  - [ ] Clear water state on respawn (full breath, exit water)
  - [ ] Handle teleport into water (instantly set water state)
  - [ ] Update water mask when blocks placed/removed underwater
- [ ] **Edge cases**
  - [ ] Test ladder climbing from water
  - [ ] Optimize water depth queries (cache per player per frame)
  - [ ] Surface swimming mode (head above water, faster, no breath drain)
  - [ ] Dive mechanic (crouch to submerge when at surface)

### Sound System *(foundation solid — gaps remain)*

- [ ] **Missing sound triggers**
  - [ ] `empty_click` sound when firing with 0 ammo
  - [ ] `item_pickup` / `item_drop` sounds from ItemSystem
  - [ ] UI interaction sounds (menu clicks, tab switch)
- [ ] **Ambient audio**
  - [ ] Wind / birds background layer (low-effort, high atmosphere payoff)

### Ladder System *(Phase 1 done — climbing not implemented)*

- [ ] **Ladder climbing (Phase 2)**
  - [ ] Add `isOnLadder` + `ladderDirection` to `CharacterState` in `shared/`
  - [ ] Detect ladder overlap in `stepCharacter` — enter climb state on contact
  - [ ] Vertical movement while on ladder (W/S up/down); strafe to dismount
  - [ ] Jump off ladder dismount with velocity push
  - [ ] Disable gravity while climbing
  - [ ] Sync climb state over network

### Hit Feedback *(nothing implemented — quick wins)*

- [ ] **Hit marker crosshair flash** on dealing damage
- [ ] **Screen-edge vignette flash** on taking damage
- [ ] **Directional damage indicator** (red arc pointing toward attacker)
- [ ] **Damage numbers** on hit (optional — style-dependent)

### Weapon Scopes & Zoom *(nothing implemented)*

- [ ] **Sniper scope crosshair overlay** — fade in scope reticle when zooming using FinalPostProcess
- [ ] **Assault rifle scope overlay** — secondary scope style for assault rifle zoom (different from sniper scope)

### Network Resilience

- [ ] **Reconnection handling** — verify game state resync on reconnect (room rejoin, full state snapshot)
- [ ] **Player disconnect cleanup** — confirm entities, projectiles, and building state are properly disposed
- [ ] **Server-side validation basics**
  - [ ] Rate-limit shoot requests per weapon fire rate
  - [ ] Position sanity checks (max speed + teleport detection)

---

## 🆕 New Features

New systems to add. Before starting any of these, make sure the systems they integrate with are in good shape (check Architecture and Polish sections first).

### Inventory & Equipment

- [ ] **Shared inventory model** — add in `shared/` (slots, no stacking, max capacity, item flags: `isEquippable`, `isPermanent`, `quickslotEligible`)
- [ ] **Server-authoritative inventory** — server owns inventory state, validates pickups, equips, drops; client is predictive UI only
- [ ] **Pickup flow** — collectables go into inventory if space; reject pickup when full; pickupable entities still drop in world
- [ ] **Permanent items** — items like hammer become permanent on pickup (still drop on death)
- [ ] **Quickslot rules** — 4 quickslots (1–4) for eligible items only; non-eligible items appear in inventory but cannot equip to slots
- [ ] **Active hands state** — left/right click use current equipped item; `X` puts everything away (no active item)
- [ ] **Build mode restore** — on exiting build mode, restore last equipped left/right item and active slot indicator
- [ ] **Inventory UI** — `I` opens inventory screen; drag/click to equip items to slots 1–4; auto-close on any movement or damage
- [ ] **HUD hotbar** — show 1–4 slots with item icon + ammo/count; highlight active slot
- [ ] **Input bindings** — 1–4 select slot; scroll wheel cycles; `Q` drops only the item in hands (for now)
- [ ] **Death drop** — on death, drop/spawn all inventory items into the world for others to pick up
- [ ] **Anti-dupe validation** — server validates item instance IDs for pickup/drop/equip, rejects invalid state transitions
- [ ] **Network protocol** — opcodes for inventory snapshot, equip/unequip, swap slots, drop, pickup result
- [ ] **System integration** — wire into WeaponSystem, BuildSystem, ItemSystem, and round respawn logic
> *Note: Depends on server ItemSystem extraction. Building finalization (material return) also needs this.*

### Crouching

- [ ] **Shared state** — add crouch to `CharacterInput` + `CharacterState`
- [ ] **Physics** — reduce capsule height, slow to 55% walk speed, ceiling check in `stepCharacter`
- [ ] **Visuals** — smooth camera height transition
- [ ] **Network** — crouch state included in transform sync

### Death Camera & Spectator

- [ ] **Kill cam** — camera snaps to killer for 2–3 seconds on death
- [ ] **Spectator mode** — cycle through alive players with left/right click when dead

### Visual Systems

- [ ] **Cloud shadow projection**
  - [ ] RTT from sun perspective capturing cloud positions
  - [ ] Screen-space shadow shader sampling cloud RTT
  - [ ] Blend with existing directional light shadows
- [ ] **Weather system (seed-based)**
  - [ ] Add weather types (rain, fog, snow) to SunConfig generation
  - [ ] Particle systems for rain/snow
  - [ ] Fog density adjustments per weather type
  - [ ] Network-sync weather state
- [ ] **Night time support**
  - [ ] Extend sun elevation below horizon; add moon light source
  - [ ] Night sky shader (stars, moon)
  - [ ] Day/night transition with twilight colors
  - [ ] Point lights / emissive materials for player-built structures at night
- [ ] **Art direction definition**
  - [ ] Choose cohesive visual style (low-poly, voxel-painterly, stylized-toon, etc.)
  - [ ] Create material/color palette guidelines
  - [ ] Apply across terrain, props, weapons, UI

### Scale & Content

- [ ] **Lobby item spawn configuration**
  - [ ] Config sliders for all weapon types (SMG, LMG, shotgun, AR, sniper, rocket)
  - [ ] Armor vest + helmet spawn config
  - [ ] Materials/resource pack config
  - [ ] Organized UI tabs/sections
- [ ] **Terrain ring system (bigger maps)**
  - [ ] Spawn ring of terrain chunks around center using same noise gen
  - [ ] Randomize tree/rock/item spawns on outer chunks
  - [ ] Extend player movement limits to cover full ring
  - [ ] Cross-chunk collision detection
- [ ] **Building save/load with URL hashes**
  - [ ] Serialize building state → server hash → URL
  - [ ] On page load with hash, restore building state
  - [ ] Server persistence for building designs

### Infrastructure

- [ ] **Performance profiling pass** — benchmark physics tick per entity, collision query time; targets: <2ms tick, <1ms collision
- [ ] **Mobile input completeness audit** — verify mobile players can build, use inventory, switch weapons

---

## Completed (reference only)

<details>
<summary>Click to expand completed work</summary>

- [x] Client prediction desync fix — BuildingCollisionManager, input queue, PvP auth, sprint field
- [x] Game mode / round system — FFA deathmatch, countdown, victory screen, scoreboard
- [x] Respawn system — instant respawn on death, EntityDeath opcode
- [x] Kill feed + scoreboard UI — KillFeed.vue, Scoreboard.vue, per-player stats
- [x] Victory screen / round end — VictoryScreen.vue, auto-transition
- [x] Water swimming Phase 1–3 — detection, swimming movement, breath/drowning, breath bar UI
- [x] Sound system foundation — spatial audio, footsteps, gunshots, remote sync, weapon-specific sounds
- [x] Building system — 4 modes, collision sync, hammer item, network opcodes
- [x] Ladder placement (Phase 1) — raycast validation, preview, network sync
- [x] Physics refactor — unified constants, CollisionWorld, BuildingCollisionManager
- [x] World singleton — wind, sun, time centralized
- [x] Player color sync — HSL generation, PlayerInfo protocol
- [x] Pre-lobby system — chat, seed config, room owner controls
- [x] Level route (direct-to-game) — /level with seed+room, Quick Play
- [x] Seed-based sun position — deterministic sun config from seed

</details>

---

**How to use this list:**
- **Three parallel tracks:** Architecture, Polish, and New Features can all be worked on — but architecture and polish take priority when they intersect with a feature area.
- **Before starting a new feature**, check if the system it touches has outstanding architecture or polish work. Do that first.
- **Small, clean PRs** over large multi-system changes. Leave the codebase better than you found it.
- **No deadlines, no gates.** Work on what's interesting or what unblocks the most future work. The architecture track is the force multiplier.
