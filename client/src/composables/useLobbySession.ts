import { ref, readonly, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NetworkClient } from '../network/NetworkClient';
import { useRoom } from './useRoom';
import {
  Opcode,
  ChatBroadcastPayload,
  LobbyConfigUpdatePayload,
  LobbyStartingPayload,
  ChatMessagePayload,
  LobbyConfigPayload
} from '@spong/shared';

export interface ChatMessage {
  senderId: string;
  senderColor: string;
  text: string;
  timestamp: number;
}

export function useLobbySession() {
  const router = useRouter();
  
  const isConnected = ref(false);
  const isInRoom = ref(false);
  const roomId = ref<string | null>(null);
  const ownerId = ref<string | null>(null);
  const myEntityId = ref<number | null>(null);
  const players = ref<Map<string, any>>(new Map());
  const chatMessages = ref<ChatMessage[]>([]);
  const lobbyConfig = ref<LobbyConfigPayload>({});
  
  let networkClient: NetworkClient | null = null;
  let room: ReturnType<typeof useRoom> | null = null;

  async function init(targetRoomId: string): Promise<void> {
    const wsUrl = `ws://${window.location.hostname}:3000/ws`;
    networkClient = new NetworkClient(wsUrl);
    room = useRoom(networkClient);

    // Sync room state to our local refs
    watch(() => room?.isInRoom.value, (val) => { isInRoom.value = val || false; });
    watch(() => room?.roomId.value, (val) => { roomId.value = val; });
    watch(() => room?.ownerId.value, (val) => { ownerId.value = val; });
    watch(() => room?.myEntityId.value, (val) => { myEntityId.value = val; });
    watch(() => room?.players.value, (val) => { players.value = val || new Map(); }, { deep: true });

    networkClient.onLowFrequency(Opcode.ChatBroadcast, (payload: ChatBroadcastPayload) => {
      chatMessages.value.push({
        senderId: payload.senderId,
        senderColor: payload.senderColor,
        text: payload.text,
        timestamp: payload.timestamp
      });
    });

    networkClient.onLowFrequency(Opcode.LobbyConfigUpdate, (payload: LobbyConfigUpdatePayload) => {
      lobbyConfig.value = payload.config;
    });

    networkClient.onLowFrequency(Opcode.LobbyStarting, (payload: LobbyStartingPayload) => {
      console.log('[LobbySession] Game starting, navigating to level:', payload);
      
      const query: Record<string, string> = {
        seed: payload.seed
      };
      
      if (payload.config.pistolCount !== undefined) {
        query.pistols = payload.config.pistolCount.toString();
      }
      
      router.push({
        name: 'level',
        query
      });
    });

    // Register no-op handlers for game-specific opcodes that lobby doesn't need
    const gameOpcodes = [
      Opcode.EntityDamage,
      Opcode.EntityDeath,
      Opcode.ItemSpawn,
      Opcode.ItemUpdate,
      Opcode.ItemPickup,
      Opcode.ReloadRequest,
      Opcode.ExplosionSpawn,
      Opcode.StaminaUpdate,
      Opcode.BuffApplied,
      Opcode.BuffExpired,
      Opcode.ArmorUpdate,
      Opcode.HelmetUpdate,
      Opcode.MaterialsUpdate,
      Opcode.TreeSpawn,
      Opcode.RockSpawn,
      Opcode.BlockPlace,
      Opcode.BlockPlaced,
      Opcode.BlockRemove,
      Opcode.BlockRemoved,
      Opcode.BuildingInitialState,
      Opcode.BuildingCreate,
      Opcode.BuildingCreated,
      Opcode.BuildingTransform,
      Opcode.BuildingTransformed,
      Opcode.BuildingDestroy,
      Opcode.BuildingDestroyed,
      Opcode.LadderPlace,
      Opcode.LadderSpawned,
      Opcode.LadderDestroy,
      Opcode.LadderDestroyed
    ];

    gameOpcodes.forEach(opcode => {
      networkClient.onLowFrequency(opcode, () => {
        // No-op: lobby doesn't need to handle game-specific messages
      });
    });

    try {
      await networkClient.connect();
      isConnected.value = true;
      room.joinRoom(targetRoomId);
    } catch (err) {
      console.error('[LobbySession] Failed to connect:', err);
    }
  }

  function sendChat(text: string): void {
    if (!networkClient || !text.trim()) return;
    const payload: ChatMessagePayload = { text: text.trim() };
    networkClient.sendLow(Opcode.ChatMessage, payload);
  }

  function updateConfig(config: LobbyConfigPayload): void {
    if (!networkClient) return;
    networkClient.sendLow(Opcode.LobbyConfig, config);
  }

  function startGame(): void {
    if (!networkClient) return;
    networkClient.sendLow(Opcode.LobbyStart, {});
  }

  function dispose(): void {
    if (room) {
      room.leaveRoom();
    }
    if (networkClient) {
      networkClient.disconnect();
    }
    networkClient = null;
    room = null;
  }

  return {
    isConnected: readonly(isConnected),
    isInRoom: readonly(isInRoom),
    roomId: readonly(roomId),
    ownerId: readonly(ownerId),
    myEntityId: readonly(myEntityId),
    players: readonly(players),
    chatMessages: readonly(chatMessages),
    lobbyConfig: readonly(lobbyConfig),
    init,
    sendChat,
    updateConfig,
    startGame,
    dispose
  };
}
