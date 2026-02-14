import { Room } from './Room.js';
import { ConnectionState, ConnectionHandler } from '../network/ConnectionHandler.js';
import { 
  Opcode, 
  RoomJoinMessage, 
  RoomLeaveMessage, 
  RoomStateMessage, 
  PlayerJoinedMessage, 
  PlayerLeftMessage,
  BlockPlaceMessage,
  BlockRemoveMessage,
  BuildingCreateMessage,
  BuildingTransformMessage,
  BuildingDestroyMessage,
  LadderPlaceMessage,
  LadderDestroyMessage,
  ChatMessagePayload,
  ChatBroadcastPayload,
  LobbyConfigPayload,
  LobbyConfigUpdatePayload,
  LobbyStartMessage,
  decodeInput,
  decodeShoot,
  encodeProjectileSpawn,
  encodeProjectileSpawnBatch
} from '@spong/shared';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private connectionHandler: ConnectionHandler;

  constructor(connectionHandler: ConnectionHandler, _tickRate: number = 20) {
    this.connectionHandler = connectionHandler;

    // Register message handlers
    this.connectionHandler.registerMessageHandler(Opcode.RoomJoin, (conn, data) => {
      this.handleRoomJoin(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.RoomLeave, (conn, data) => {
      this.handleRoomLeave(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.ReloadRequest, (conn, _data) => {
      this.handleReloadRequest(conn, _data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.ItemDrop, (conn, _data) => {
      this.handleItemDrop(conn, _data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.ItemPickupRequest, (conn, data) => {
      this.handleItemPickupRequest(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.ItemTossLand, (conn, data) => {
      this.handleItemTossLand(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.FootstepEvent, (conn, data) => {
      this.handleFootstepEvent(conn, data);
    });
    
    // Register binary handlers
    this.connectionHandler.registerBinaryHandler(Opcode.PlayerInput, (conn, buffer) => {
      this.handlePlayerInput(conn, buffer);
    });

    this.connectionHandler.registerBinaryHandler(Opcode.ShootRequest, (conn, buffer) => {
      this.handleShootRequest(conn, buffer);
    });

    // Building system handlers
    this.connectionHandler.registerMessageHandler(Opcode.BuildingCreate, (conn, data) => {
      this.handleBuildingCreate(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.BlockPlace, (conn, data) => {
      this.handleBlockPlace(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.BlockRemove, (conn, data) => {
      this.handleBlockRemove(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.BuildingTransform, (conn, data) => {
      this.handleBuildingTransform(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.BuildingDestroy, (conn, data) => {
      this.handleBuildingDestroy(conn, data);
    });

    // Ladder system handlers
    this.connectionHandler.registerMessageHandler(Opcode.LadderPlace, (conn, data) => {
      this.handleLadderPlace(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.LadderDestroy, (conn, data) => {
      this.handleLadderDestroy(conn, data);
    });

    // Lobby system handlers
    this.connectionHandler.registerMessageHandler(Opcode.ChatMessage, (conn, data) => {
      this.handleChatMessage(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.LobbyConfig, (conn, data) => {
      this.handleLobbyConfig(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.LobbyStart, (conn, data) => {
      this.handleLobbyStart(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.LobbyStartCancel, (conn, data) => {
      this.handleLobbyStartCancel(conn, data);
    });

    this.connectionHandler.registerMessageHandler(Opcode.ClientReady, (conn, data) => {
      this.handleClientReady(conn, data);
    });

    // Register disconnect handler
    this.connectionHandler.registerDisconnectHandler((conn) => {
      this.handleDisconnect(conn);
    });
  }

  private async handleRoomJoin(conn: ConnectionState, data: RoomJoinMessage) {
    const { roomId, config } = data;

    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId, this.connectionHandler);
      
      // If config is provided (e.g., from URL params), set it before initializing
      if (config) {
        room.setLobbyConfig(config);
      }
      
      await room.initialize();
      this.rooms.set(roomId, room);
    }

    // Add player to room
    const player = room.addPlayer(conn);

    // Send room state to the joining player
    const roomState: RoomStateMessage = {
      roomId,
      players: room.getPlayerInfoList(),
      myEntityId: player.entityId,
      ownerId: room.getOwnerId() || conn.id
    };
    this.connectionHandler.sendLow(conn, Opcode.RoomState, roomState);

    // Broadcast to other players that someone joined
    const otherConnections = room.getAllConnections().filter(c => c.id !== conn.id);
    if (otherConnections.length > 0) {
      const joinedMsg: PlayerJoinedMessage = {
        player: room.getPlayerInfo(player.entityId)
      };
      otherConnections.forEach(c => {
        this.connectionHandler.sendLow(c, Opcode.PlayerJoined, joinedMsg);
      });
    }
  }

  private handleRoomLeave(conn: ConnectionState, data: RoomLeaveMessage) {
    const { roomId } = data;
    const room = this.rooms.get(roomId);

    if (!room) {
      this.connectionHandler.sendError(conn, 'ROOM_NOT_FOUND', `Room ${roomId} not found`);
      return;
    }

    const player = room.removePlayer(conn.id);
    if (player) {
      // Broadcast to other players
      const leftMsg: PlayerLeftMessage = {
        playerId: player.id,
        entityId: player.entityId
      };
      room.getAllConnections().forEach(c => {
        this.connectionHandler.sendLow(c, Opcode.PlayerLeft, leftMsg);
      });

      // Clean up connection state
      conn.roomId = undefined;
      conn.entityId = undefined;

      // Remove room if empty, but NOT if the game is active (loading/playing)
      // During loading phase, the lobby connection disconnects and GameView reconnects
      if (room.getPlayerCount() === 0) {
        if (room.isGameActive()) {
        } else {
          room.dispose();
          this.rooms.delete(roomId);
        }
      }
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  private handlePlayerInput(conn: ConnectionState, buffer: ArrayBuffer) {
    if (!conn.roomId || conn.entityId === undefined) return;
    
    const room = this.rooms.get(conn.roomId);
    if (!room) return;
    
    const input = decodeInput(buffer);
    if (input.timestamp > 0) {
      const nowMs = Date.now();
      const offset = nowMs - input.timestamp;
      if (Number.isFinite(offset)) {
        if (conn.clientTimeOffsetMs === undefined) {
          conn.clientTimeOffsetMs = offset;
        } else {
          conn.clientTimeOffsetMs = conn.clientTimeOffsetMs * 0.9 + offset * 0.1;
        }
        conn.lastClientTimestampMs = input.timestamp;
      }
    }
    room.applyInput(conn.id, input);
  }

  private handleShootRequest(conn: ConnectionState, buffer: ArrayBuffer) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    // Decode the aim direction and spawn position from the shoot packet
    const shootData = decodeShoot(buffer);
    const nowMs = Date.now();
    const clientShotTimeMs = shootData.timestamp;
    const offsetMs = conn.clientTimeOffsetMs;
    const shotServerTimeMs = offsetMs !== undefined ? clientShotTimeMs + offsetMs : nowMs;

    // Spawn projectile(s) using the client-provided aim direction and spawn position
    const spawnData = room.spawnProjectile(
      conn.id, 
      shootData.dirX, shootData.dirY, shootData.dirZ,
      shootData.spawnX, shootData.spawnY, shootData.spawnZ,
      shotServerTimeMs
    );
    if (!spawnData) return;

    // Handle both single projectile and multiple pellets (shotgun)
    if (Array.isArray(spawnData)) {
      // Multi-pellet: use batch encoding (one WebSocket frame for all pellets)
      const batchBuffer = encodeProjectileSpawnBatch(Opcode.ProjectileSpawnBatch, spawnData);
      this.connectionHandler.broadcast(room.getAllConnections(), batchBuffer);
    } else {
      // Single projectile: use original encoding
      const spawnBuffer = encodeProjectileSpawn(Opcode.ProjectileSpawn, spawnData);
      this.connectionHandler.broadcast(room.getAllConnections(), spawnBuffer);
    }
  }

  private handleReloadRequest(conn: ConnectionState, _data: any) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleReloadRequest(conn.id);
  }

  private handleItemDrop(conn: ConnectionState, _data: any) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleItemDrop(conn.id);
  }

  private handleItemPickupRequest(conn: ConnectionState, data: any) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleItemPickupRequest(conn.id, data?.entityId);
  }

  private handleItemTossLand(conn: ConnectionState, data: any) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleItemTossLand(conn.id, data.posX, data.posY, data.posZ);
  }

  private handleFootstepEvent(conn: ConnectionState, data: any) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleFootstepEvent(conn.id, data);
  }

  private handleBlockPlace(conn: ConnectionState, data: BlockPlaceMessage) {
    if (!conn.roomId || conn.entityId === undefined) {
      return;
    }

    const room = this.rooms.get(conn.roomId);
    if (!room) {
      return;
    }

    room.handleBlockPlace(conn.entityId, data);
  }

  private handleBlockRemove(conn: ConnectionState, data: BlockRemoveMessage) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleBlockRemove(conn.entityId, data);
  }

  private handleBuildingCreate(conn: ConnectionState, data: BuildingCreateMessage) {
    if (!conn.roomId || conn.entityId === undefined) {
      return;
    }

    const room = this.rooms.get(conn.roomId);
    if (!room) {
      return;
    }

    room.handleBuildingCreate(conn.entityId, data);
  }

  private handleBuildingTransform(conn: ConnectionState, data: BuildingTransformMessage) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleBuildingTransform(conn.entityId, data);
  }

  private handleBuildingDestroy(conn: ConnectionState, data: BuildingDestroyMessage) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleBuildingDestroy(conn.entityId, data);
  }

  private handleDisconnect(conn: ConnectionState) {
    if (conn.roomId && conn.entityId !== undefined) {
      const room = this.rooms.get(conn.roomId);
      if (room) {
        const player = room.removePlayer(conn.id);
        if (player) {
          const leftMsg: PlayerLeftMessage = {
            playerId: player.id,
            entityId: player.entityId
          };
          room.getAllConnections().forEach(c => {
            this.connectionHandler.sendLow(c, Opcode.PlayerLeft, leftMsg);
          });
          // Remove room if empty, but NOT if the game is active (loading/playing)
          // During loading phase, the lobby connection disconnects and GameView reconnects
          if (room.getPlayerCount() === 0) {
            if (room.isGameActive()) {
            } else {
              room.dispose();
              this.rooms.delete(conn.roomId);
            }
          }
        }
      }
    }
  }

  private handleLadderPlace(conn: ConnectionState, data: LadderPlaceMessage) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleLadderPlace(conn.entityId, data);
  }

  private handleLadderDestroy(conn: ConnectionState, data: LadderDestroyMessage) {
    if (!conn.roomId || conn.entityId === undefined) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleLadderDestroy(conn.entityId, data);
  }

  private handleChatMessage(conn: ConnectionState, data: ChatMessagePayload) {
    if (!conn.roomId) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    const player = room.getPlayer(conn.id);
    if (!player) return;

    const broadcastMsg: ChatBroadcastPayload = {
      senderId: player.id,
      senderColor: player.color,
      text: data.text,
      timestamp: Date.now()
    };

    const connections = room.getAllConnections();
    connections.forEach(c => {
      this.connectionHandler.sendLow(c, Opcode.ChatBroadcast, broadcastMsg);
    });
  }

  private handleLobbyConfig(conn: ConnectionState, data: LobbyConfigPayload) {
    if (!conn.roomId) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    if (room.getOwnerId() !== conn.id) {
      this.connectionHandler.sendError(conn, 'NOT_OWNER', 'Only the room owner can change lobby settings');
      return;
    }

    room.setLobbyConfig(data);

    const updateMsg: LobbyConfigUpdatePayload = {
      config: data
    };

    const connections = room.getAllConnections();
    connections.forEach(c => {
      this.connectionHandler.sendLow(c, Opcode.LobbyConfigUpdate, updateMsg);
    });
  }

  private handleLobbyStart(conn: ConnectionState, _data: LobbyStartMessage) {
    if (!conn.roomId) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    if (room.getOwnerId() !== conn.id) {
      this.connectionHandler.sendError(conn, 'NOT_OWNER', 'Only the room owner can start the game');
      return;
    }

    // Start 3-second countdown
    room.startGameCountdown();
  }

  private handleLobbyStartCancel(conn: ConnectionState, _data: any) {
    if (!conn.roomId) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    if (room.getOwnerId() !== conn.id) {
      this.connectionHandler.sendError(conn, 'NOT_OWNER', 'Only the room owner can cancel the start');
      return;
    }

    room.cancelGameCountdown();
  }

  private handleClientReady(conn: ConnectionState, _data: any) {
    if (!conn.roomId) return;

    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.handleClientReady(conn.id);
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  dispose() {
    this.rooms.forEach(room => room.dispose());
    this.rooms.clear();
  }
}
