const publicDir = process.env.PUBLIC_DIR ?? '';
const port = process.env.PORT != null ? Number(process.env.PORT) : 3000;

// In production set ALLOWED_ORIGINS to a comma-separated list of allowed origins,
// e.g. "https://spong.game,https://www.spong.game".
// Leave unset (or set to "*") to allow all origins (dev / local Docker).
const allowedOrigins: string | string[] | true =
  process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS !== '*'
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : true;

export const config = {
  port,
  host: '0.0.0.0',
  tickRate: 60, // Server tick rate in Hz (matches FIXED_TIMESTEP)
  /** When set (e.g. in Docker), serve client static from this path and SPA fallback */
  publicDir: publicDir || undefined,
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  limits: {
    /** Hard cap on simultaneous WebSocket connections. */
    maxConnections: process.env.MAX_CONNECTIONS != null ? Number(process.env.MAX_CONNECTIONS) : 100,
    /** Maximum number of concurrent rooms. */
    maxRooms: process.env.MAX_ROOMS != null ? Number(process.env.MAX_ROOMS) : 20,
    /** Maximum players allowed in a single room. */
    maxPlayersPerRoom: process.env.MAX_PLAYERS_PER_ROOM != null ? Number(process.env.MAX_PLAYERS_PER_ROOM) : 8,
    /** Dispose empty non-active rooms after this many ms. */
    emptyRoomTtlMs: 5 * 60 * 1000,
    /** Dispose active (playing) rooms with no players after this many ms. */
    activeRoomTtlMs: 30 * 60 * 1000,
    /** Rolling window (ms) for per-connection WS message rate limiting. */
    wsRateLimitWindowMs: 1000,
    /** Max messages per connection per window before the connection is throttled. */
    wsRateLimitMax: 200,
    /** Max length of a single chat message (characters). */
    chatMaxLength: 256,
    /** Minimum ms between chat messages from the same connection. */
    chatRateLimitMs: 750,
  }
};
