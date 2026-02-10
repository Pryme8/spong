# Quick Start Guide

Get Spong running in under 2 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

This installs all dependencies for the monorepo (client, server, and shared packages).

## Step 2: Build Shared Package

```bash
npm run build:shared
```

This compiles the shared TypeScript package used by both client and server.

## Step 3: Start the Server

Open a terminal and run:

```bash
npm run dev:server
```

The server will start on `http://localhost:3000`

You should see:
```
Server listening on 0.0.0.0:3000
```

## Step 4: Start the Client

Open a **second** terminal and run:

```bash
npm run dev:client
```

The client will start on `http://localhost:5173`

Vite will automatically open your browser.

## Step 5: Test It!

1. Your browser should open to `http://localhost:5173`
2. You'll see the **Nexus-themed** home screen
3. Enter a room name (default: "lobby") and click "Join Game"
4. You should see a **neon green wireframe cube** orbiting and spinning on a grid
5. Open another browser tab to `http://localhost:5173` and join the same room
6. You'll see multiple cubes (one per player)

## What You're Seeing

- **Server-Authoritative Movement**: The cube's position and rotation are calculated on the server (NullEngine)
- **Binary Transform Sync**: Position/rotation data is sent at 20Hz in a compact 33-byte binary format
- **LocalTransform System**: Each player has a LocalTransform that receives updates and a cube mesh parented to it

## Troubleshooting

**Server won't start?**
- Make sure port 3000 is available
- Check you ran `npm run build:shared` first

**Client won't connect?**
- Make sure the server is running
- Check browser console for WebSocket errors

**No cube visible?**
- Check browser console for errors
- Verify you clicked "Join Game"
- Check the server terminal for connection messages

## Next Steps

Explore the codebase:
- `server/src/engine/RemoteTransform.ts` - Server-side animation
- `client/src/engine/LocalTransform.ts` - Client-side transform
- `shared/src/protocol.ts` - Network protocol opcodes
- `shared/src/codec.ts` - Binary encoding/decoding

Have fun building your game! 🎮
