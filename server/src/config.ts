const publicDir = process.env.PUBLIC_DIR ?? '';
const port = process.env.PORT != null ? Number(process.env.PORT) : 3000;

export const config = {
  port,
  host: '0.0.0.0',
  tickRate: 60, // Server tick rate in Hz (matches FIXED_TIMESTEP)
  /** When set (e.g. in Docker), serve client static from this path and SPA fallback */
  publicDir: publicDir || undefined,
  cors: {
    origin: true, // Allow all origins in development
    credentials: true
  }
};
