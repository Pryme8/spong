# Spong - Multiplayer Game Foundation

A real-time multiplayer game built with Vue 3, Vuetify, Babylon.js, and Fastify.

## Architecture

### **Nexus Theme**
Deep indigo/purple aesthetic with neon green accents and cyan highlights. Digital matrix vibe.

### **Tech Stack**
- **Frontend**: Vue 3, Vuetify, Vite, TypeScript, Babylon.js
- **Backend**: Fastify, raw WebSocket (ws), Babylon.js NullEngine, TypeScript
- **Protocol**: Binary transform updates at 20Hz, JSON messages for room management

### **Key Features**
- High-frequency binary protocol for transform sync (33 bytes/entity/tick)
- Low-frequency JSON protocol for room management
- Server-authoritative transform system
- Room-based multiplayer with NullEngine physics on server

## Project Structure

```
spong/
├── client/         # Vue 3 + Vuetify + Babylon.js frontend
├── server/         # Fastify + WebSocket + NullEngine backend
├── shared/         # Shared protocol types and binary codec
└── package.json    # Workspace root
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Install all dependencies (root + workspaces)
npm install

# Build shared package (required before running client/server)
npm run build:shared
```

### Running the Project

**Option 1: Run both client and server simultaneously**

Open two terminal windows:

```bash
# Terminal 1: Start the server
npm run dev:server

# Terminal 2: Start the client
npm run dev:client
```

**Option 2: Manual workspace commands**

```bash
# Server (runs on http://localhost:3000)
npm run dev --workspace=server

# Client (runs on http://localhost:5173)
npm run dev --workspace=client
```

### Usage

1. Open your browser to `http://localhost:5173`
2. Enter a room ID (default: "lobby")
3. Click "Join Game"
4. You should see a neon green wireframe cube orbiting and rotating on a grid
5. Open another browser tab/window and join the same room to see multiple cubes

## How It Works

### Networking Protocol

**Single WebSocket connection per client** with opcode-prefixed messages:

- **High-Frequency (Binary)**: Transform updates at 20 ticks/sec
  - Format: `[opcode:1][entityId:4][pos:12][rot:16]` = 33 bytes
  
- **Low-Frequency (JSON)**: Room join/leave, player events
  - Format: `[opcode:1][JSON payload]`

### Transform Sync

1. **Server**: Each player gets a `RemoteTransform` (TransformNode in NullEngine)
2. **Server**: Room ticks at 20Hz, animates RemoteTransforms, broadcasts binary updates
3. **Client**: Creates `LocalTransform` for each entity
4. **Client**: Applies incoming transform updates to LocalTransform
5. **Visual**: Cube mesh is parented to LocalTransform, inherits all movement

## Development

### Building for Production

```bash
npm run build
```

This builds:
1. Shared package (transpiled TypeScript)
2. Client (optimized Vite bundle)
3. Server (transpiled TypeScript)

### Workspace Scripts

```bash
npm run dev:client       # Start client dev server
npm run dev:server       # Start server dev server
npm run build:client     # Build client for production
npm run build:server     # Build server for production
npm run build:shared     # Build shared package
npm run build            # Build all packages
```

## Next Steps

Current implementation provides the foundation:
- ✅ Networking layer with binary + JSON protocols
- ✅ Room system with server-authoritative transforms
- ✅ Visual proof (synced cube)

Future enhancements:
- Player input handling
- Interpolation/prediction for smoother movement
- Game mechanics (collision, scoring, etc.)
- User authentication
- Persistent game state

## License

MIT
