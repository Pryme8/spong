# Spong

A real-time multiplayer FFA sandbox shooter built with Babylon.js on both client and server.

**Public Alpha** — playable but rough around the edges. [See known issues](#known-issues).

## What's in the Alpha

- **FFA Deathmatch** — first to 20 kills wins (5-minute time limit)
- **9 weapon types** — pistol, SMG, LMG, shotgun, double-barrel, sniper, assault rifle, DMR, rocket launcher
- **Building system** — place/transform/demolish blocks using the hammer item
- **Water & swimming** — dive, swim, breath meter, drowning
- **Lobby + Quick Play** — create a private room or jump straight in
- **Client prediction + lag compensation** — 60 Hz physics, adaptive interpolation, spawn-time rewind hits
- **Procedural levels** — seed-based terrain, trees, rocks, bushes, clouds

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client renderer | Babylon.js 8 + Vue 3 + Vite |
| Server | Node.js + Fastify + raw WebSocket (`ws`) |
| Server physics | Babylon NullEngine + Havok |
| Shared physics | TypeScript package — identical `stepCharacter` on client & server |
| Protocol | Binary high-freq opcodes (transforms, input, projectiles) + JSON low-freq |
| Netcode | 60 Hz physics, WS in Worker, adaptive interpolation, spawn-time lag comp |

## Getting Started

See [QUICKSTART.md](QUICKSTART.md) for setup instructions.

## Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) for production deployment (VM or Docker).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries and data flow.

## Known Issues

- Audio is silent until SFX assets are added to `client/public/assets/sfx/` (see `docs/AUDIO_SETUP_GUIDE.md`)
- Ladder placement works; climbing not yet implemented
- Building finalize UX incomplete (no material return, no greedy mesh)
- Water system visuals/audio incomplete (phases 1–3 functional)
- Mobile controls exist but are not fully wired — desktop recommended
- Reconnect restores the socket but does not resync game state

## Roadmap (post-alpha)

Inventory/equipment system, ladder climbing, spectator/kill cam, larger multi-tile worlds, building finalization, weather and day-night cycle, weapon scopes.

---

> This is a research and passion project. Stability and feature completeness are works in progress.
