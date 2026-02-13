import { ref, readonly } from 'vue';
import { NetworkClient } from '../network/NetworkClient';
import { 
  Opcode, 
  RoomStateMessage, 
  PlayerJoinedMessage, 
  PlayerLeftMessage,
  PlayerInfo 
} from '@spong/shared';

export type PlayerJoinCallback = (playerInfo: PlayerInfo) => void;
export type PlayerLeaveCallback = (entityId: number) => void;

export function useRoom(networkClient: NetworkClient) {
  const roomId = ref<string | null>(null);
  const myEntityId = ref<number | null>(null);
  const players = ref<Map<string, PlayerInfo>>(new Map());
  const isInRoom = ref(false);
  const ownerId = ref<string | null>(null);
  
  let onPlayerJoinedCallback: PlayerJoinCallback | null = null;
  let onPlayerLeftCallback: PlayerLeaveCallback | null = null;

  // Handle room state (when joining)
  networkClient.onLowFrequency(Opcode.RoomState, (payload: RoomStateMessage) => {

    roomId.value = payload.roomId;
    myEntityId.value = payload.myEntityId;
    ownerId.value = payload.ownerId;
    isInRoom.value = true;

    // Populate players map
    players.value.clear();
    payload.players.forEach(player => {
      players.value.set(player.id, player);
      
      // Spawn cubes for other players (not ourselves)
      if (player.entityId !== payload.myEntityId && onPlayerJoinedCallback) {
        onPlayerJoinedCallback(player);
      }
    });

  });

  // Handle player joined
  networkClient.onLowFrequency(Opcode.PlayerJoined, (payload: PlayerJoinedMessage) => {
    players.value.set(payload.player.id, payload.player);

    // Spawn cube for this player
    if (onPlayerJoinedCallback) {
      onPlayerJoinedCallback(payload.player);
    }
  });

  // Handle player left
  networkClient.onLowFrequency(Opcode.PlayerLeft, (payload: PlayerLeftMessage) => {
    players.value.delete(payload.playerId);

    // Remove cube for this player
    if (onPlayerLeftCallback) {
      onPlayerLeftCallback(payload.entityId);
    }
  });

  const joinRoom = (targetRoomId: string, config?: any) => {

    networkClient.sendLow(Opcode.RoomJoin, { roomId: targetRoomId, config });
  };

  const leaveRoom = () => {
    if (roomId.value) {
      networkClient.sendLow(Opcode.RoomLeave, { roomId: roomId.value });
      roomId.value = null;
      myEntityId.value = null;
      isInRoom.value = false;
      players.value.clear();
    }
  };
  
  const onPlayerJoined = (callback: PlayerJoinCallback) => {
    onPlayerJoinedCallback = callback;
  };
  
  const onPlayerLeft = (callback: PlayerLeaveCallback) => {
    onPlayerLeftCallback = callback;
  };

  return {
    roomId: readonly(roomId),
    myEntityId: readonly(myEntityId),
    players: readonly(players),
    isInRoom: readonly(isInRoom),
    ownerId: readonly(ownerId),
    joinRoom,
    leaveRoom,
    onPlayerJoined,
    onPlayerLeft
  };
}
