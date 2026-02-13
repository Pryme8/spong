<template>
  <div v-if="visible" class="water-debug-panel">
    <div class="panel-header">
      <h3>Water Debug</h3>
      <button @click="close" class="close-btn">&times;</button>
    </div>

    <div class="panel-content">
      <!-- Sampling Mode -->
      <div class="control-group">
        <label>Sampling Mode</label>
        <select v-model.number="samplingMode" @change="updateSamplingMode">
          <option :value="1">NEAREST (1)</option>
          <option :value="2">BILINEAR / LINEAR_LINEAR_MIPNEAREST (2)</option>
          <option :value="3">TRILINEAR / LINEAR_LINEAR_MIPLINEAR (3)</option>
          <option :value="4">LINEAR_NEAREST_MIPNEAREST (4)</option>
          <option :value="5">LINEAR_NEAREST_MIPLINEAR (5)</option>
          <option :value="6">NEAREST_NEAREST (6)</option>
          <option :value="7">NEAREST_LINEAR (7)</option>
          <option :value="8">NEAREST_NEAREST_MIPLINEAR (8)</option>
          <option :value="9">NEAREST_NEAREST_MIPNEAREST (9)</option>
          <option :value="10">NEAREST_LINEAR_MIPNEAREST (10)</option>
          <option :value="11">NEAREST_LINEAR_MIPLINEAR (11)</option>
          <option :value="12">LINEAR_LINEAR (12)</option>
        </select>
      </div>

      <div class="section-header">Water Properties</div>

      <!-- Alpha -->
      <div class="control-group">
        <label>Alpha</label>
        <input type="range" v-model.number="alpha" min="0" max="1" step="0.01" @input="updateAlpha" />
        <span class="value-display">{{ alpha.toFixed(2) }}</span>
      </div>

      <!-- Water Level -->
      <div class="control-group">
        <label>Water Level Y</label>
        <input type="range" v-model.number="waterLevelY" min="-25" max="0" step="0.5" @input="updateWaterLevel" />
        <span class="value-display">{{ waterLevelY.toFixed(1) }}</span>
      </div>

      <!-- Shore Fade Distance -->
      <div class="control-group">
        <label>Shore Fade (Blur)</label>
        <input type="range" v-model.number="shoreFadeDist" min="1" max="30" step="0.5" @input="updateBlurRadius" />
        <span class="value-display">{{ shoreFadeDist.toFixed(1) }}</span>
      </div>

      <div class="section-header">Wave Pattern</div>

      <!-- Wave 1 Frequency -->
      <div class="control-group">
        <label>Wave 1 Freq</label>
        <input type="range" v-model.number="primaryFreq1" min="0.5" max="10" step="0.1" @input="updateShader" />
        <span class="value-display">{{ primaryFreq1.toFixed(1) }}</span>
      </div>

      <!-- Wave 1 Speed -->
      <div class="control-group">
        <label>Wave 1 Speed</label>
        <input type="range" v-model.number="primarySpeed1" min="0" max="8" step="0.1" @input="updateShader" />
        <span class="value-display">{{ primarySpeed1.toFixed(1) }}</span>
      </div>

      <!-- Wave 2 Frequency -->
      <div class="control-group">
        <label>Wave 2 Freq</label>
        <input type="range" v-model.number="primaryFreq2" min="0.5" max="10" step="0.1" @input="updateShader" />
        <span class="value-display">{{ primaryFreq2.toFixed(1) }}</span>
      </div>

      <!-- Wave 2 Speed -->
      <div class="control-group">
        <label>Wave 2 Speed</label>
        <input type="range" v-model.number="primarySpeed2" min="0" max="8" step="0.1" @input="updateShader" />
        <span class="value-display">{{ primarySpeed2.toFixed(1) }}</span>
      </div>

      <!-- Wave Mix -->
      <div class="control-group">
        <label>Wave Mix</label>
        <input type="range" v-model.number="primaryMix" min="0" max="1" step="0.01" @input="updateShader" />
        <span class="value-display">{{ primaryMix.toFixed(2) }}</span>
      </div>

      <!-- Wave Strength -->
      <div class="control-group">
        <label>Wave Strength</label>
        <input type="range" v-model.number="primaryStrength" min="0" max="2" step="0.05" @input="updateShader" />
        <span class="value-display">{{ primaryStrength.toFixed(2) }}</span>
      </div>

      <!-- Noise Scale -->
      <div class="control-group">
        <label>Noise Distortion</label>
        <input type="range" v-model.number="noiseScale" min="0.01" max="1" step="0.01" @input="updateShader" />
        <span class="value-display">{{ noiseScale.toFixed(2) }}</span>
      </div>

      <div class="section-header">Global Wind (Affects Water + Foliage)</div>

      <!-- Wind Direction X -->
      <div class="control-group">
        <label>Wind Dir X</label>
        <input type="range" v-model.number="windDirX" min="-1" max="1" step="0.05" @input="updateWind" />
        <span class="value-display">{{ windDirX.toFixed(2) }}</span>
      </div>

      <!-- Wind Direction Z -->
      <div class="control-group">
        <label>Wind Dir Z</label>
        <input type="range" v-model.number="windDirZ" min="-1" max="1" step="0.05" @input="updateWind" />
        <span class="value-display">{{ windDirZ.toFixed(2) }}</span>
      </div>

      <!-- Wind Speed -->
      <div class="control-group">
        <label>Wind Speed</label>
        <input type="range" v-model.number="windSpeed" min="0" max="2" step="0.05" @input="updateWind" />
        <span class="value-display">{{ windSpeed.toFixed(2) }}</span>
      </div>

      <!-- Wind Strength -->
      <div class="control-group">
        <label>Wind Strength (Foliage)</label>
        <input type="range" v-model.number="windStrength" min="0" max="3" step="0.1" @input="updateWind" />
        <span class="value-display">{{ windStrength.toFixed(1) }}</span>
      </div>

      <div class="section-header">Open Water (Cellular)</div>

      <!-- Cell Scale -->
      <div class="control-group">
        <label>Cell Scale</label>
        <input type="range" v-model.number="cellScale" min="0.1" max="3.0" step="0.1" @input="updateShader" />
        <span class="value-display">{{ cellScale.toFixed(1) }}</span>
      </div>

      <!-- Cell Strength -->
      <div class="control-group">
        <label>Cell Strength</label>
        <input type="range" v-model.number="cellStrength" min="0" max="2" step="0.05" @input="updateShader" />
        <span class="value-display">{{ cellStrength.toFixed(2) }}</span>
      </div>

      <!-- Export Config -->
      <div class="control-group">
        <button @click="exportConfig" class="export-btn">Copy Config to Clipboard</button>
      </div>

      <!-- Reset Button -->
      <div class="control-group">
        <button @click="resetToDefaults" class="reset-btn">Reset to Defaults</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { LevelWaterManager } from '../engine/managers/LevelWaterManager';
import { World } from '../engine/core/World';

const visible = ref(true);

// Sampling mode
const samplingMode = ref(1);

// Material
const alpha = ref(0.7);
const waterLevelY = ref(-14);

// Wave parameters
const primaryFreq1 = ref(1.1);
const primarySpeed1 = ref(1.6);
const primaryFreq2 = ref(3.5);
const primarySpeed2 = ref(1.8);
const primaryMix = ref(0.6);
const shoreFadeDist = ref(6.0);
const primaryStrength = ref(0.85);
const flowSpeed = ref(0.5);
const noiseScale = ref(0.1);

// Wind (global, affects water + foliage)
const windDirX = ref(1.0);
const windDirZ = ref(0.5);
const windSpeed = ref(0.3);
const windStrength = ref(1.0);

// Cellular waves (water only)
const cellScale = ref(0.5);
const cellStrength = ref(0.5);

function getWaterManager() {
  return LevelWaterManager.getInstance();
}

function updateSamplingMode() {
  const wm = getWaterManager();
  if (wm) {
    wm.setSamplingMode(samplingMode.value);
  }
}

function updateAlpha() {
  const wm = getWaterManager();
  const mat = wm?.getMaterial();
  if (mat) {
    mat.alpha = alpha.value;
  }
}

function updateWaterLevel() {
  const wm = getWaterManager();
  const mat = wm?.getMaterial();
  const mesh = wm?.getMesh();
  if (mat) {
    mat.getEffect()?.setFloat('wLevel', waterLevelY.value);
  }
  if (mesh) {
    mesh.position.y = waterLevelY.value - 0.1;
  }
}

function updateBlurRadius() {
  const wm = getWaterManager();
  if (!wm) return;
  
  // Update blur radius and regenerate texture
  wm.params.shoreFade = shoreFadeDist.value;
  wm.refreshHeightTexture();
  console.log(`[WaterDebug] Regenerating texture with blur radius ${shoreFadeDist.value}`);
}

function updateWind() {
  const world = World.getInstance();
  world.wind.directionX = windDirX.value;
  world.wind.directionZ = windDirZ.value;
  world.wind.speed = windSpeed.value;
  world.wind.strength = windStrength.value;
  console.log(`[WaterDebug] Updated global wind: dir=(${windDirX.value}, ${windDirZ.value}), speed=${windSpeed.value}, strength=${windStrength.value}`);
}

function updateShader() {
  const wm = getWaterManager();
  if (!wm) return;

  // Write to params object
  const p = wm.params;
  p.pFreq1 = primaryFreq1.value;
  p.pSpeed1 = primarySpeed1.value;
  p.pFreq2 = primaryFreq2.value;
  p.pSpeed2 = primarySpeed2.value;
  p.pMix = primaryMix.value;
  p.pStr = primaryStrength.value;
  p.flowSpeed = flowSpeed.value;
  p.noiseScale = noiseScale.value;
  p.cellScale = cellScale.value;
  p.cellStrength = cellStrength.value;

  // Params are now set - onBindObservable will push them to GPU on next render
  console.log(`[WaterDebug] Updated cellScale to ${p.cellScale}`);
}

function resetToDefaults() {
  samplingMode.value = 1;
  alpha.value = 0.7;
  waterLevelY.value = -14;
  primaryFreq1.value = 1.1;
  primarySpeed1.value = 1.6;
  primaryFreq2.value = 3.5;
  primarySpeed2.value = 1.8;
  primaryMix.value = 0.6;
  shoreFadeDist.value = 6.0;
  primaryStrength.value = 0.85;
  flowSpeed.value = 0.5;
  noiseScale.value = 0.1;
  windDirX.value = 1.0;
  windDirZ.value = 0.5;
  windSpeed.value = 0.3;
  windStrength.value = 1.0;
  cellScale.value = 0.5;
  cellStrength.value = 0.5;

  updateSamplingMode();
  updateAlpha();
  updateWaterLevel();
  updateBlurRadius();
  updateWind();
  updateShader();
  console.log('[WaterDebug] Reset to defaults');
}

function exportConfig() {
  const config = `// Water Configuration
const WATER_LEVEL_Y = ${waterLevelY.value};
alpha: ${alpha.value}
samplingMode: ${samplingMode.value}

// Shore Wave parameters
pFreq1: ${primaryFreq1.value}, pSpeed1: ${primarySpeed1.value}
pFreq2: ${primaryFreq2.value}, pSpeed2: ${primarySpeed2.value}
pMix: ${primaryMix.value}
shoreFade: ${shoreFadeDist.value}
pStr: ${primaryStrength.value}
flowSpeed: ${flowSpeed.value}
noiseScale: ${noiseScale.value}

// Global Wind (affects water + foliage)
windDirX: ${windDirX.value}, windDirZ: ${windDirZ.value}
windSpeed: ${windSpeed.value}
windStrength: ${windStrength.value}

// Open Water / Cellular
cellScale: ${cellScale.value}
cellStrength: ${cellStrength.value}`;

  navigator.clipboard.writeText(config).then(() => {
    console.log('[WaterDebug] Config copied to clipboard');
  });
}

function close() {
  visible.value = false;
}
</script>

<style scoped>
.water-debug-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 340px;
  background: rgba(10, 10, 26, 0.95);
  border: 1px solid rgba(0, 150, 255, 0.3);
  border-radius: 8px;
  color: #e0e0ff;
  font-family: 'Courier New', monospace;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 150, 255, 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(20, 20, 50, 0.8);
  border-bottom: 1px solid rgba(0, 150, 255, 0.3);
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #4da6ff;
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
  color: #4da6ff;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(0, 150, 255, 0.2);
  padding-bottom: 4px;
  margin: 16px 0 10px 0;
}

.control-group {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 11px;
  color: #4da6ff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-group input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(0, 150, 255, 0.3);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #4da6ff;
  cursor: pointer;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0, 150, 255, 0.5);
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #4da6ff;
  cursor: pointer;
  border-radius: 50%;
  border: none;
  box-shadow: 0 0 4px rgba(0, 150, 255, 0.5);
}

.control-group select {
  padding: 6px 10px;
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(0, 150, 255, 0.5);
  border-radius: 4px;
  color: #e0e0ff;
  font-size: 12px;
  cursor: pointer;
}

.control-group select:focus {
  outline: none;
  border-color: #4da6ff;
}

.value-display {
  font-size: 11px;
  color: #7c4dff;
  text-align: right;
}

.reset-btn,
.export-btn {
  width: 100%;
  padding: 10px;
  background: rgba(0, 150, 255, 0.1);
  border: 1px solid rgba(0, 150, 255, 0.5);
  border-radius: 4px;
  color: #4da6ff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reset-btn:hover,
.export-btn:hover {
  background: rgba(0, 150, 255, 0.3);
  border-color: #4da6ff;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(20, 20, 50, 0.5);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 150, 255, 0.3);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 150, 255, 0.5);
}
</style>
