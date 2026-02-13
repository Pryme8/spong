# Footstep Sound System Refactor Plan

## Current Problems

- **Looping design**: One `footstep_running` loop per player; start/update/stop every frame. Easy to get multiple instances or state desync.
- **Remote driven by TransformUpdate**: Every high-frequency transform (~30 Hz) calls `FootstepManager.updatePlayer()` for each remote player, constantly starting/updating/stopping loops from velocity. Jitter or duplicate handling causes overlapping loops (“cascade”).
- **No discrete steps**: Continuous loop + volume/rate makes “one step = one sound” impossible to sync; hard to reason about and debug.

## Target Design

- **One-shot step cache**: Several distinct one-shot samples (e.g. `footstep_a`, `footstep_b`, `footstep_c`, `footstep_d`). Each step plays one at a time, no loops.
- **Step timer (rate from speed)**: Local player uses a timer: when it fires, play one random variant at volume derived from speed, then reset timer based on speed (walk = slower interval, run = faster).
- **Local play**: Non-3D, immediate, so the local player always hears their own steps clearly.
- **Networked play**: Client sends one “footstep” event per step; server relays to other clients; they play the same variant at the same volume with **3D spatialization** so you can hear where others are.

Result: predictable “one step = one sound” per client, no looping, no cascade, better positional awareness for other players.

---

## 1. Assets & manifest

- **Assets**: Add 4 one-shot footstep files (e.g. `footstep_a.wav` … `footstep_d.wav`) under `client/public/assets/sfx/` (or reuse/slice from existing if you prefer).
- **Manifest** (`client/src/engine/audio/soundManifest.ts`):
  - Add entries for `footstep_a`, `footstep_b`, `footstep_c`, `footstep_d` (or a single `footstep` with multiple buffers if your loader supports variants).
  - Use `spatial: true`, `maxInstances` high enough for many overlapping steps (e.g. 16–24).
  - Remove or repurpose `footstep_running` (and optionally old `footstep`) so the new system is the only one in use.

---

## 2. Protocol (shared)

**Client → Server (one message per step)**

- New opcode, e.g. `FootstepEvent = 0x3F` (pick next free in your low-freq range).
- Payload: `FootstepEventMessage`:
  - `variant: number` (0–3 for a/b/c/d)
  - `posX, posY, posZ: number`
  - `volume: number` (0–1, so remote clients use same loudness)

**Server → Clients (relay to others)**

- New opcode, e.g. `FootstepSound = 0x40`.
- Payload: `FootstepSoundMessage`:
  - `entityId: number`
  - `variant: number`
  - `posX, posY, posZ: number`
  - `volume: number`
  - `excludeSender?: boolean` (if true, sender does not play the spatial version; they already played locally)

Define these in `shared/src/protocol.ts` and use the same pattern as `ReloadStarted` / `ItemDropSound`.

---

## 3. Server: relay only

- **Handler**: When the server receives `FootstepEvent` from a client, resolve that connection’s `entityId`, then `broadcast(Opcode.FootstepSound, { entityId, variant, posX, posY, posZ, volume, excludeSender: true })`.
- **No gameplay logic**: Server does not validate movement/ground; it only relays. Optional later: rate-limit per entity (e.g. max N events per second) to avoid abuse.
- **Where**: Add a small handler in the same place you handle other client-triggered audio (e.g. near where you’d handle reload/drop), or a dedicated “audio relay” module if you prefer.

---

## 4. Client: FootstepManager refactor

Replace the current loop-based logic with step-based logic.

**State per (local) player:**

- `stepTimer: number` — time until next step (seconds).
- Optionally track “last step time” if you prefer time-based instead of countdown.

**Constants (tune to taste):**

- Step interval range: e.g. `MIN_INTERVAL = 0.45` (run), `MAX_INTERVAL = 0.65` (walk), interpolated by speed.
- Speed threshold: only trigger steps when horizontal speed > some value (e.g. `MOVEMENT_THRESHOLD = 0.8`) and `isGrounded && !isInWater`.
- Volume: same curve as today (e.g. `MIN_VOLUME` / `MAX_VOLUME` from speed).

**Local player (every frame or fixed tick):**

1. If `!shouldPlayFootsteps` (not moving / not grounded / in water): reset `stepTimer`, do nothing.
2. Else: decrement `stepTimer` by deltaTime.
3. When `stepTimer <= 0`:
   - Pick random variant (0–3).
   - Play that variant **non-3D** at computed volume (no `position` in `play()`).
   - Send `FootstepEvent` to server with `variant`, current position, `volume`.
   - Reset `stepTimer` to next interval (from current speed).

**Remote players:**

- Do **not** call `FootstepManager.updatePlayer()` for remote entities anymore. Remove that path entirely.
- Remote footsteps are played only when receiving `FootstepSound` (see below).

**Cleanup:**

- Remove all logic that starts/updates/stops a looping `footstep_running` instance.
- Remove `soundInstanceId` / `lastSpeed` / `stoppedFrames` from state if unused; keep only what’s needed for the local step timer (and any per-remote state if you add it later).

---

## 5. Client: network handler for remote footsteps

- Register `networkClient.onLowFrequency(Opcode.FootstepSound, (payload) => { ... })`.
- If `payload.excludeSender && payload.entityId === myEntityId`: skip (we already played locally).
- Else if `payload.entityId !== myEntityId`: play the variant as **3D** at `(payload.posX, payload.posY, payload.posZ)` with `payload.volume` (and optional refDistance/maxDistance if you want consistency with other SFX).

Map `variant` 0–3 to `footstep_a` … `footstep_d` and call `AudioManager.play(soundName, { position: {...}, volume })` once per event. No loops, no per-entity state for remote footsteps.

---

## 6. Integration points (useGameSession)

- **Local footsteps**: Keep calling a single method on `FootstepManager` from the same place you do now (e.g. from the fixed or variable tick where you have `myTransform.value` and movement state). That method will only advance the step timer and, when it fires, play local + send `FootstepEvent`. No more `updatePlayer(..., true)` for local with loop.
- **Remote footsteps**: Remove the block that calls `footstepManager.updatePlayer(...)` inside `onHighFrequency(Opcode.TransformUpdate, ...)`. Replace with nothing (remote steps come only from `FootstepSound`).
- **Leave/dispose**: Keep `removePlayer` / `dispose` for the local player’s step state; no need to track remote players in FootstepManager.

---

## 7. Optional improvements

- **Rate limit (server)**: Cap footstep events per entity per second (e.g. 4–5) to avoid spam.
- **Surface type**: Later you could add a “surface” or “material” field (grass, wood, metal) and different sample sets; for this refactor, one set (a/b/c/d) is enough.
- **Water**: Keep “no footsteps in water”; optionally add a separate water splash/step sound later.

---

## 8. Summary checklist

| Area              | Action |
|-------------------|--------|
| Assets            | Add `footstep_a` … `footstep_d` (or equivalent); manifest entries; remove/deprecate `footstep_running` for this system. |
| Protocol          | Add `FootstepEvent` (client→server), `FootstepSound` (server→clients) and message types. |
| Server            | On `FootstepEvent`, broadcast `FootstepSound` with `entityId`, `excludeSender: true`. |
| FootstepManager   | Refactor to step timer + one-shots; local only plays non-3D and sends event; remove loop and remote `updatePlayer` path. |
| useGameSession    | Stop calling `footstepManager.updatePlayer` for remote players on TransformUpdate; add `onLowFrequency(FootstepSound)` to play 3D step for others. |
| Network send      | From client, send `FootstepEvent` when local step fires (variant, pos, volume). |

This gives you a cache of one-shot steps, rate and volume from speed, local non-3D playback, and networked spatialized playback for other players without any looping or cascade.
