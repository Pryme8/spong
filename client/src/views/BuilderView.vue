<template>
  <div class="builder-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Game HUD -->
    <GameHud
      title="Builder"
      :is-connected="isConnected"
      :is-in-room="isInRoom"
      :room-id="roomId"
      :my-entity-id="myEntityId"
      :players="players"
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
      :build-mode="buildMode"
      :build-selected-grid-id="buildSelectedGridId"
      :build-color-index="buildColorIndex"
      :build-demolish-progress="buildDemolishProgress"
      :player-materials="playerMaterials"
    />

    <!-- Back button -->
    <router-link to="/" class="back-button">← Back</router-link>

    <!-- Shadow Debug Panel (only if ?shadowDebug URL flag is present) -->
    <ShadowDebugPanel v-if="showShadowDebug" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import ShadowDebugPanel from '../components/ShadowDebugPanel.vue';
// BuildModeManager removed - now using BuildSystem via useGameSession

const route = useRoute();
const canvasRef = ref<HTMLCanvasElement | null>(null);

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
  playerMaterials
} = session;

// Health computed
const maxHealth = PLAYER_MAX_HEALTH;

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'builder_room_1',
    isMobile: false
  });

  console.log('[BuilderView] Initialized - BuildSystem integrated via useGameSession');
});

// Cleanup on unmount
onUnmounted(() => {
  session.dispose();
});
</script>

<style scoped>
.builder-view {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

/* Build Instructions */
.build-instructions {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.instruction-card {
  background: rgba(20, 20, 50, 0.95) !important;
  border: 2px solid rgba(255, 255, 0, 0.5);
  padding: 20px;
  pointer-events: auto;
}

.instruction-title {
  color: #ffff00;
  font-size: 24px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 16px;
  text-transform: uppercase;
}

.instruction-item {
  color: #ffffff;
  font-size: 16px;
  margin: 8px 0;
  text-align: center;
}

/* Build HUD */
.build-hud {
  position: absolute;
  top: 20px;
  left: 20px;
  pointer-events: none;
}

.build-card {
  background: rgba(20, 20, 50, 0.95) !important;
  border: 2px solid rgba(0, 255, 136, 0.5);
  pointer-events: auto;
  min-width: 280px;
}

.build-title {
  color: #00ff88;
  font-size: 18px;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.build-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ffffff;
  font-size: 14px;
}

.control-item.color-preview {
  align-items: center;
}

.control-label {
  color: rgba(255, 255, 255, 0.7);
  min-width: 60px;
}

.control-key {
  color: #ffaa00;
  font-family: monospace;
  font-weight: bold;
}

.color-box {
  width: 32px;
  height: 24px;
  border: 2px solid #ffffff;
  border-radius: 4px;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
}

kbd {
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-family: monospace;
  font-size: 14px;
  color: #ffaa00;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

/* Back Button */
.back-button {
  position: absolute;
  bottom: 20px;
  left: 20px;
  padding: 12px 24px;
  background: rgba(20, 20, 50, 0.95);
  border: 2px solid rgba(0, 255, 136, 0.5);
  border-radius: 8px;
  color: #00ff88;
  text-decoration: none;
  font-weight: bold;
  font-size: 16px;
  transition: all 0.2s;
  z-index: 1000;
}

.back-button:hover {
  background: rgba(0, 255, 136, 0.2);
  border-color: #00ff88;
  transform: translateX(-4px);
}
</style>
