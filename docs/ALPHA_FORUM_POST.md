# Babylon.js Forum Post — Public Alpha Announcement
# Posted as: Pryme8
# Forum: forum.babylonjs.com
# Category: Projects / Show & Tell
#
# Copy everything below the horizontal rule into the forum editor.
# Replace [PLAYTEST URL] with the actual deployment URL before posting.
# Replace [FEEDBACK FORM URL] with your Google Form / Typeform URL.
---

## Spong — public alpha playtest | server-authoritative multiplayer + procedural world with Babylon.js

Hey BJS community,

I've been heads-down on a multiplayer sandbox shooter that uses Babylon.js on **both the client and the server**, and I've finally got it to a state where strangers can stress-test it. Posting here because the interesting part, at least for this crowd, isn't the game — it's the engine architecture underneath, specifically the procgen pipeline and the netcode.

**Play it now → [PLAYTEST URL]**
*(Desktop, WebGL2, pointer-lock required. Mobile partially wired but not recommended for alpha.)*

---

### What you're actually playing

FFA deathmatch in a seed-based procedural level. First to 20 kills (or 5-minute timer). 9 weapon types from pistol to rocket. A building system with a hammer item. Swimming with a breath meter. Kill feed, scoreboard, lobby or quick-play.

It's rough around the edges — audio requires assets not in the repo, ladder climbing is placement-only, and the building UX still needs finalization. But the core multiplayer loop works and I want real latency numbers and world-rendering feedback from real players.

---

### Procedural world generation

The whole game world is seed-based — terrain, trees, rocks, bushes, and clouds all regenerate from the room seed. Every system generates in a shared TypeScript package so the server can validate collision without running any rendering code.

#### Terrain — voxel grid + multi-layer terrace noise + greedy meshing

The terrain is a **100×100×100 voxel grid** (2.0×0.5×2.0 world units per voxel — half-height cubes, so the world footprint is 200×200×50 units). Height is generated with:

1. **FBM value noise** (Perlin-style with seeded permutation via Fisher-Yates + Mulberry32 RNG, 3 octaves)
2. **Two-layer terracing** — three noise channels mask between smooth and stepped height (6-step primary, 3-step secondary, blended by a third noise channel), which gives the "mesa plateau" look without obvious tiling
3. Final column height capped to ~60% of max height

```typescript
// VoxelGrid.ts — blend mask controls how much terracing is applied per column
const blendMask = blendNoise.fbm(nx, nz);
const smoothH = baseNoise.fbm(nx, nz);
const terraceH = applyTerrace(smoothH, 6, mask1Noise.fbm(nx, nz));
finalHeight = lerp(smoothH, terraceH, blendMask);
```

The mesh is built with a **greedy mesher** (based on Mikola Lysenko's algorithm) then rendered as a Babylon `CustomMaterial` tri-planar shader — grass on top, dirt on sides, darker bottom layer, with per-face hash noise variation to break up repetition.

The multi-tile 3×3 world expansion (600×600 units) is implemented in the shared `MultiTileVoxelGrid` class and is next after alpha.

#### Trees — stochastic L-system + turtle interpreter

Each tree is generated from a **stochastic L-system** with a 3D turtle interpreter. The grammar includes trunk/branch/root/leaf symbols with yaw/pitch rotations, stack push/pop, diameter taper (`!`), branch gravity droop (`G`), and leaf cluster placement (`L`).

Two L-system iterations expand into a full tree. Branch probabilities are seeded — so the same seed always produces the same tree, but no two seeds look the same. 10% of trees are leafless (deterministic from the seed hash). Wood and leaves are voxelized into a **50×80×50 voxel grid** (0.5 unit voxels) with `fillCylinder` for trunks/branches and overlapping ellipsoid blobs for leaf canopies.

```
Grammar example expansion:
T(s) → T(s*0.9) [ +(30) F ] [ -(20) ^(15) F ] T(s*0.8) ...
L → leaf cluster at current turtle position
```

The mesh pipeline goes: voxel grid → `TreeGreedyMesher` (material-aware, splits wood/leaf) → two Babylon meshes at 0.4× scale. Wood also passes through a `TreeMeshDecimator` (vertex clustering at resolution 32) to generate the server-side collision mesh. 540 instances of 8 variations are placed per level.

#### Rocks — density sphere + plane-clip + noise distortion

The rock generator is probably my favorite piece because it produces shapes that actually look geological:

1. Fill a voxel sphere at grid center
2. Apply **6–12 random plane cuts** (unit-sphere normals, random inset depth) — the intersected planes carve off chunks
3. Distort the density field with **3-channel noise** (trilinear resample, frequency 0.15, amplitude 0.5–1.5) to get irregular surfaces
4. Threshold + remove isolated voxels (<2 solid 6-face neighbors) for cleanup

```typescript
// generateRock.ts — plane clipping pass
for (const plane of clipPlanes) {
  const dot = nx * plane.nx + ny * plane.ny + nz * plane.nz;
  if (dot < plane.d) density[idx] -= 2.0;
}
```

Three size configs pick grid dimensions (12/16/20 voxels) and clip counts at generation time. Collision uses `RockMeshDecimator` at resolution 9 for the triangle mesh collider. 900 instances of 5 variations, scales 0.3–0.8×.

#### Bushes — overlapping density spheres

Bushes use overlapping density spheres (3–6 per bush, radius 2–4, each must connect to the prior) on a 16×12×16 grid. The density field is blurred with a 3×3×3 box blur (2 passes) then thresholded at 0.15. A floor cutoff removes the bottom voxels so bushes sit cleanly on terrain. Greedy meshed, rendered at 0.25×. 720 instances of 8 variations.

#### Clouds — voxel mesh + multi-pass post-process composite

Clouds are the most visually complex system. The generator fills a **68×30×68 voxel grid** with overlapping spheres (8–30, radius 5–11), then runs a **bottom inflation pass** (5 passes, density leaks downward/outward but not up into the cloud body) to create the flat-bottomed cumulus silhouette. After blurring and thresholding, greedy meshed.

The rendering stacks two layers:

1. **Thin instances** — 120–300 cloud meshes per variation, altitude 80–160, spawn radius ±1200 units, non-uniform scale with a flattened Y (0.5–1.0×) to keep them wide and low
2. **`CloudPostProcess`** — Babylon RTT pipeline:
   - **Mask RTT**: scene geometry rendered black on white, captures what's in front of the sky
   - **Cloud RTT**: cloud meshes rendered with transparent clear + 128px overscan border
   - **Composite shader**: 6-ring diagonal blur + time-based turbulence wind drift, sky-mask alpha compositing

```glsl
// cloudComposite.fragment — simplified wind drift
vec2 windUV = uv + vec2(uTime * windStrength, 0.0) * turbulence(uv);
float cloudAlpha = texture2D(cloudSampler, windUV).a * 0.5;
gl_FragColor = mix(sceneColor, cloudColor, cloudAlpha * (1.0 - maskSample));
```

Clouds are client-only — not network synced, not pickable (no raycast collision). There's a known hole/masking issue where geometry occlusion isn't fully correct in some camera angles; if anyone has experience with Babylon RTT mask passes I'd genuinely love input.

---

### Dev/testing routes (dev builds only)

These exist to iterate on the procgen systems in isolation. They're behind `import.meta.env.DEV` and not accessible in production builds — but I'll describe them because they might be useful patterns for other BJS devs building procedural content.

#### `/shootingRange` — weapon testing sandbox

Flat terrain, full weapon spawn (all 9 types + armor/consumables), 3 shooting dummies at 20/35/50 meters. Intended for tuning weapon bloom, recoil curves, and projectile physics without needing other players. The `WeaponDebugPanel` (U key, dev only) lets you adjust weapon hold position/rotation live. Also where I test the `LatencyDebugPanel` with `?latency=N` URL flag for simulating network conditions.

#### `/builder` — building system sandbox

Flat terrain, hammer pre-spawned, one tree and one rock seeded from the room ID. Tests the full build mode cycle (place, transform, demolish) without the noise of an active FFA match. Also where I verify `BuildingCollisionManager` client-side sync.

#### `/tree/`, `/rock/`, `/bush/`, `/cloud/` — procgen editors

Each editor is a standalone live tweak environment for its generator:

**Tree editor (`/tree/`)** — ~20 sliders covering trunk segments, branch probabilities, gravity droop, leaf radius/count. Updates the L-system output live. Separate toggles for trunk, branches, roots, leaves, ground plane, wood collider wireframe (resolution-adjustable), and leaf collider wireframe. The turtle path itself can be rendered as a debug wireframe. Seed in URL query (`?seed=`).

**Rock editor (`/rock/`)** — toggle full mesh vs decimated collider mesh. Collider resolution slider. Legacy AABB octree collider visualization with adjustable `maxDepth` and `fillThreshold` sliders — useful for comparing octree vs triangle mesh approaches.

**Bush editor (`/bush/`)** — collider mesh debug, bounding box, trigger mesh visualization. Also shows the leaf texture pairs I have pending for the bush material system.

**Cloud editor (`/cloud/`)** — the only editor that doesn't use the game session (standalone `ArcRotateCamera` scene, no FPS controls). Regenerates the full cloud mesh + runs the `CloudPostProcess` pipeline. Press I for the Babylon inspector. Good for tuning the blur kernel and wind drift without compile cycles.

---

### Netcode — why this might interest BJS engineers

#### Server physics with NullEngine + Havok

The server runs `NullEngine` + `@babylonjs/havok` inside a Node.js process (Fastify + raw `ws`). No rendering, no display — just the physics runtime.

```typescript
const engine = new NullEngine({ renderWidth: 1, renderHeight: 1 });
const scene = new Scene(engine);
await initializeHavok(scene);
```

Server ticks at **60 Hz** using a real-time accumulator (not `setInterval(16.67)` — on Windows that throttles to ~42 Hz, which I found out the hard way).

#### Shared physics — one path, two runtimes

The client and server import the same `stepCharacter` function from the shared package. Same constants, same collision resolution order.

```typescript
// @spong/shared — runs identically on client AND server
export function stepCharacter(
  state: CharacterState,
  input: CharacterInput,
  dt: number,
  voxelGrid: TerrainCollisionGrid,
  treeColliders: LeafCollider[],
  rockColliders: MeshCollider[],
  buildingColliders: BlockCollider[]
): void { ... }
```

Reconciliation error is typically under 0.05 units at 100ms simulated RTT.

#### Client prediction + reconciliation

- Client sends `PlayerInput` (binary, 60/s) with monotonic `sequence`
- Server echoes `lastProcessedInput` in every `TransformUpdate`
- Client prunes acknowledged inputs, snaps to server state, replays remaining inputs
- Error absorbed into a visual offset (lerp to zero over ~8 frames)

```typescript
// LocalTransform.ts
const predError = snapped.distanceTo(replayed);
if (predError > CORRECTION_THRESHOLD) {
  this.smoothingOffset.copyFrom(snapped).subtractInPlace(replayed);
}
```

#### WebSocket in a Worker

The socket lives in a `Worker` so message arrival timestamps are never delayed by a busy render frame:

```typescript
ws.onmessage = (event) => {
  ctx.postMessage({ type: 'msg', data: event.data, recvTime: Date.now() }, [event.data]);
};
```

#### TCP_NODELAY

```typescript
const rawSocket = (ws as any)._socket;
rawSocket?.setNoDelay?.(true);
```

Idle RTT dropped from ~80ms to ~12ms after enabling this. Nagle + delayed-ACK on small per-tick packets is brutal.

#### Lag compensation

Spawn-time rewind using a ring buffer of recent player transforms. Targets evaluated at `serverShotTime - interpDelay`:

```typescript
const targetAtFireTime = playerHistory.get(targetId, serverShotTimeMs - LagCompInterpMs);
if (projectile.aabb.intersectsAABB(targetAtFireTime.aabb)) { ... }
```

#### Adaptive remote interpolation

Interpolation window adapts to measured jitter via EWMA, clamped 33–150ms:

```typescript
const newWindow = snapshotGap + jitter;
this.interpDuration = clamp(lerp(this.interpDuration, newWindow, 0.05), 33, 150);
```

---

### Protocol

High-frequency messages (transforms, input, projectiles) are binary with a 1-byte opcode prefix. Low-frequency messages (room join, items, building, rounds) are JSON with the same opcode prefix. High-freq is processed via a deferred queue drained by the game loop to avoid `[Violation] 'message' handler took Nms`.

---

### Roadmap (not in this alpha)

- **Full inventory + equipment model** — server-authoritative slots, quickslots, drag/drop UI
- **9-tile terrain ring** — 3×3 grid (~600×600 units), `MultiTileVoxelGrid` already implemented in shared; water planes and physics integration are next
- **Building finalization** — greedy-mesh the grid on finalize, generate single collider, 50% material return
- **Ladder climbing** — Phase 1 placement is in; Phase 2 (climb state, gravity disable, sync) is next
- **Spectator + kill cam**
- **Weather and day-night** — seed-based rain/fog/snow, moon, twilight shader
- **Cloud masking fix** — the RTT mask pass has known holes; proper sky geometry occlusion

---

### Things I'd love feedback on

1. **Movement feel at your latency** — I'm US-West; east coast / EU players are the interesting test for the prediction
2. **Hit registration** — consistent, or does it feel like shots miss when they shouldn't?
3. **Cloud rendering** — if you've done multi-pass RTT compositing in Babylon 8, I'd love to compare notes on the mask pass
4. **Building UX** — does the place/select/transform flow make sense without a tutorial?
5. **Water visuals** — the surface is basic. Anyone done Babylon water shaders they're happy with?
6. **Procgen feedback** — do the terrain terraces look interesting or artificial? Rock variety? Tree silhouettes?

Also happy to dig into any of the netcode, NullEngine-on-server, or procgen pipeline details. There's not much prior art in the BJS ecosystem for the server-side NullEngine setup specifically, so if anyone has done something similar I'd like to compare notes.

**Play → [PLAYTEST URL]**
**Feedback → [FEEDBACK FORM URL]**
**Known issues / bugs → reply in thread**

— Pryme8
