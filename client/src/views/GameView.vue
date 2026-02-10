<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Crosshair overlay (always visible, even during pointer lock) -->
    <div class="crosshair"></div>
    
    <!-- Game HUD -->
    <GameHud
      title="Connected"
      :is-connected="isConnected"
      :is-in-room="isInRoom"
      :room-id="roomId"
      :my-entity-id="myEntityId"
      :players="players"
      :kill-feed-entries="killFeedEntries"
      :player-health="playerHealth"
      :max-health="maxHealth"
      :player-armor="playerArmor"
      :player-helmet-health="playerHelmetHealth"
      :player-stamina="playerStamina"
      :player-is-exhausted="playerIsExhausted"
      :player-has-infinite-stamina="playerHasInfiniteStamina"
      :has-weapon="hasWeapon"
      :weapon-type="weaponType"
      :current-ammo="currentAmmo"
      :max-capacity="maxCapacity"
      :is-reloading="isReloading"
      :reload-progress="reloadProgress"
      :latency="latency"
      :ping-color-class="pingColorClass"
      :has-hammer="hasHammer"
      :has-ladder="hasLadder"
      :build-mode="buildMode"
      :build-selected-grid-id="buildSelectedGridId"
      :build-color-index="buildColorIndex"
      :build-demolish-progress="buildDemolishProgress"
      :player-materials="playerMaterials"
    />

    <!-- Touch Controller for Mobile -->
    <TouchController @input-change="handleMobileInput" @shoot="handleMobileShoot" />

    <!-- Shadow Debug Panel (only if ?shadowDebug URL flag is present) -->
    <ShadowDebugPanel v-if="showShadowDebug" />
    
    <!-- Scoreboard (Tab key) -->
    <Scoreboard 
      :visible="showScoreboard"
      :players="players"
      :my-entity-id="myEntityId"
      :room-id="roomId"
      :latency="latency"
      @close="showScoreboard = false"
    />
    
    <CountdownOverlay 
      :visible="roundState?.isCountdown.value || false"
      :seconds="roundState?.countdownSeconds.value || 0"
    />
    
    <VictoryScreen 
      :visible="roundState?.isEnded.value || false"
      :winner="roundState?.winner.value || null"
      :scores="roundState?.scores.value || []"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import TouchController from '../components/TouchController.vue';
import ShadowDebugPanel from '../components/ShadowDebugPanel.vue';
import Scoreboard from '../components/Scoreboard.vue';
import CountdownOverlay from '../components/CountdownOverlay.vue';
import VictoryScreen from '../components/VictoryScreen.vue';

const route = useRoute();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Detect mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  || window.innerWidth < 768;

// Get room info and config from route
const levelSeed = route.query.seed as string || null;
const targetRoom = levelSeed ? `level_${levelSeed}` : 'lobby';

// Parse config from URL params
const levelConfig: any = {};
if (route.query.pistols) {
  levelConfig.pistolCount = parseInt(route.query.pistols as string);
}

// Check for shadowDebug URL flag
const showShadowDebug = ref(route.query.shadowDebug !== undefined);

// Initialize game session
const session = useGameSession();

// Extract state from session for template binding
const {
  isConnected,
  isInRoom,
  roomId,
  myEntityId,
  players,
  playerHealth,
  playerArmor,
  playerHelmetHealth,
  playerStamina,
  playerIsExhausted,
  playerHasInfiniteStamina,
  playerX,
  playerY,
  playerZ,
  hasWeapon,
  weaponType,
  currentAmmo,
  maxCapacity,
  isReloading,
  reloadProgress,
  latency,
  pingColorClass,
  hasHammer,
  buildMode,
  buildSelectedGridId,
  buildColorIndex,
  buildDemolishProgress,
  playerMaterials,
  hasLadder,
  killFeedEntries,
  roundState
} = session;

// Scoreboard visibility (Tab key)
const showScoreboard = ref(false);

// Health computed
const maxHealth = PLAYER_MAX_HEALTH;
const healthPercent = computed(() => {
  return Math.max(0, Math.min(100, (playerHealth.value / maxHealth) * 100));
});
const healthBarClass = computed(() => {
  const percent = healthPercent.value;
  if (percent > 70) return 'health-high';
  if (percent > 40) return 'health-medium';
  return 'health-low';
});

// Mobile input state (unused - TouchController handles this)
const mobileForward = ref(0);
const mobileRight = ref(0);
const mobileRotateLeft = ref(false);
const mobileRotateRight = ref(false);
const mobileJump = ref(false);

function handleMobileInput(forward: number, right: number, rotateLeft: boolean, rotateRight: boolean, jump: boolean) {
  mobileForward.value = forward;
  mobileRight.value = right;
  mobileRotateLeft.value = rotateLeft;
  mobileRotateRight.value = rotateRight;
  mobileJump.value = jump;
}

function handleMobileShoot() {
  // Handled by game session
}

// Tab key handler for scoreboard
function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    showScoreboard.value = true;
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    showScoreboard.value = false;
  }
}

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: targetRoom,
    levelSeed: levelSeed || undefined,
    isMobile,
    levelConfig: Object.keys(levelConfig).length > 0 ? levelConfig : undefined
  });
  
  // Add keyboard listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  session.dispose();
});
</script>

<style scoped>
.game-view {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  outline: none;
  cursor: crosshair;
}

/* Crosshair overlay - always visible, even during pointer lock */
.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
  pointer-events: none;
  z-index: 999;
}

.crosshair::before,
.crosshair::after {
  content: '';
  position: absolute;
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
}

/* Vertical line */
.crosshair::before {
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  margin-left: -1px;
}

/* Horizontal line */
.crosshair::after {
  top: 50%;
  left: 0;
  height: 2px;
  width: 100%;
  margin-top: -1px;
}
</style>
