<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>
    
    <!-- Game HUD -->
    <GameHud
      title="Shooting Range"
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
    />

    <!-- Back button -->
    <router-link to="/" class="back-button">← Back</router-link>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);

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
  pingColorClass
} = session;

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

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'shooting_range_1',
    isMobile: false
  });
});

// Cleanup on unmount
onUnmounted(() => {
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
}

.hud-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  pointer-events: none;
}

.info-card {
  background: rgba(20, 20, 50, 0.8) !important;
  border: 1px solid rgba(0, 255, 136, 0.3);
  pointer-events: auto;
}

.health-overlay {
  position: absolute;
  top: 16px;
  right: 16px;
  pointer-events: none;
}

.health-card {
  background: rgba(20, 20, 50, 0.9) !important;
  border: 2px solid rgba(0, 255, 136, 0.5);
  min-width: 200px;
  pointer-events: auto;
}

.health-label {
  color: #00ff88;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.health-value {
  color: #ffffff;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 8px;
  font-family: monospace;
}

.health-bar-container {
  width: 100%;
  height: 12px;
  background: rgba(10, 10, 26, 0.8);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.health-bar {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  box-shadow: 0 0 10px currentColor;
}

.health-high {
  background: linear-gradient(90deg, #00ff88 0%, #00cc66 100%);
  color: #00ff88;
}

.health-medium {
  background: linear-gradient(90deg, #ffaa00 0%, #ff8800 100%);
  color: #ffaa00;
}

.health-low {
  background: linear-gradient(90deg, #ff3333 0%, #cc0000 100%);
  color: #ff3333;
  animation: health-pulse 1s ease-in-out infinite;
}

@keyframes health-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.ammo-overlay {
  position: absolute;
  top: 120px;
  right: 16px;
  pointer-events: none;
}

.ammo-card {
  background: rgba(20, 20, 50, 0.9) !important;
  border: 2px solid rgba(255, 170, 0, 0.5);
  min-width: 200px;
  pointer-events: auto;
}

.ammo-label {
  color: #ffaa00;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.ammo-value {
  color: #ffffff;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 4px;
  font-family: monospace;
}

.reload-indicator {
  margin-top: 8px;
}

.reload-text {
  color: #ffaa00;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 4px;
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.reload-bar-container {
  width: 100%;
  height: 8px;
  background: rgba(10, 10, 26, 0.8);
  border: 1px solid rgba(255, 170, 0, 0.3);
  border-radius: 2px;
  overflow: hidden;
}

.reload-bar {
  height: 100%;
  background: linear-gradient(90deg, #ffaa00 0%, #ff8800 100%);
  transition: width 0.1s linear;
  box-shadow: 0 0 10px #ffaa00;
}

/* Crosshair */
.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.crosshair-h {
  position: absolute;
  width: 20px;
  height: 2px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
}

.crosshair-v {
  position: absolute;
  width: 2px;
  height: 20px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
}

.crosshair-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 60, 60, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 3px rgba(255, 60, 60, 0.6);
}

/* Ping Indicator */
.ping-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 4px 0;
}

.ping-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.ping-bar {
  width: 3px;
  background: currentColor;
  border-radius: 1px;
}

.ping-bar-1 { height: 5px; }
.ping-bar-2 { height: 9px; }
.ping-bar-3 { height: 13px; }

.ping-text {
  font-size: 11px;
  font-weight: 500;
  font-family: 'Courier New', monospace;
}

.ping-green { color: #00ff88; }
.ping-yellow { color: #ffdd00; }
.ping-red { color: #ff4444; }

/* Back button */
.back-button {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 4px;
  text-decoration: none;
  font-family: monospace;
  font-size: 13px;
  pointer-events: all;
  z-index: 10;
  transition: background 0.3s;
}

.back-button:hover {
  background: rgba(20, 20, 50, 0.95);
}
</style>
