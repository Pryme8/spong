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

    <!-- Bloom Debug Display -->
    <div class="bloom-debug">
      <div>Bloom: {{ (bloomPercent * 100).toFixed(0) }}%</div>
      <div>Spread: {{ crosshairSpread.toFixed(1) }}px</div>
    </div>
    
    <!-- Game HUD -->
    <GameHud
      title="Shooting Range"
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
      :hit-marker-visible="hitMarkerVisible"
    />

    <!-- Back button -->
    <router-link to="/" class="back-button">← Back</router-link>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameSession } from '../composables/useGameSession';
import { PLAYER_MAX_HEALTH } from '@spong/shared';
import GameHud from '../components/GameHud.vue';
import WeaponDebugPanel from '../components/WeaponDebugPanel.vue';

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
  playerBreathRemaining,
  playerMaxBreath,
  playerIsUnderwater,
  playerIsInWater,
  hasWeapon,
  weaponType,
  currentAmmo,
  maxCapacity,
  isReloading,
  reloadProgress,
  bloomPercent,
  latency,
  pingColorClass,
  killFeedEntries,
  hitMarkerVisible
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

// Crosshair bloom spread (0-1 mapped to pip distance)
const crosshairSpread = computed(() => {
  const minSpread = 0; // No additional offset at 0 bloom
  const maxSpread = 40; // Max additional offset at 1.0 bloom (increased for visibility)
  const spread = minSpread + (bloomPercent.value * maxSpread);
  return spread;
});

// Weapon debug panel state
const showWeaponDebug = ref(false);
const weaponDebugPosition = ref({ x: 0, y: 0, z: 0 });
const weaponDebugRotation = ref({ x: 0, y: 0, z: 0 });

// Keyboard handlers
function handleKeyDown(e: KeyboardEvent) {
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

function handleKeyUp(e: KeyboardEvent) {
  // Reserved for future use
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

// Initialize session when mounted
onMounted(async () => {
  if (!canvasRef.value) return;
  
  await session.init(canvasRef.value, {
    roomId: 'shooting_range_1',
    isMobile: false
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

/* Bloom Debug Display */
.bloom-debug {
  position: absolute;
  top: 100px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: #00ff88;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  pointer-events: none;
  z-index: 1000;
}

.bloom-debug div {
  margin: 2px 0;
}
</style>
