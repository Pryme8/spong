# Single-Docker deployment plan

One container runs the game server and serves the client. One port (3000). Suitable for Digital Ocean (or any host) running Docker.

## Goals

- **Single image**: build once, run one container.
- **Single port**: HTTP + WebSockets on one port (e.g. 3000). Client is served from `/`, WebSockets at `/ws`.
- **Production client**: uses same origin for WS (`wss://host/ws` or `ws://host:3000/ws`) so no CORS or port config in the browser.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │  Container (Node, single process)   │
                    │                                     │
  Browser           │  Fastify                            │
  GET /       ─────►│    ├─ GET /, /assets/*  → client    │
  GET /game   ─────►│    │   (static + SPA fallback)      │
  GET /health ─────►│    ├─ GET /health       → API       │
  WS  /ws     ─────►│    └─ GET /ws          → WebSocket  │
                    │                                     │
                    └─────────────────────────────────────┘
```

- **Build**: multi-stage Dockerfile builds `shared` → `client` (Vite) → `server` (tsc), then copies server runtime + `client/dist` into the final image.
- **Runtime**: Server starts with `PUBLIC_DIR=/app/client-dist`. If `PUBLIC_DIR` is set, Fastify serves that directory as static and SPA fallback; otherwise server-only (no static), so local dev is unchanged. The container runs the server with `tsx` so `@spong/shared` (TypeScript) resolves at runtime without a separate shared build step.

## Files to add/change

| Item | Purpose |
|------|--------|
| `Dockerfile` | Multi-stage build: deps → build shared/client/server → production image with node, server dist, client dist. |
| `.dockerignore` | Exclude node_modules, .git, client dist, dev files to keep image small and cache clean. |
| `docker-compose.yml` | Optional: run the image locally, map port 3000, set env. |
| `server/package.json` | Add `@fastify/static` dependency. |
| `server/src/config.ts` | Read `PUBLIC_DIR` from env; optional `publicDir` for static root. |
| `server/src/index.ts` | If `config.publicDir` set: register `@fastify/static`, then SPA catch-all for `index.html`. |

## Build order (inside Docker)

1. Install all workspace deps (root `npm install`).
2. Build shared: `npm run build:shared` (or `npm run build --workspace=shared`).
3. Build client: `npm run build:client` (depends on shared).
4. Build server: `npm run build:server` (depends on shared).
5. Production stage: copy `server/dist`, `server/package.json`, install prod deps only, copy `client/dist` → `/app/client-dist`, set `PUBLIC_DIR=/app/client-dist`, `CMD ["node", "dist/index.js"]` with `WORKDIR /app`.

## Client WebSocket URL in production

- Today: production uses `ws://${window.location.hostname}:3000/ws`.
- With single Docker, the app is served from the same host/port (e.g. `http://host:3000`), so we can use `${wsProtocol}//${window.location.host}/ws` in production as well (same as dev). One code path, works for both dev proxy and production same-origin.

## Optional: killPort in Docker

- `killPort()` in `server/src/index.ts` uses Windows commands (`netstat`, `taskkill`). In Linux containers it will throw and the catch block runs (no-op). No change required; consider making it a no-op when `process.platform !== 'win32'` later if you want to avoid log noise.

## How to run

- **Build**: `docker build -t spong .`
- **Run**: `docker run -p 3000:3000 spong`
- **Compose**: `docker compose up --build` (uses `docker-compose.yml` at repo root).

## Env (production)

| Variable | Default | Purpose |
|----------|---------|--------|
| `PORT` | 3000 | Server listen port (optional; config today is fixed 3000). |
| `PUBLIC_DIR` | (unset) | If set, Fastify serves this directory as static + SPA. Docker sets to `/app/client-dist`. |

## Checklist

- [x] Add `@fastify/static` to server and register static + SPA fallback when `PUBLIC_DIR` is set.
- [x] Add `Dockerfile` (multi-stage, node base).
- [x] Add `.dockerignore`.
- [x] Add `docker-compose.yml` (optional).
- [ ] Client: optionally switch production WS to same-origin (`window.location.host`) so it works without specifying port (if you later serve on 80/443 behind a proxy).
