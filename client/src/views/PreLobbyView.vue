<template>
  <v-container fluid class="fill-height lobby-container">
    <v-row justify="center" align="center">
      <v-col cols="12" md="10" lg="8">
        <v-card class="nexus-card" elevation="12">
          <v-card-title class="text-h4 text-center primary--text pa-6">
            Game Lobby
          </v-card-title>
          <v-card-subtitle class="text-center text-h6 pb-4">
            Room: {{ roomId || 'Connecting...' }}
          </v-card-subtitle>

          <v-divider></v-divider>

          <v-card-text class="pa-6">
            <v-row>
              <v-col cols="12" md="4">
                <v-card variant="outlined" class="player-list-card">
                  <v-card-title class="text-h6">Players</v-card-title>
                  <v-divider></v-divider>
                  <v-list density="compact" class="player-list">
                    <v-list-item
                      v-for="player in playersList"
                      :key="player.id"
                      :title="player.id"
                    >
                      <template v-slot:prepend>
                        <v-icon
                          :color="player.color"
                          icon="mdi-account-circle"
                          size="large"
                        ></v-icon>
                      </template>
                      <template v-slot:append v-if="player.id === ownerId">
                        <v-chip size="x-small" color="primary">Host</v-chip>
                      </template>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>

              <v-col cols="12" md="8">
                <v-card variant="outlined" class="chat-card">
                  <v-card-title class="text-h6">Chat</v-card-title>
                  <v-divider></v-divider>
                  <v-card-text class="chat-messages" ref="chatContainer">
                    <div
                      v-for="(msg, index) in chatMessages"
                      :key="index"
                      class="chat-message mb-2"
                    >
                      <span class="chat-sender" :style="{ color: msg.senderColor }">
                        {{ msg.senderId }}:
                      </span>
                      <span class="chat-text">{{ msg.text }}</span>
                    </div>
                  </v-card-text>
                  <v-divider></v-divider>
                  <v-card-actions class="pa-3">
                    <v-text-field
                      v-model="chatInput"
                      label="Type a message..."
                      variant="outlined"
                      density="compact"
                      hide-details
                      @keyup.enter="sendChatMessage"
                    ></v-text-field>
                    <v-btn
                      color="primary"
                      @click="sendChatMessage"
                      :disabled="!chatInput.trim()"
                      class="ml-2"
                    >
                      Send
                    </v-btn>
                  </v-card-actions>
                </v-card>

                <v-card variant="outlined" class="config-card mt-4" v-if="isOwner">
                  <v-card-title class="text-h6">Game Settings</v-card-title>
                  <v-divider></v-divider>
                  <v-card-text class="text-center py-4">
                    <v-btn
                      color="secondary"
                      variant="outlined"
                      @click="showConfigDialog = true"
                      prepend-icon="mdi-cog"
                    >
                      Configure Level Options
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>

          <v-divider></v-divider>

          <v-card-actions class="pa-6">
            <v-spacer></v-spacer>
            <v-btn
              v-if="isOwner"
              color="primary"
              size="x-large"
              variant="flat"
              @click="startGame"
              :disabled="!isInRoom"
            >
              <v-icon start>mdi-play</v-icon>
              Start Game
            </v-btn>
            <div v-else class="text-h6 text-medium-emphasis">
              Waiting for host to start...
            </div>
            <v-spacer></v-spacer>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Configuration Dialog -->
    <v-dialog
      v-model="showConfigDialog"
      max-width="800"
      scrollable
    >
      <v-card>
        <v-card-title class="text-h5 primary--text">
          Level Configuration
        </v-card-title>
        <v-divider></v-divider>

        <v-tabs v-model="configTab" bg-color="transparent" color="primary">
          <v-tab value="world">
            <v-icon start>mdi-earth</v-icon>
            World
          </v-tab>
          <v-tab value="weapons">
            <v-icon start>mdi-pistol</v-icon>
            Weapons
          </v-tab>
          <v-tab value="items">
            <v-icon start>mdi-shield</v-icon>
            Items
          </v-tab>
        </v-tabs>

        <v-divider></v-divider>

        <v-card-text style="max-height: 500px">
          <v-window v-model="configTab">
            <!-- World Settings Tab -->
            <v-window-item value="world">
              <div class="pa-4">
                <v-text-field
                  v-model="configSeed"
                  label="Level Seed"
                  variant="outlined"
                  density="comfortable"
                  hint="Leave empty for random seed"
                  persistent-hint
                  clearable
                  @input="onConfigChange"
                ></v-text-field>
              </div>
            </v-window-item>

            <!-- Weapons Tab -->
            <v-window-item value="weapons">
              <div class="pa-4">
                <div class="mb-6">
                  <div class="text-subtitle-1 font-weight-bold mb-2">Pistols</div>
                  <v-slider
                    v-model="configPistolCount"
                    min="0"
                    max="100"
                    step="1"
                    thumb-label
                    color="primary"
                    @update:modelValue="onConfigChange"
                  >
                    <template v-slot:append>
                      <v-text-field
                        v-model.number="configPistolCount"
                        type="number"
                        style="width: 80px"
                        density="compact"
                        variant="outlined"
                        hide-details
                        @input="onConfigChange"
                      ></v-text-field>
                    </template>
                  </v-slider>
                </div>

                <div class="text-caption text-medium-emphasis">
                  More weapon types coming soon...
                </div>
              </div>
            </v-window-item>

            <!-- Items Tab -->
            <v-window-item value="items">
              <div class="pa-4">
                <div class="text-caption text-medium-emphasis">
                  Item spawn configuration coming soon...
                </div>
              </div>
            </v-window-item>
          </v-window>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            variant="text"
            @click="showConfigDialog = false"
          >
            Done
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useLobbySession } from '../composables/useLobbySession';

const route = useRoute();
const session = useLobbySession();

const chatInput = ref('');
const chatContainer = ref<HTMLElement | null>(null);
const configSeed = ref('');
const configPistolCount = ref(30);
const showConfigDialog = ref(false);
const configTab = ref('world');

const {
  isConnected,
  isInRoom,
  roomId,
  ownerId,
  myEntityId,
  players,
  chatMessages,
  lobbyConfig
} = session;

const playersList = computed(() => {
  return Array.from(players.value.values());
});

const isOwner = computed(() => {
  if (!ownerId.value || !myEntityId.value) return false;
  const myPlayer = Array.from(players.value.values()).find(p => p.entityId === myEntityId.value);
  return myPlayer?.id === ownerId.value;
});

function sendChatMessage() {
  if (!chatInput.value.trim()) return;
  session.sendChat(chatInput.value);
  chatInput.value = '';
}

function onConfigChange() {
  if (!isOwner.value) return;
  session.updateConfig({ 
    seed: configSeed.value || undefined,
    pistolCount: configPistolCount.value
  });
}

function startGame() {
  session.startGame();
}

watch(chatMessages, async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
});

watch(lobbyConfig, (config) => {
  if (config.seed && config.seed !== configSeed.value) {
    configSeed.value = config.seed;
  }
  if (config.pistolCount !== undefined && config.pistolCount !== configPistolCount.value) {
    configPistolCount.value = config.pistolCount;
  }
});

onMounted(async () => {
  const targetRoom = (route.query.room as string) || 'lobby';
  await session.init(targetRoom);
});

onUnmounted(() => {
  session.dispose();
});
</script>

<style scoped>
.lobby-container {
  background: linear-gradient(135deg, #0a0a1a 0%, #141432 100%);
  position: relative;
  overflow: hidden;
}

.lobby-container::before {
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

.player-list-card,
.chat-card,
.config-card {
  background: rgba(10, 10, 26, 0.8) !important;
  border: 1px solid rgba(0, 255, 136, 0.2);
}

.player-list {
  max-height: 350px;
  overflow-y: auto;
}

.chat-messages {
  height: 250px;
  overflow-y: auto;
  background: rgba(5, 5, 13, 0.5);
  border-radius: 4px;
  padding: 12px;
}

.chat-message {
  font-size: 14px;
  line-height: 1.5;
}

.chat-sender {
  font-weight: bold;
  margin-right: 8px;
}

.chat-text {
  color: rgba(255, 255, 255, 0.9);
}
</style>
