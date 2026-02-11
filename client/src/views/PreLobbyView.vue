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

                <!-- Custom Settings Display -->
                <v-card variant="outlined" class="mt-4" v-if="customSettings.length > 0">
                  <v-card-title class="text-h6">Custom Settings</v-card-title>
                  <v-divider></v-divider>
                  <v-card-text>
                    <v-list density="compact">
                      <v-list-item
                        v-for="setting in customSettings"
                        :key="setting.name"
                      >
                        <template v-slot:prepend>
                          <v-icon :icon="setting.icon" size="small" color="primary"></v-icon>
                        </template>
                        <v-list-item-title>{{ setting.label }}</v-list-item-title>
                        <v-list-item-subtitle>{{ setting.value }}</v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
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
              :disabled="!isInRoom || startCountdown > 0"
            >
              <v-icon start>mdi-play</v-icon>
              Start Game
            </v-btn>
            <div v-else-if="startCountdown > 0" class="text-h6 text-medium-emphasis">
              Game starting in {{ startCountdown }}s...
            </div>
            <div v-else class="text-h6 text-medium-emphasis">
              Waiting for host to start...
            </div>
            <v-spacer></v-spacer>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Start Countdown Dialog -->
    <v-dialog
      v-model="showStartCountdown"
      max-width="400"
      persistent
    >
      <v-card>
        <v-card-title class="text-h5 text-center pa-6">
          Starting Game
        </v-card-title>
        <v-card-text class="text-center pb-0">
          <div class="text-h1 countdown-display">{{ startCountdown }}</div>
          <div class="text-body-1 mt-4">Get ready!</div>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn
            v-if="isOwner"
            color="error"
            variant="outlined"
            @click="cancelStart"
          >
            Cancel
          </v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Loading Dialog -->
    <v-dialog
      v-model="showLoadingDialog"
      max-width="500"
      persistent
    >
      <v-card>
        <v-card-title class="text-h5 text-center pa-6">
          Loading Game
        </v-card-title>
        <v-card-text>
          <div class="text-center mb-4">
            <v-progress-circular
              :size="60"
              :width="6"
              color="primary"
              indeterminate
            ></v-progress-circular>
          </div>
          <div class="text-center text-h6 mb-4">
            {{ loadingSecondsRemaining }}s remaining
          </div>
          <v-list density="compact">
            <v-list-subheader>Players Ready ({{ readyPlayerIds.length }} / {{ totalPlayers }})</v-list-subheader>
            <v-list-item
              v-for="player in playersList"
              :key="player.id"
            >
              <template v-slot:prepend>
                <v-icon
                  :color="player.color"
                  icon="mdi-account-circle"
                  size="small"
                ></v-icon>
              </template>
              <v-list-item-title>{{ player.id }}</v-list-item-title>
              <template v-slot:append>
                <v-icon
                  v-if="readyPlayerIds.includes(player.id)"
                  color="success"
                  icon="mdi-check-circle"
                ></v-icon>
                <v-icon
                  v-else
                  color="warning"
                  icon="mdi-clock-outline"
                ></v-icon>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>

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
          <v-tab value="damage">
            <v-icon start>mdi-crosshairs</v-icon>
            Damage
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

            <!-- Damage Settings Tab -->
            <v-window-item value="damage">
              <div class="pa-4">
                <div class="mb-6">
                  <div class="text-subtitle-1 font-weight-bold mb-2">Headshot Damage Multiplier</div>
                  <v-slider
                    v-model="configHeadshotDmg"
                    min="1"
                    max="5"
                    step="0.1"
                    thumb-label
                    color="error"
                    @update:modelValue="onConfigChange"
                  >
                    <template v-slot:append>
                      <v-text-field
                        v-model.number="configHeadshotDmg"
                        type="number"
                        style="width: 80px"
                        density="compact"
                        variant="outlined"
                        hide-details
                        @input="onConfigChange"
                      ></v-text-field>
                    </template>
                  </v-slider>
                  <div class="text-caption text-medium-emphasis mt-1">
                    Default: 2.0x (double damage)
                  </div>
                </div>

                <div class="mb-6">
                  <div class="text-subtitle-1 font-weight-bold mb-2">Body Shot Damage Multiplier</div>
                  <v-slider
                    v-model="configNormalDmg"
                    min="0.1"
                    max="3"
                    step="0.1"
                    thumb-label
                    color="primary"
                    @update:modelValue="onConfigChange"
                  >
                    <template v-slot:append>
                      <v-text-field
                        v-model.number="configNormalDmg"
                        type="number"
                        style="width: 80px"
                        density="compact"
                        variant="outlined"
                        hide-details
                        @input="onConfigChange"
                      ></v-text-field>
                    </template>
                  </v-slider>
                  <div class="text-caption text-medium-emphasis mt-1">
                    Default: 1.0x (normal damage)
                  </div>
                </div>
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
const configHeadshotDmg = ref(2.0);
const configNormalDmg = ref(1.0);
const showConfigDialog = ref(false);
const configTab = ref('world');
const showStartCountdown = ref(false);
const startCountdown = ref(0);
const showLoadingDialog = ref(false);
const loadingSecondsRemaining = ref(0);
const readyPlayerIds = ref<string[]>([]);
const totalPlayers = ref(0);

const {
  isConnected,
  isInRoom,
  roomId,
  ownerId,
  myEntityId,
  players,
  chatMessages,
  lobbyConfig,
  startCountdownSeconds,
  isLoading,
  loadingInfo,
  gameLoadingConfig
} = session;

const playersList = computed(() => {
  return Array.from(players.value.values());
});

const isOwner = computed(() => {
  if (!ownerId.value || !myEntityId.value) return false;
  const myPlayer = Array.from(players.value.values()).find(p => p.entityId === myEntityId.value);
  return myPlayer?.id === ownerId.value;
});

// Track custom settings (non-default values)
const customSettings = computed(() => {
  const settings: Array<{ name: string; label: string; value: string; icon: string }> = [];
  
  // Check seed (custom if set)
  if (configSeed.value && configSeed.value.trim()) {
    settings.push({
      name: 'seed',
      label: 'Custom Seed',
      value: configSeed.value,
      icon: 'mdi-earth'
    });
  }
  
  // Check pistol count (default: 30)
  if (configPistolCount.value !== 30) {
    settings.push({
      name: 'pistolCount',
      label: 'Pistol Count',
      value: `${configPistolCount.value}`,
      icon: 'mdi-pistol'
    });
  }
  
  // Check headshot damage (default: 2.0)
  if (configHeadshotDmg.value !== 2.0) {
    settings.push({
      name: 'headshotDmg',
      label: 'Headshot Damage',
      value: `${configHeadshotDmg.value}x`,
      icon: 'mdi-crosshairs'
    });
  }
  
  // Check normal damage (default: 1.0)
  if (configNormalDmg.value !== 1.0) {
    settings.push({
      name: 'normalDmg',
      label: 'Body Shot Damage',
      value: `${configNormalDmg.value}x`,
      icon: 'mdi-bullseye'
    });
  }
  
  return settings;
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
    pistolCount: configPistolCount.value,
    headshotDmg: configHeadshotDmg.value,
    normalDmg: configNormalDmg.value
  });
}

function startGame() {
  session.startGame();
}

function cancelStart() {
  session.cancelStart();
}

watch(chatMessages, async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
});

watch(startCountdownSeconds, (seconds) => {
  startCountdown.value = seconds;
  showStartCountdown.value = seconds > 0;
});

watch(isLoading, (loading) => {
  showLoadingDialog.value = loading;
});

watch(loadingInfo, (info) => {
  if (info) {
    loadingSecondsRemaining.value = info.secondsRemaining;
    readyPlayerIds.value = info.readyPlayers;
    totalPlayers.value = info.totalPlayers;
  }
});

watch(lobbyConfig, (config) => {
  if (config.seed && config.seed !== configSeed.value) {
    configSeed.value = config.seed;
  }
  if (config.pistolCount !== undefined && config.pistolCount !== configPistolCount.value) {
    configPistolCount.value = config.pistolCount;
  }
  if (config.headshotDmg !== undefined && config.headshotDmg !== configHeadshotDmg.value) {
    configHeadshotDmg.value = config.headshotDmg;
  }
  if (config.normalDmg !== undefined && config.normalDmg !== configNormalDmg.value) {
    configNormalDmg.value = config.normalDmg;
  }
});

// Watch for game loading to start - emit immediately so GameView can load level
watch(gameLoadingConfig, (config) => {
  if (config) {
    console.log('[PreLobby] Game loading config received, emitting game-loading event:', config);
    
    // Emit immediately when loading starts
    emit('game-loading', {
      roomId: roomId.value || '',
      seed: config.seed,
      config: config.config
    });
  }
});

const emit = defineEmits<{
  'game-loading': [data: { roomId: string; seed: string; config: any }]
}>();

onMounted(async () => {
  let targetRoom = route.query.room as string;
  
  // If no room specified, generate a unique one (user becomes owner)
  if (!targetRoom) {
    targetRoom = `lobby_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`[PreLobby] No room specified, created unique room: ${targetRoom}`);
  }
  
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

.countdown-display {
  font-size: 96px;
  font-weight: bold;
  color: rgb(var(--v-theme-primary));
  line-height: 1;
}
</style>
