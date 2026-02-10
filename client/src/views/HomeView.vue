<template>
  <v-container fluid class="fill-height home-container">
    <v-row align="center" justify="center">
      <v-col cols="12" md="6" lg="4">
        <v-card class="nexus-card" elevation="12">
          <v-card-title class="text-h3 text-center primary--text pa-8">
            SPONG
          </v-card-title>
          <v-card-subtitle class="text-center text-h6 pb-4">
            Multiplayer Game
          </v-card-subtitle>
          <v-card-actions class="pa-6">
            <v-btn
              block
              color="primary"
              size="x-large"
              variant="flat"
              @click="createLobby"
            >
              <v-icon start>mdi-plus</v-icon>
              Create Lobby
            </v-btn>
          </v-card-actions>

          <v-divider class="mx-6"></v-divider>

          <v-card-text class="pt-4">
            <v-text-field
              v-model="roomId"
              label="Room ID"
              variant="outlined"
              color="primary"
              prepend-inner-icon="mdi-door"
              hint="Enter a room ID to join an existing lobby"
              persistent-hint
            />
          </v-card-text>
          <v-card-actions class="pa-6 pt-0">
            <v-btn
              block
              color="secondary"
              size="large"
              variant="outlined"
              @click="joinGame"
              :disabled="!roomId"
            >
              <v-icon start>mdi-login</v-icon>
              Join Existing Lobby
            </v-btn>
          </v-card-actions>

          <v-divider class="mx-6 my-2"></v-divider>

          <v-card-text class="text-center py-4">
            <v-btn
              variant="outlined"
              color="primary"
              size="large"
              @click="quickPlay"
            >
              <v-icon start>mdi-lightning-bolt</v-icon>
              Quick Play (Skip Lobby)
            </v-btn>
          </v-card-text>
          
          <v-divider class="mx-6 my-2"></v-divider>
          
          <v-card-text class="text-center">
            <v-btn
              variant="outlined"
              color="primary"
              @click="router.push('/shootingRange')"
              class="mx-2"
            >
              <v-icon start>mdi-target</v-icon>
              Shooting Range
            </v-btn>
            <v-btn
              variant="outlined"
              color="secondary"
              @click="router.push('/builder')"
              class="mx-2"
            >
              <v-icon start>mdi-cube-outline</v-icon>
              Builder
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const roomId = ref('');

const createLobby = () => {
  const uniqueRoomId = `lobby_${Math.random().toString(36).substring(2, 15)}`;
  router.push({ name: 'game', query: { room: uniqueRoomId } });
};

const joinGame = () => {
  if (!roomId.value.trim()) return;
  router.push({ name: 'game', query: { room: roomId.value } });
};

const quickPlay = () => {
  const randomSeed = Math.random().toString(36).substring(2, 15);
  router.push({ name: 'level', query: { seed: randomSeed } });
};
</script>

<style scoped>
.home-container {
  background: linear-gradient(135deg, #0a0a1a 0%, #141432 100%);
  position: relative;
  overflow: hidden;
}

.home-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 50%, rgba(124, 77, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 50%, rgba(0, 255, 136, 0.1) 0%, transparent 50%);
  pointer-events: none;
}

.nexus-card {
  background: rgba(20, 20, 50, 0.95) !important;
  border: 1px solid rgba(0, 255, 136, 0.3);
  box-shadow: 0 0 30px rgba(0, 255, 136, 0.2);
}
</style>
