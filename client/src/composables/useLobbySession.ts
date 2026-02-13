import { ref, readonly, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NetworkClient, getWebSocketUrl } from '../network/NetworkClient';
import { useRoom } from './useRoom';
import {
  Opcode,
  ChatBroadcastPayload,
  LobbyConfigUpdatePayload,
  LobbyStartingPayload,
  LobbyStartCountdownPayload,
  GameLoadingPayload,
  PlayersReadyUpdatePayload,
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
  const startCountdownSeconds = ref(0);
  const isLoading = ref(false);
  const loadingInfo = ref<PlayersReadyUpdatePayload | null>(null);
  const gameLoadingConfig = ref<GameLoadingPayload | null>(null);
  
  let networkClient: NetworkClient | null = null;
  let room: ReturnType<typeof useRoom> | null = null;

  async function init(targetRoomId: string): Promise<void> {
    networkClient = new NetworkClient(getWebSocketUrl());
    room = useRoom(networkClient);

    // Sync room state to our local refs
    watch(() => room?.isInRoom.value, (val) => { 
      isInRoom.value = val || false; 
    });
    watch(() => room?.roomId.value, (val) => { 
      roomId.value = val; 
    });
    watch(() => room?.ownerId.value, (val) => { 
      ownerId.value = val; 
    });
    watch(() => room?.myEntityId.value, (val) => { 
      myEntityId.value = val; 
    });
    watch(() => room?.players.value, (val) => { 
      players.value = val || new Map(); 
    }, { deep: true });

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

    networkClient.onLowFrequency(Opcode.LobbyStartCountdown, (payload: LobbyStartCountdownPayload) => {
      startCountdownSeconds.value = payload.secondsRemaining;
    });

    networkClient.onLowFrequency(Opcode.LobbyStartCancel, () => {
      startCountdownSeconds.value = 0;
    });

    networkClient.onLowFrequency(Opcode.GameLoading, (payload: GameLoadingPayload) => {
      isLoading.value = true;
      gameLoadingConfig.value = payload;
    });

    networkClient.onLowFrequency(Opcode.PlayersReadyUpdate, (payload: PlayersReadyUpdatePayload) => {
      loadingInfo.value = payload;
    });

    networkClient.onLowFrequency(Opcode.GameBegin, () => {
      isLoading.value = false;
      // Don't navigate - let the game route handle the transition from lobby to game
    });

    // Keep old LobbyStarting handler for backward compatibility with /level route
    networkClient.onLowFrequency(Opcode.LobbyStarting, (payload: LobbyStartingPayload) => {
      const query: Record<string, string> = {
        seed: payload.seed
      };
      
      if (payload.config.pistolCount !== undefined) {
        query.pistols = payload.config.pistolCount.toString();
      }
      
      if (payload.config.headshotDmg !== undefined) {
        query.hsDmg = payload.config.headshotDmg.toString();
      }
      
      if (payload.config.normalDmg !== undefined) {
        query.nsDmg = payload.config.normalDmg.toString();
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
      Opcode.ItemDropSound,
      Opcode.FootstepEvent,
      Opcode.FootstepSound,
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
      Opcode.BushSpawn,
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
      Opcode.LadderDestroyed,
      Opcode.KillFeed,
      Opcode.RoundState,
      Opcode.ScoreUpdate
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

  function cancelStart(): void {
    if (!networkClient) return;
    networkClient.sendLow(Opcode.LobbyStartCancel, {});
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
    startCountdownSeconds: readonly(startCountdownSeconds),
    isLoading: readonly(isLoading),
    loadingInfo: readonly(loadingInfo),
    gameLoadingConfig: readonly(gameLoadingConfig),
    init,
    sendChat,
    updateConfig,
    startGame,
    cancelStart,
    dispose
  };
}
