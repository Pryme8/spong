<template>
  <div v-if="visible" class="shadow-debug-panel">
    <div class="panel-header">
      <h3>Shadow Debug</h3>
      <button @click="close" class="close-btn">×</button>
    </div>
    
    <div class="panel-content">
      <!-- Map Size -->
      <div class="control-group">
        <label>Shadow Map Size</label>
        <select v-model.number="mapSize" @change="updateMapSize">
          <option :value="1024">1024</option>
          <option :value="2048">2048</option>
          <option :value="4096">4096</option>
          <option :value="8192">8192</option>
        </select>
        <span class="value-display">{{ mapSize }}</span>
      </div>

      <!-- Number of Cascades -->
      <div class="control-group">
        <label>Cascades</label>
        <input 
          type="range" 
          v-model.number="numCascades" 
          min="1" 
          max="4" 
          step="1"
          @input="updateCascades"
        />
        <span class="value-display">{{ numCascades }}</span>
      </div>

      <!-- Lambda (cascade distribution) -->
      <div class="control-group">
        <label>Lambda</label>
        <input 
          type="range" 
          v-model.number="lambda" 
          min="0" 
          max="1" 
          step="0.01"
          @input="updateLambda"
        />
        <span class="value-display">{{ lambda.toFixed(2) }}</span>
      </div>

      <!-- Darkness -->
      <div class="control-group">
        <label>Darkness</label>
        <input 
          type="range" 
          v-model.number="darkness" 
          min="0" 
          max="1" 
          step="0.01"
          @input="updateDarkness"
        />
        <span class="value-display">{{ darkness.toFixed(2) }}</span>
      </div>

      <!-- Bias -->
      <div class="control-group">
        <label>Bias</label>
        <input 
          type="range" 
          v-model.number="bias" 
          min="0" 
          max="0.01" 
          step="0.00001"
          @input="updateBias"
        />
        <span class="value-display">{{ bias.toFixed(5) }}</span>
      </div>

      <!-- Normal Bias -->
      <div class="control-group">
        <label>Normal Bias</label>
        <input 
          type="range" 
          v-model.number="normalBias" 
          min="0" 
          max="0.01" 
          step="0.00001"
          @input="updateNormalBias"
        />
        <span class="value-display">{{ normalBias.toFixed(5) }}</span>
      </div>

      <!-- Filtering Quality -->
      <div class="control-group">
        <label>Filter Quality</label>
        <select v-model.number="filteringQuality" @change="updateFilteringQuality">
          <option :value="0">Low</option>
          <option :value="1">Medium</option>
          <option :value="2">High</option>
        </select>
        <span class="value-display">{{ ['Low', 'Medium', 'High'][filteringQuality] }}</span>
      </div>

      <!-- Stabilize Cascades -->
      <div class="control-group">
        <label>Stabilize Cascades</label>
        <input 
          type="checkbox" 
          v-model="stabilizeCascades" 
          @change="updateStabilize"
        />
        <span class="value-display">{{ stabilizeCascades ? 'On' : 'Off' }}</span>
      </div>

      <!-- Auto Calc Shadow Z Bounds -->
      <div class="control-group">
        <label>Auto Z Bounds</label>
        <input 
          type="checkbox" 
          v-model="autoCalcShadowZBounds" 
          @change="updateAutoZBounds"
        />
        <span class="value-display">{{ autoCalcShadowZBounds ? 'On' : 'Off' }}</span>
      </div>

      <!-- Ortho Scale -->
      <div class="control-group">
        <label>Ortho Scale</label>
        <input 
          type="range" 
          v-model.number="orthoScale" 
          min="0.05" 
          max="1" 
          step="0.01"
          @input="updateOrthoScale"
        />
        <span class="value-display">{{ orthoScale.toFixed(2) }}</span>
      </div>

      <!-- Cascade Blend Percentage -->
      <div class="control-group">
        <label>Cascade Blend %</label>
        <input 
          type="range" 
          v-model.number="cascadeBlendPercentage" 
          min="0" 
          max="1" 
          step="0.01"
          @input="updateCascadeBlend"
        />
        <span class="value-display">{{ (cascadeBlendPercentage * 100).toFixed(0) }}%</span>
      </div>

      <!-- Depth Clamp -->
      <div class="control-group">
        <label>Depth Clamp</label>
        <input 
          type="checkbox" 
          v-model="depthClamp" 
          @change="updateDepthClamp"
        />
        <span class="value-display">{{ depthClamp ? 'On' : 'Off' }}</span>
      </div>

      <!-- Filter Mode -->
      <div class="control-group">
        <label>Filter Mode</label>
        <select v-model.number="filterMode" @change="updateFilterMode">
          <option :value="0">None</option>
          <option :value="1">PCF</option>
          <option :value="2">PCSS</option>
          <option :value="3">Poisson</option>
          <option :value="8">Close Exp Shadow Map</option>
          <option :value="16">Close Exp Shadow Map 2</option>
        </select>
        <span class="value-display">{{ getFilterModeName(filterMode) }}</span>
      </div>

      <!-- Contact Hardening Light Size (for PCSS) -->
      <div class="control-group" v-if="filterMode === 2">
        <label>Light Size (PCSS)</label>
        <input 
          type="range" 
          v-model.number="contactHardeningLightSizeUVRatio" 
          min="0" 
          max="0.5" 
          step="0.001"
          @input="updateContactHardening"
        />
        <span class="value-display">{{ contactHardeningLightSizeUVRatio.toFixed(3) }}</span>
      </div>

      <!-- Penumbra Ratio (for PCSS) -->
      <div class="control-group" v-if="filterMode === 2">
        <label>Penumbra Ratio</label>
        <input 
          type="range" 
          v-model.number="penumbraRatio" 
          min="0" 
          max="1" 
          step="0.01"
          @input="updatePenumbra"
        />
        <span class="value-display">{{ penumbraRatio.toFixed(2) }}</span>
      </div>

      <!-- Auto Update Extends -->
      <div class="control-group">
        <label>Auto Update Extends</label>
        <input 
          type="checkbox" 
          v-model="autoUpdateExtends" 
          @change="updateAutoExtends"
        />
        <span class="value-display">{{ autoUpdateExtends ? 'On' : 'Off' }}</span>
      </div>

      <!-- Freeze Shadow Casters -->
      <div class="control-group">
        <label>Freeze Casters</label>
        <input 
          type="checkbox" 
          v-model="freezeShadowCastersBoundingInfo" 
          @change="updateFreezeCasters"
        />
        <span class="value-display">{{ freezeShadowCastersBoundingInfo ? 'On' : 'Off' }}</span>
      </div>

      <!-- Debug Mode -->
      <div class="control-group">
        <label>Debug Cascades</label>
        <input 
          type="checkbox" 
          v-model="debug" 
          @change="updateDebugMode"
        />
        <span class="value-display">{{ debug ? 'On' : 'Off' }}</span>
      </div>

      <!-- Reset Button -->
      <div class="control-group">
        <button @click="resetToDefaults" class="reset-btn">Reset to Defaults</button>
      </div>

      <!-- Export Config -->
      <div class="control-group">
        <button @click="exportConfig" class="export-btn">Copy Config to Clipboard</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ShadowManager } from '../engine/ShadowManager';
import { CascadedShadowGenerator } from '@babylonjs/core';

const visible = ref(true);

// Shadow properties
const mapSize = ref(4096);
const numCascades = ref(4);
const lambda = ref(0.9);
const darkness = ref(0.7);
const bias = ref(0.00005);
const normalBias = ref(0.0001);
const filteringQuality = ref(2); // 0=Low, 1=Medium, 2=High
const stabilizeCascades = ref(true);
const autoCalcShadowZBounds = ref(true);
const orthoScale = ref(0.2);
const cascadeBlendPercentage = ref(0.1);
const depthClamp = ref(true);
const filterMode = ref(1); // 0=None, 1=PCF, 2=PCSS, 3=Poisson, 8=CloseExp, 16=CloseExp2
const contactHardeningLightSizeUVRatio = ref(0.1);
const penumbraRatio = ref(0.5);
const autoUpdateExtends = ref(true);
const freezeShadowCastersBoundingInfo = ref(false);
const debug = ref(false);

const defaultValues = {
  mapSize: 4096,
  numCascades: 4,
  lambda: 0.9,
  darkness: 0.7,
  bias: 0.00005,
  normalBias: 0.0001,
  filteringQuality: 2,
  stabilizeCascades: true,
  autoCalcShadowZBounds: true,
  orthoScale: 0.2,
  cascadeBlendPercentage: 0.1,
  depthClamp: true,
  filterMode: 1,
  contactHardeningLightSizeUVRatio: 0.1,
  penumbraRatio: 0.5,
  autoUpdateExtends: true,
  freezeShadowCastersBoundingInfo: false,
  debug: false
};

function getShadowGenerator() {
  const manager = ShadowManager.getInstance();
  if (!manager) {
    console.warn('[ShadowDebug] ShadowManager not initialized yet');
    return null;
  }
  return manager.getGenerator();
}

function getLight() {
  const generator = getShadowGenerator();
  if (!generator) return null;
  return generator.getShadowMap()?.getScene().getLightByName('dirLight');
}

function updateMapSize() {
  const generator = getShadowGenerator();
  if (!generator) return;
  
  // Recreate generator with new map size
  const scene = generator.getShadowMap()?.getScene();
  const light = scene?.getLightByName('dirLight');
  if (!light || !scene) return;
  
  console.log(`[ShadowDebug] Map size change requires scene recreation (${mapSize.value})`);
}

function updateCascades() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.numCascades = numCascades.value;
  }
}

function updateLambda() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.lambda = lambda.value;
  }
}

function updateDarkness() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.darkness = darkness.value;
  }
}

function updateBias() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.bias = bias.value;
  }
}

function updateNormalBias() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.normalBias = normalBias.value;
  }
}

function updateFilteringQuality() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.filteringQuality = filteringQuality.value;
  }
}

function updateStabilize() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.stabilizeCascades = stabilizeCascades.value;
  }
}

function updateAutoZBounds() {
  const light = getLight();
  if (light && 'autoCalcShadowZBounds' in light) {
    (light as any).autoCalcShadowZBounds = autoCalcShadowZBounds.value;
  }
}

function updateOrthoScale() {
  const light = getLight();
  if (light && 'shadowOrthoScale' in light) {
    (light as any).shadowOrthoScale = orthoScale.value;
  }
}

function updateCascadeBlend() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.cascadeBlendPercentage = cascadeBlendPercentage.value;
  }
}

function updateDepthClamp() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.depthClamp = depthClamp.value;
  }
}

function updateFilterMode() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.filter = filterMode.value;
  }
}

function updateContactHardening() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.contactHardeningLightSizeUVRatio = contactHardeningLightSizeUVRatio.value;
  }
}

function updatePenumbra() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.penumbraRatio = penumbraRatio.value;
  }
}

function updateAutoExtends() {
  const light = getLight();
  if (light && 'autoUpdateExtends' in light) {
    (light as any).autoUpdateExtends = autoUpdateExtends.value;
  }
}

function updateFreezeCasters() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.freezeShadowCastersBoundingInfo = freezeShadowCastersBoundingInfo.value;
  }
}

function updateDebugMode() {
  const generator = getShadowGenerator();
  if (generator) {
    generator.debug = debug.value;
  }
}

function getFilterModeName(mode: number): string {
  const names: Record<number, string> = {
    0: 'None',
    1: 'PCF',
    2: 'PCSS',
    3: 'Poisson',
    8: 'Close Exp',
    16: 'Close Exp 2'
  };
  return names[mode] || 'Unknown';
}

function resetToDefaults() {
  mapSize.value = defaultValues.mapSize;
  numCascades.value = defaultValues.numCascades;
  lambda.value = defaultValues.lambda;
  darkness.value = defaultValues.darkness;
  bias.value = defaultValues.bias;
  normalBias.value = defaultValues.normalBias;
  filteringQuality.value = defaultValues.filteringQuality;
  stabilizeCascades.value = defaultValues.stabilizeCascades;
  autoCalcShadowZBounds.value = defaultValues.autoCalcShadowZBounds;
  orthoScale.value = defaultValues.orthoScale;
  cascadeBlendPercentage.value = defaultValues.cascadeBlendPercentage;
  depthClamp.value = defaultValues.depthClamp;
  filterMode.value = defaultValues.filterMode;
  contactHardeningLightSizeUVRatio.value = defaultValues.contactHardeningLightSizeUVRatio;
  penumbraRatio.value = defaultValues.penumbraRatio;
  autoUpdateExtends.value = defaultValues.autoUpdateExtends;
  freezeShadowCastersBoundingInfo.value = defaultValues.freezeShadowCastersBoundingInfo;
  debug.value = defaultValues.debug;
  
  // Apply all updates
  updateCascades();
  updateLambda();
  updateDarkness();
  updateBias();
  updateNormalBias();
  updateFilteringQuality();
  updateStabilize();
  updateAutoZBounds();
  updateOrthoScale();
  updateCascadeBlend();
  updateDepthClamp();
  updateFilterMode();
  updateContactHardening();
  updatePenumbra();
  updateAutoExtends();
  updateFreezeCasters();
  updateDebugMode();
  
  console.log('[ShadowDebug] Reset to defaults');
}

function exportConfig() {
  const config = {
    mapSize: mapSize.value,
    numCascades: numCascades.value,
    lambda: lambda.value,
    darkness: darkness.value,
    bias: bias.value,
    normalBias: normalBias.value,
    filteringQuality: filteringQuality.value,
    stabilizeCascades: stabilizeCascades.value,
    autoCalcShadowZBounds: autoCalcShadowZBounds.value,
    orthoScale: orthoScale.value,
    cascadeBlendPercentage: cascadeBlendPercentage.value,
    depthClamp: depthClamp.value,
    filterMode: filterMode.value,
    contactHardeningLightSizeUVRatio: contactHardeningLightSizeUVRatio.value,
    penumbraRatio: penumbraRatio.value,
    autoUpdateExtends: autoUpdateExtends.value,
    freezeShadowCastersBoundingInfo: freezeShadowCastersBoundingInfo.value,
    debug: debug.value
  };
  
  const configCode = `// Shadow Configuration
shadowGenerator.numCascades = ${config.numCascades};
shadowGenerator.stabilizeCascades = ${config.stabilizeCascades};
shadowGenerator.lambda = ${config.lambda};
shadowGenerator.filteringQuality = ${config.filteringQuality};
shadowGenerator.darkness = ${config.darkness};
shadowGenerator.bias = ${config.bias};
shadowGenerator.normalBias = ${config.normalBias};
shadowGenerator.cascadeBlendPercentage = ${config.cascadeBlendPercentage};
shadowGenerator.depthClamp = ${config.depthClamp};
shadowGenerator.filter = ${config.filterMode}; // ${getFilterModeName(config.filterMode)}
shadowGenerator.contactHardeningLightSizeUVRatio = ${config.contactHardeningLightSizeUVRatio};
shadowGenerator.penumbraRatio = ${config.penumbraRatio};
shadowGenerator.freezeShadowCastersBoundingInfo = ${config.freezeShadowCastersBoundingInfo};
shadowGenerator.debug = ${config.debug};

// Light Configuration
dirLight.shadowOrthoScale = ${config.orthoScale};
dirLight.autoUpdateExtends = ${config.autoUpdateExtends};
dirLight.autoCalcShadowZBounds = ${config.autoCalcShadowZBounds};`;

  navigator.clipboard.writeText(configCode).then(() => {
    console.log('[ShadowDebug] Configuration copied to clipboard');
    alert('Shadow configuration copied to clipboard!');
  }).catch(err => {
    console.error('[ShadowDebug] Failed to copy:', err);
    alert('Failed to copy configuration');
  });
}

function close() {
  visible.value = false;
}

onMounted(() => {
  // Load current values from shadow generator if available
  const generator = getShadowGenerator();
  const light = getLight();
  
  if (generator) {
    numCascades.value = generator.numCascades;
    lambda.value = generator.lambda;
    darkness.value = generator.darkness;
    bias.value = generator.bias;
    normalBias.value = generator.normalBias;
    filteringQuality.value = generator.filteringQuality;
    stabilizeCascades.value = generator.stabilizeCascades;
    cascadeBlendPercentage.value = generator.cascadeBlendPercentage;
    depthClamp.value = generator.depthClamp;
    filterMode.value = generator.filter;
    contactHardeningLightSizeUVRatio.value = generator.contactHardeningLightSizeUVRatio;
    penumbraRatio.value = generator.penumbraRatio;
    freezeShadowCastersBoundingInfo.value = generator.freezeShadowCastersBoundingInfo;
    debug.value = generator.debug;
  }
  
  if (light && 'autoCalcShadowZBounds' in light) {
    autoCalcShadowZBounds.value = (light as any).autoCalcShadowZBounds;
    orthoScale.value = (light as any).shadowOrthoScale;
    autoUpdateExtends.value = (light as any).autoUpdateExtends;
  }
});
</script>

<style scoped>
.shadow-debug-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(10, 10, 26, 0.95);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 8px;
  color: #e0e0ff;
  font-family: 'Courier New', monospace;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 255, 136, 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(20, 20, 50, 0.8);
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #00ff88;
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
  max-height: 70vh;
  overflow-y: auto;
}

.control-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-group label {
  font-size: 12px;
  color: #00ff88;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-group input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(124, 77, 255, 0.3);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #00ff88;
  cursor: pointer;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0, 255, 136, 0.5);
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #00ff88;
  cursor: pointer;
  border-radius: 50%;
  border: none;
  box-shadow: 0 0 4px rgba(0, 255, 136, 0.5);
}

.control-group select {
  padding: 6px 10px;
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(124, 77, 255, 0.5);
  border-radius: 4px;
  color: #e0e0ff;
  font-size: 13px;
  cursor: pointer;
}

.control-group select:focus {
  outline: none;
  border-color: #00ff88;
}

.control-group input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #00ff88;
}

.value-display {
  font-size: 12px;
  color: #7c4dff;
  text-align: right;
  min-width: 60px;
}

.reset-btn,
.export-btn {
  width: 100%;
  padding: 10px;
  background: rgba(124, 77, 255, 0.2);
  border: 1px solid #7c4dff;
  border-radius: 4px;
  color: #e0e0ff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reset-btn:hover,
.export-btn:hover {
  background: rgba(124, 77, 255, 0.4);
  border-color: #00ff88;
  color: #00ff88;
}

.export-btn {
  background: rgba(0, 255, 136, 0.1);
  border-color: #00ff88;
  color: #00ff88;
}

.export-btn:hover {
  background: rgba(0, 255, 136, 0.3);
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(20, 20, 50, 0.5);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 255, 136, 0.3);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 255, 136, 0.5);
}
</style>
