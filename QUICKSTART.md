# Quickstart

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts the server on `http://localhost:3000` and the Vite dev client on `http://localhost:5173`. The client proxies `/ws` to the server automatically.

Open `http://localhost:5173` in your browser. To test multiplayer, open a second tab or window and join the same room.

## Controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Space | Jump |
| Shift | Sprint |
| Ctrl | Dive |
| LMB | Shoot |
| RMB | Zoom / ADS |
| R | Reload |
| F | Pick up item |
| Q | Drop item |
| 1-4 | Build modes (need hammer) |
| Tab | Scoreboard |
| H | Controls overlay |

## Production Build

```bash
npm run build
npm start
```

Or use `npm run prod` to build and start in one command. Set `PUBLIC_DIR=./client/dist` to serve the SPA from the server.

See [docs/DEPLOY.md](docs/DEPLOY.md) for full production deployment instructions including HTTPS, environment variables, and Docker.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP + WebSocket port |
| `PUBLIC_DIR` | (unset) | Path to built client dist (for single-process deploy) |
| `ALLOWED_ORIGINS` | (allow all) | Comma-separated allowed CORS origins for production |
| `MAX_CONNECTIONS` | `100` | Max concurrent WebSocket connections |
| `MAX_ROOMS` | `20` | Max concurrent rooms |
| `MAX_PLAYERS_PER_ROOM` | `8` | Max players per room |
| `VITE_WS_URL` | (same-origin) | Override WebSocket URL at client build time |
| `VITE_POSTHOG_KEY` | (unset) | PostHog analytics key |
| `VITE_SENTRY_DSN` | (unset) | Sentry client DSN |
| `SENTRY_DSN` | (unset) | Sentry server DSN |

Copy `.env.example` to `.env` and fill in the values.

## Audio

Sound effects are not included in the repository. Add `.mp3` files to `client/public/assets/sfx/` following the naming in `client/src/engine/audio/soundManifest.ts`. See `docs/AUDIO_SETUP_GUIDE.md` for details.

## Known Issues

See [README.md](README.md#known-issues).
