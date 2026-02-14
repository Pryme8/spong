<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Crosshair overlay (always visible, even during pointer lock) -->
    <div class="crosshair">
      <!-- Top pip -->
      <div class="pip pip-top" :style="{ transform: `translateY(-${crosshairSpread}px)` }"></div>
      <!-- Bottom pip -->
      <div class="pip pip-bottom" :style="{ transform: `translateY(${crosshairSpread}px)` }"></div>
      <!-- Left pip -->
      <div class="pip pip-left" :style="{ transform: `translateX(-${crosshairSpread}px)` }"></div>
      <!-- Right pip -->
      <div class="pip pip-right" :style="{ transform: `translateX(${crosshairSpread}px)` }"></div>
    </div>
    
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
      :player-breath-remaining="playerBreathRemaining"
      :player-max-breath="playerMaxBreath"
      :player-is-underwater="playerIsUnderwater"
      :player-is-in-water="playerIsInWater"
      :has-weapon="hasWeapon"
      :weapon-type="weaponType"
      :current-ammo="currentAmmo"
      :max-capacity="maxCapacity"
      :is-reloading="isReloading"
      :reload-progress="reloadProgress"
      :latency="latency"
      :ping-color-class="pingColorClass"
      :simulated-latency-ms="simulatedLatencyMs"
      :hit-marker-visible="hitMarkerVisible"
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

    <!-- Water Debug Panel (only if ?waterDebug URL flag is present) -->
    <WaterDebugPanel v-if="showWaterDebug" />

    <!-- World Debug Panel (only if ?debugWorld URL flag is present) -->
    <WorldDebugPanel v-if="showWorldDebug" />

    <!-- Post Process Debug Panel (only if ?debugPost URL flag is present) -->
    <PostProcessDebugPanel 
      v-if="showPostDebug"
      :visible="showPostDebug"
      :update-exposure="session.setPostProcessExposure"
      :update-contrast="session.setPostProcessContrast"
      :update-saturation="session.setPostProcessSaturation"
      :update-chromatic-aberration="session.setPostProcessChromaticAberration"
      :update-sharpening="session.setPostProcessSharpening"
      :update-grain-intensity="session.setPostProcessGrainIntensity"
      :update-health-percentage="session.setPostProcessHealthPercentage"
      :update-pencil-enabled="session.setPostProcessPencilEnabled"
      :update-pencil-edge-strength="session.setPostProcessPencilEdgeStrength"
      :update-pencil-depth-weight="session.setPostProcessPencilDepthWeight"
      :update-pencil-normal-weight="session.setPostProcessPencilNormalWeight"
      :update-pencil-edge-threshold="session.setPostProcessPencilEdgeThreshold"
      :update-pencil-hatch-intensity="session.setPostProcessPencilHatchIntensity"
      :update-pencil-hatch-scale="session.setPostProcessPencilHatchScale"
      :update-pencil-paper-intensity="session.setPostProcessPencilPaperIntensity"
      :update-directional-light-intensity="session.setDirectionalLightIntensity"
      :update-directional-light-color="session.setDirectionalLightColor"
      :update-hemispheric-light-intensity="session.setHemisphericLightIntensity"
      :update-hemispheric-light-color="session.setHemisphericLightColor"
      :update-hemispheric-ground-color="session.setHemisphericGroundColor"
      :update-ambient-tint-strength="session.setAmbientTintStrength"
      :update-ambient-min-intensity="session.setAmbientMinIntensity"
      :update-ambient-max-intensity="session.setAmbientMaxIntensity"
      :initial-values="session.getPostProcessValues()"
      @close="showPostDebug = false"
    />

    <!-- Camera Debug Panel (only if ?cameraDebug URL flag is present) -->
    <CameraDebugPanel
      v-if="showCameraDebug"
      :visible="showCameraDebug"
      :get-offset="session.getCameraDebugOffset"
      :set-offset="session.setCameraDebugOffset"
      @close="showCameraDebug = false"
    />

    <!-- Latency Debug Panel (only if ?latencyDebug URL flag is present) -->
    <LatencyDebugPanel
      v-if="showLatencyDebug"
      :visible="showLatencyDebug"
      :current-latency-ms="simulatedLatencyMs ?? 0"
      @close="showLatencyDebug = false"
    />

    <!-- Weapon Debug Panel (toggle with U key) -->
    <WeaponDebugPanel
      v-if="showWeaponDebug"
      :visible="showWeaponDebug"
      :weapon-type="weaponType"
      :initial-position="weaponDebugPosition"
      :initial-rotation="weaponDebugRotation"
      @transform-change="handleWeaponTransformChange"
      @disable-debug="handleDisableDebugMode"
      @close="showWeaponDebug = false"
    />
    
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

    <!-- Loading Dialog (during level preload) -->
    <v-dialog
      v-model="showLoadingOverlay"
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
            <v-list-subheader>Players Ready ({{ readyPlayerCount }} / {{ totalPlayerCount }})</v-list-subheader>
            <v-list-item
              v-for="player in players.values()"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH, Opcode } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import TouchController from '../components/TouchController.vue';
import ShadowDebugPanel from '../components/ShadowDebugPanel.vue';
import WaterDebugPanel from '../components/WaterDebugPanel.vue';
import WorldDebugPanel from '../components/WorldDebugPanel.vue';
import PostProcessDebugPanel from '../components/PostProcessDebugPanel.vue';
import CameraDebugPanel from '../components/CameraDebugPanel.vue';
import LatencyDebugPanel from '../components/LatencyDebugPanel.vue';
import WeaponDebugPanel from '../components/WeaponDebugPanel.vue';
import Scoreboard from '../components/Scoreboard.vue';
import CountdownOverlay from '../components/CountdownOverlay.vue';
import VictoryScreen from '../components/VictoryScreen.vue';

const props = defineProps<{
  isLoadingPhase?: boolean;
  levelSeed?: string;
  roomId?: string;
  levelConfig?: any;
}>();

const emit = defineEmits<{
  'loading-complete': []
}>();

const route = useRoute();
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Detect mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  || window.innerWidth < 768;

// Get room info and config - route determines behavior
let levelSeed: string | null = null;
let targetRoom: string;

if (route.name === 'level') {
  // /level/ route: ALWAYS create a level_ room
  levelSeed = (route.query.seed as string) || 'test';
  targetRoom = `level_${levelSeed}`;
} else {
  // /game/ route or other: use props or query params
  levelSeed = props.levelSeed || (route.query.seed as string) || null;
  targetRoom = props.roomId || (route.query.room as string) || (levelSeed ? `level_${levelSeed}` : 'lobby');
}
// Parse config from props or URL params
const levelConfig: any = props.levelConfig || {};
if (!props.levelConfig && route.query.pistols) {
  levelConfig.pistolCount = parseInt(route.query.pistols as string);
}

// Parse damage multipliers from URL params
if (!props.levelConfig) {
  if (route.query.hsDmg) {
    levelConfig.headshotDmg = parseFloat(route.query.hsDmg as string);
  }
  if (route.query.nsDmg) {
    levelConfig.normalDmg = parseFloat(route.query.nsDmg as string);
  }
}

// Parse disable flags from URL (e.g. ?disable=trees,bushes,rocks,items)
if (route.query.disable) {
  const disableFlags = (route.query.disable as string).split(',').map(s => s.trim());
  levelConfig.disableSpawns = disableFlags;
}

// Check for debug URL flags
const showShadowDebug = ref(route.query.shadowDebug !== undefined);
const showWaterDebug = ref(route.query.waterDebug !== undefined);
const showWorldDebug = ref(route.query.debugWorld !== undefined);
const showPostDebug = ref(route.query.debugPost !== undefined);
const showCameraDebug = ref(route.query.cameraDebug !== undefined);
const showLatencyDebug = ref(route.query.latencyDebug !== undefined);
const showWeaponDebug = ref(false); // Toggle with U key
const weaponDebugPosition = ref({ x: 0, y: 0, z: 0 });
const weaponDebugRotation = ref({ x: 0, y: 0, z: 0 });

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
  playerBreathRemaining,
  playerMaxBreath,
  playerIsUnderwater,
  playerIsInWater,
  playerX,
  playerY,
  playerZ,
  hasWeapon,
  weaponType,
  currentAmmo,
  maxCapacity,
  isReloading,
  reloadProgress,
  bloomPercent,
  latency,
  pingColorClass,
  simulatedLatencyMs,
  hasHammer,
  buildMode,
  buildSelectedGridId,
  buildColorIndex,
  buildDemolishProgress,
  playerMaterials,
  hasLadder,
  killFeedEntries,
  roundState,
  hitMarkerVisible
} = session;

// Scoreboard visibility (Tab key)
const showScoreboard = ref(false);

// Loading dialog state
const showLoadingOverlay = ref(false);
const loadingSecondsRemaining = ref(0);
const readyPlayerIds = ref<string[]>([]);
const totalPlayerCount = computed(() => players.value.size);
const readyPlayerCount = computed(() => readyPlayerIds.value.length);

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

// Crosshair bloom spread (0-1 mapped to pip distance)
const crosshairSpread = computed(() => {
  const minSpread = 0; // No additional offset at 0 bloom
  const maxSpread = 20; // Max additional offset at 1.0 bloom
  const spread = minSpread + (bloomPercent.value * maxSpread);
  return spread;
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
  
  // F12 to toggle Babylon inspector
  if (e.code === 'F12') {
    e.preventDefault();
    toggleInspector();
  }
  
  // U key to toggle weapon debug panel
  if (e.code === 'KeyU') {
    e.preventDefault();
    showWeaponDebug.value = !showWeaponDebug.value;
    
    // Update initial values from current weapon holder when opening
    if (showWeaponDebug.value && session.myTransform?.value) {
      const holder = session.myTransform.value.getWeaponHolder();
      const pos = holder.getWeaponPosition();
      const rot = holder.getWeaponRotation();
      if (pos) weaponDebugPosition.value = pos;
      if (rot) weaponDebugRotation.value = rot;
    }
  }
}

function handleWeaponTransformChange(position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) {
  if (session.myTransform?.value) {
    const holder = session.myTransform.value.getWeaponHolder();
    holder.setDebugMode(true); // Enable debug mode to prevent auto-positioning
    holder.setWeaponPosition(position.x, position.y, position.z);
    holder.setWeaponRotation(rotation.x, rotation.y, rotation.z);
  }
}

function handleDisableDebugMode() {
  if (session.myTransform?.value) {
    const holder = session.myTransform.value.getWeaponHolder();
    holder.setDebugMode(false); // Weapon will return to default positioning
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    showScoreboard.value = false;
  }
}

// Toggle Babylon.js inspector for debugging
async function toggleInspector() {
  const scene = session.getScene();
  if (!scene) return;
  
  if (scene.debugLayer.isVisible()) {
    scene.debugLayer.hide();
  } else {
    await import('@babylonjs/inspector');
    scene.debugLayer.show({ embedMode: true });
  }
}

// Set initial loading overlay state from prop
showLoadingOverlay.value = props.isLoadingPhase || false;

// Watch for loading phase prop changes
watch(() => props.isLoadingPhase, (isLoading) => {
  showLoadingOverlay.value = isLoading || false;
});

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: targetRoom,
    levelSeed: levelSeed || undefined,
    isMobile,
    levelConfig: Object.keys(levelConfig).length > 0 ? levelConfig : undefined,
    isLoadingPhase: props.isLoadingPhase
  });
  
  // If in loading phase, watch reactive loading state from session
  if (props.isLoadingPhase) {
    // Watch loading state reactively (handlers registered inside init, never missed)
    watch(() => session.loadingSecondsRemaining.value, (val) => {
      loadingSecondsRemaining.value = val;
    });
    watch(() => session.loadingReadyPlayers.value, (val) => {
      readyPlayerIds.value = val;
    }, { deep: true });
    
    // Listen for GameBegin (safe even if it already fired)
    session.onGameBegin(() => {
      showLoadingOverlay.value = false;
      emit('loading-complete');
    });
  }
  
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
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 999;
}

/* Individual pips */
.pip {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  transition: transform 0.1s ease-out;
}

/* Top pip */
.pip-top {
  left: 50%;
  bottom: 50%;
  width: 1px;
  height: 8px;
  margin-left: -0.5px;
  margin-bottom: 4px;
}

/* Bottom pip */
.pip-bottom {
  left: 50%;
  top: 50%;
  width: 1px;
  height: 8px;
  margin-left: -0.5px;
  margin-top: 4px;
}

/* Left pip */
.pip-left {
  top: 50%;
  right: 50%;
  height: 1px;
  width: 8px;
  margin-top: -0.5px;
  margin-right: 4px;
}

/* Right pip */
.pip-right {
  top: 50%;
  left: 50%;
  height: 1px;
  width: 8px;
  margin-top: -0.5px;
  margin-left: 4px;
}
</style>
