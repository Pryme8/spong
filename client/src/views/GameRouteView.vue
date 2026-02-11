<template>
  <PreLobbyView v-if="!gameLoading && !gameStarted" @game-loading="handleGameLoading" />
  <GameView 
    v-else 
    :is-loading-phase="gameLoading" 
    :level-seed="levelSeed"
    :room-id="roomId"
    :level-config="levelConfig"
    @loading-complete="handleLoadingComplete" 
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import PreLobbyView from './PreLobbyView.vue';
import GameView from './GameView.vue';

const router = useRouter();
const route = useRoute();
const gameLoading = ref(false);
const gameStarted = ref(false);
const levelSeed = ref('');
const roomId = ref('');
const levelConfig = ref<any>({});

function handleGameLoading(data: { roomId: string; seed: string; config: any }) {
  console.log('[GameRouteView] Game loading started:', data);
  gameLoading.value = true;
  levelSeed.value = data.seed;
  roomId.value = data.roomId;
  levelConfig.value = data.config;
  
  // Update URL query params for consistency
  const query: Record<string, string> = {
    seed: data.seed,
    room: data.roomId
  };
  
  if (data.config.pistolCount !== undefined) {
    query.pistols = data.config.pistolCount.toString();
  }
  
  if (data.config.headshotDmg !== undefined) {
    query.hsDmg = data.config.headshotDmg.toString();
  }
  
  if (data.config.normalDmg !== undefined) {
    query.nsDmg = data.config.normalDmg.toString();
  }
  
  router.replace({
    name: 'game',
    query
  });
}

function handleLoadingComplete() {
  console.log('[GameRouteView] Loading complete, game started');
  gameLoading.value = false;
  gameStarted.value = true;
}
</script>
