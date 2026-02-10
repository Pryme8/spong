export const config = {
  port: 3000,
  host: '0.0.0.0',
  tickRate: 60, // Server tick rate in Hz (matches FIXED_TIMESTEP)
  cors: {
    origin: true, // Allow all origins in development
    credentials: true
  }
};
