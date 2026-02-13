<template>
  <div v-if="visible" class="world-debug-panel">
    <div class="panel-header">
      <h3>World Debug</h3>
      <button @click="close" class="close-btn">&times;</button>
    </div>

    <div class="panel-content">
      <div class="section-header">Global Wind</div>

      <!-- Wind Direction X -->
      <div class="control-group">
        <label>Wind Dir X <span class="value-display">{{ windDirX.toFixed(2) }}</span></label>
        <input type="range" v-model.number="windDirX" min="-1" max="1" step="0.05" @input="updateWind" />
      </div>

      <!-- Wind Direction Z -->
      <div class="control-group">
        <label>Wind Dir Z <span class="value-display">{{ windDirZ.toFixed(2) }}</span></label>
        <input type="range" v-model.number="windDirZ" min="-1" max="1" step="0.05" @input="updateWind" />
      </div>

      <!-- Wind Speed -->
      <div class="control-group">
        <label>Wind Speed <span class="value-display">{{ windSpeed.toFixed(2) }}</span></label>
        <input type="range" v-model.number="windSpeed" min="0" max="2" step="0.05" @input="updateWind" />
      </div>

      <!-- Wind Strength -->
      <div class="control-group">
        <label>Wind Strength <span class="value-display">{{ windStrength.toFixed(1) }}</span></label>
        <input type="range" v-model.number="windStrength" min="0" max="3" step="0.1" @input="updateWind" />
      </div>

      <div class="section-header">Sun Direction</div>

      <!-- Sun Elevation -->
      <div class="control-group">
        <label>Sun Elevation <span class="value-display">{{ sunElevation.toFixed(1) }}°</span></label>
        <input type="range" v-model.number="sunElevation" min="0" max="90" step="1" @input="updateSun" />
      </div>

      <!-- Sun Azimuth -->
      <div class="control-group">
        <label>Sun Azimuth <span class="value-display">{{ sunAzimuth.toFixed(1) }}°</span></label>
        <input type="range" v-model.number="sunAzimuth" min="0" max="360" step="5" @input="updateSun" />
      </div>

      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Game Time:</span>
          <span class="info-value">{{ gameTime.toFixed(2) }}s</span>
        </div>
        <div class="info-row">
          <span class="info-label">Sun Dir:</span>
          <span class="info-value">({{ sunDirX.toFixed(2) }}, {{ sunDirY.toFixed(2) }}, {{ sunDirZ.toFixed(2) }})</span>
        </div>
        <div class="info-row">
          <span class="info-label">Wind Dir:</span>
          <span class="info-value">({{ windDirX.toFixed(2) }}, {{ windDirZ.toFixed(2) }})</span>
        </div>
      </div>

      <!-- Reset Button -->
      <div class="control-group">
        <button @click="resetToDefaults" class="reset-btn">Reset to Defaults</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { World } from '../engine/core/World';

const visible = ref(true);

// Wind params
const windDirX = ref(1.0);
const windDirZ = ref(0.5);
const windSpeed = ref(0.3);
const windStrength = ref(1.0);

// Sun params
const sunElevation = ref(45);
const sunAzimuth = ref(135);
const sunDirX = ref(0.5);
const sunDirY = ref(1.0);
const sunDirZ = ref(0.3);

// Time
const gameTime = ref(0);

let updateInterval: number | null = null;

onMounted(() => {
  const world = World.getInstance();
  
  // Load initial values from World
  windDirX.value = world.wind.directionX;
  windDirZ.value = world.wind.directionZ;
  windSpeed.value = world.wind.speed;
  windStrength.value = world.wind.strength;
  
  sunElevation.value = world.sun.elevation;
  sunAzimuth.value = world.sun.azimuth;
  sunDirX.value = world.sun.directionX;
  sunDirY.value = world.sun.directionY;
  sunDirZ.value = world.sun.directionZ;
  
  gameTime.value = world.gameTime;
  
  // Update display every 100ms
  updateInterval = window.setInterval(() => {
    const world = World.getInstance();
    gameTime.value = world.gameTime;
    sunDirX.value = world.sun.directionX;
    sunDirY.value = world.sun.directionY;
    sunDirZ.value = world.sun.directionZ;
  }, 100);
  
  console.log('[WorldDebugPanel] Mounted');
});

onUnmounted(() => {
  if (updateInterval !== null) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
});

function updateWind() {
  const world = World.getInstance();
  world.wind.directionX = windDirX.value;
  world.wind.directionZ = windDirZ.value;
  world.wind.speed = windSpeed.value;
  world.wind.strength = windStrength.value;
  console.log(`[WorldDebug] Updated wind: dir=(${windDirX.value.toFixed(2)}, ${windDirZ.value.toFixed(2)}), speed=${windSpeed.value.toFixed(2)}, strength=${windStrength.value.toFixed(1)}`);
}

function updateSun() {
  const world = World.getInstance();
  world.setSunFromAngles(sunElevation.value, sunAzimuth.value);
  sunDirX.value = world.sun.directionX;
  sunDirY.value = world.sun.directionY;
  sunDirZ.value = world.sun.directionZ;
}

function resetToDefaults() {
  windDirX.value = 1.0;
  windDirZ.value = 0.5;
  windSpeed.value = 0.3;
  windStrength.value = 1.0;
  sunElevation.value = 45;
  sunAzimuth.value = 135;
  
  updateWind();
  updateSun();
  console.log('[WorldDebug] Reset to defaults');
}

function close() {
  visible.value = false;
}
</script>

<style scoped>
.world-debug-panel {
  position: fixed;
  top: 20px;
  left: 20px;
  width: 320px;
  background: rgba(10, 10, 26, 0.95);
  border: 1px solid rgba(100, 255, 150, 0.3);
  border-radius: 8px;
  color: #e0ffe0;
  font-family: 'Courier New', monospace;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(100, 255, 150, 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(20, 40, 20, 0.8);
  border-bottom: 1px solid rgba(100, 255, 150, 0.3);
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #66ff99;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.close-btn {
  background: none;
  border: none;
  color: #ff1744;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 20px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ff4569;
}

.panel-content {
  padding: 16px;
  max-height: 75vh;
  overflow-y: auto;
}

.section-header {
  font-size: 11px;
  color: #66ff99;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(100, 255, 150, 0.2);
  padding-bottom: 4px;
  margin: 16px 0 10px 0;
}

.section-header:first-child {
  margin-top: 0;
}

.control-group {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 11px;
  color: #66ff99;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-group input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(100, 255, 150, 0.3);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #66ff99;
  cursor: pointer;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(100, 255, 150, 0.5);
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #66ff99;
  cursor: pointer;
  border-radius: 50%;
  border: none;
  box-shadow: 0 0 4px rgba(100, 255, 150, 0.5);
}

.value-display {
  font-size: 11px;
  color: #99ffbb;
  font-weight: bold;
}

.info-section {
  background: rgba(20, 40, 20, 0.5);
  border: 1px solid rgba(100, 255, 150, 0.2);
  border-radius: 4px;
  padding: 12px;
  margin: 16px 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 11px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #66ff99;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  color: #99ffbb;
  font-weight: bold;
}

.reset-btn {
  width: 100%;
  padding: 10px;
  background: rgba(100, 255, 150, 0.1);
  border: 1px solid rgba(100, 255, 150, 0.5);
  border-radius: 4px;
  color: #66ff99;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reset-btn:hover {
  background: rgba(100, 255, 150, 0.3);
  border-color: #66ff99;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(20, 40, 20, 0.5);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(100, 255, 150, 0.3);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 255, 150, 0.5);
}
</style>
