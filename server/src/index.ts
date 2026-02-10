import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { websocketPlugin } from './plugins/websocket.js';
import { RoomManager } from './rooms/RoomManager.js';
import { initializeHavok } from './engine/setupNullEngine.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Kill any process using our port (for hot reload cleanup)
async function killPort(port: number): Promise<void> {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.split('\n');
    const pids = new Set<string>();
    
    for (const line of lines) {
      const match = line.match(/\s+(\d+)\s*$/);
      if (match) {
        pids.add(match[1]);
      }
    }
    
    for (const pid of pids) {
      try {
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`Killed process ${pid} on port ${port}`);
      } catch {
        // Process might already be dead
      }
    }
    
    if (pids.size > 0) {
      // Wait a bit for ports to be released
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch {
    // No process found on port, continue
  }
}

const fastify = Fastify({
  logger: {
    level: 'info'
  }
});

// Initialize Havok physics
console.log('Initializing Havok physics...');
await initializeHavok();
console.log('Havok physics initialized');

// Register plugins
await fastify.register(cors, config.cors);
await fastify.register(websocket);
await fastify.register(websocketPlugin);

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: Date.now() };
});

// Initialize room manager after plugins are ready
await fastify.ready();
const roomManager = new RoomManager(fastify.connectionHandler, config.tickRate);

// Clean up port before starting (helps with hot reload)
console.log(`Checking port ${config.port}...`);
await killPort(config.port);

// Wait a bit longer to ensure port is fully released
await new Promise(resolve => setTimeout(resolve, 500));

// Cleanup function for graceful shutdown
async function cleanup(signal: string) {
  console.log(`\nReceived ${signal}, shutting down server...`);
  
  // Set a very short timeout for hot reload scenarios
  const forceExitTimeout = setTimeout(() => {
    console.log('Force exiting for hot reload...');
    process.exit(0); // Exit 0 for hot reload, not an error
  }, 500); // Very short timeout for fast hot reload
  
  try {
    // Close Fastify server first (releases port immediately)
    await fastify.close();
    console.log('Server closed');
    
    // Dispose room manager quickly (don't wait for everything)
    setImmediate(() => {
      try {
        roomManager.dispose();
      } catch (err) {
        // Ignore errors during hot reload cleanup
      }
    });
    
    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    clearTimeout(forceExitTimeout);
    process.exit(0); // Still exit cleanly for hot reload
  }
}

// Handle shutdown signals (SIGINT = Ctrl+C, SIGTERM = tsx watch hot reload)
// Use 'on' instead of 'once' to handle multiple hot reloads
let isShuttingDown = false;
process.on('SIGINT', () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    cleanup('SIGINT');
  }
});
process.on('SIGTERM', () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    cleanup('SIGTERM');
  }
});
process.on('SIGHUP', () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    cleanup('SIGHUP');
  }
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup('unhandledRejection');
});

// Start server with retry logic for hot reload
async function startServer(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fastify.listen({ port: config.port, host: config.host });
      console.log(`Server listening on ${config.host}:${config.port}`);
      return;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
        console.log(`Port ${config.port} in use, killing processes and retrying (attempt ${attempt}/${maxRetries})...`);
        await killPort(config.port);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        fastify.log.error(err);
        process.exit(1);
      }
    }
  }
}

await startServer();
