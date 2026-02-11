<template>
  <div v-if="visible" class="postprocess-debug-panel">
    <div class="panel-header">
      <h3>Post Process Debug</h3>
      <button @click="close" class="close-btn">&times;</button>
    </div>

    <div class="panel-content">
      <div class="section-header">Color Grading & Tonemapping</div>

      <!-- Exposure -->
      <div class="control-group">
        <label>Exposure</label>
        <input 
          type="range" 
          v-model.number="exposure" 
          min="0.1" 
          max="3.0" 
          step="0.05"
          @input="() => updateExposure(exposure)"
        />
        <span class="value-display">{{ exposure.toFixed(2) }}</span>
      </div>

      <!-- Contrast -->
      <div class="control-group">
        <label>Contrast</label>
        <input 
          type="range" 
          v-model.number="contrast" 
          min="0.5" 
          max="2.0" 
          step="0.05"
          @input="() => updateContrast(contrast)"
        />
        <span class="value-display">{{ contrast.toFixed(2) }}</span>
      </div>

      <!-- Saturation -->
      <div class="control-group">
        <label>Saturation</label>
        <input 
          type="range" 
          v-model.number="saturation" 
          min="0.0" 
          max="2.0" 
          step="0.05"
          @input="() => updateSaturation(saturation)"
        />
        <span class="value-display">{{ saturation.toFixed(2) }}</span>
      </div>

      <div class="section-header">Chromatic Aberration</div>

      <!-- Chromatic Aberration Strength -->
      <div class="control-group">
        <label>Aberration</label>
        <input 
          type="range" 
          v-model.number="chromaticAberration" 
          min="0.0" 
          max="10.0" 
          step="0.1"
          @input="() => updateChromaticAberration(chromaticAberration)"
        />
        <span class="value-display">{{ chromaticAberration.toFixed(1) }}</span>
      </div>

      <div class="section-header">Sharpening</div>

      <!-- Sharpening -->
      <div class="control-group">
        <label>Sharpen</label>
        <input 
          type="range" 
          v-model.number="sharpening" 
          min="0.0" 
          max="1.0" 
          step="0.01"
          @input="() => updateSharpening(sharpening)"
        />
        <span class="value-display">{{ sharpening.toFixed(2) }}</span>
      </div>

      <div class="section-header">Film Grain</div>

      <!-- Grain Intensity -->
      <div class="control-group">
        <label>Grain</label>
        <input 
          type="range" 
          v-model.number="grainIntensity" 
          min="0.0" 
          max="0.2" 
          step="0.005"
          @input="() => updateGrainIntensity(grainIntensity)"
        />
        <span class="value-display">{{ grainIntensity.toFixed(3) }}</span>
      </div>

      <div class="section-header">Pencil</div>

      <div class="control-group">
        <label>Enabled</label>
        <input 
          type="checkbox" 
          v-model="pencilEnabled"
          @change="() => updatePencilEnabled(pencilEnabled)"
        />
        <span class="value-display">{{ pencilEnabled ? 'On' : 'Off' }}</span>
      </div>

      <div class="control-group">
        <label>Edge Strength</label>
        <input 
          type="range" 
          v-model.number="pencilEdgeStrength" 
          min="0.0" 
          max="5.0" 
          step="0.05"
          @input="() => updatePencilEdgeStrength(pencilEdgeStrength)"
        />
        <span class="value-display">{{ pencilEdgeStrength.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Depth Weight</label>
        <input 
          type="range" 
          v-model.number="pencilDepthWeight" 
          min="0.0" 
          max="2.0" 
          step="0.05"
          @input="() => updatePencilDepthWeight(pencilDepthWeight)"
        />
        <span class="value-display">{{ pencilDepthWeight.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Normal Weight</label>
        <input 
          type="range" 
          v-model.number="pencilNormalWeight" 
          min="0.0" 
          max="2.0" 
          step="0.05"
          @input="() => updatePencilNormalWeight(pencilNormalWeight)"
        />
        <span class="value-display">{{ pencilNormalWeight.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Edge Threshold</label>
        <input 
          type="range" 
          v-model.number="pencilEdgeThreshold" 
          min="0.0" 
          max="1.0" 
          step="0.01"
          @input="() => updatePencilEdgeThreshold(pencilEdgeThreshold)"
        />
        <span class="value-display">{{ pencilEdgeThreshold.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Hatch Intensity</label>
        <input 
          type="range" 
          v-model.number="pencilHatchIntensity" 
          min="0.0" 
          max="1.0" 
          step="0.02"
          @input="() => updatePencilHatchIntensity(pencilHatchIntensity)"
        />
        <span class="value-display">{{ pencilHatchIntensity.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Hatch Scale</label>
        <input 
          type="range" 
          v-model.number="pencilHatchScale" 
          min="0.2" 
          max="4.0" 
          step="0.05"
          @input="() => updatePencilHatchScale(pencilHatchScale)"
        />
        <span class="value-display">{{ pencilHatchScale.toFixed(2) }}</span>
      </div>

      <div class="control-group">
        <label>Paper</label>
        <input 
          type="range" 
          v-model.number="pencilPaperIntensity" 
          min="0.0" 
          max="0.5" 
          step="0.01"
          @input="() => updatePencilPaperIntensity(pencilPaperIntensity)"
        />
        <span class="value-display">{{ pencilPaperIntensity.toFixed(2) }}</span>
      </div>

      <div class="section-header">Lighting</div>

      <!-- Directional Light Intensity -->
      <div class="control-group">
        <label>Dir Intensity</label>
        <input 
          type="range" 
          v-model.number="dirLightIntensity" 
          min="0.0" 
          max="2.0" 
          step="0.01"
          @input="() => updateDirectionalLightIntensity(dirLightIntensity)"
        />
        <span class="value-display">{{ dirLightIntensity.toFixed(2) }}</span>
      </div>

      <!-- Directional Light Color -->
      <div class="control-group">
        <label>Dir Color</label>
        <input 
          type="color" 
          v-model="dirLightColor"
          @input="() => updateDirectionalLightColor(dirLightColor)"
        />
        <span class="value-display">{{ dirLightColor.toUpperCase() }}</span>
      </div>

      <!-- Hemispheric Light Intensity -->
      <div class="control-group">
        <label>Hemi Intensity</label>
        <input 
          type="range" 
          v-model.number="hemiLightIntensity" 
          min="0.0" 
          max="2.0" 
          step="0.01"
          @input="() => updateHemisphericLightIntensity(hemiLightIntensity)"
        />
        <span class="value-display">{{ hemiLightIntensity.toFixed(2) }}</span>
      </div>

      <!-- Hemispheric Light Color -->
      <div class="control-group">
        <label>Hemi Color</label>
        <input 
          type="color" 
          v-model="hemiLightColor"
          @input="() => updateHemisphericLightColor(hemiLightColor)"
        />
        <span class="value-display">{{ hemiLightColor.toUpperCase() }}</span>
      </div>

      <!-- Hemispheric Ground Base Color -->
      <div class="control-group">
        <label>Ground Base</label>
        <input 
          type="color" 
          v-model="hemiGroundColor"
          @input="() => updateHemisphericGroundColor(hemiGroundColor)"
        />
        <span class="value-display">{{ hemiGroundColor.toUpperCase() }}</span>
      </div>

      <!-- Ambient Tint Strength -->
      <div class="control-group">
        <label>Amb Tint</label>
        <input 
          type="range" 
          v-model.number="ambientTintStrength" 
          min="0.0" 
          max="1.0" 
          step="0.01"
          @input="() => updateAmbientTintStrength(ambientTintStrength)"
        />
        <span class="value-display">{{ ambientTintStrength.toFixed(2) }}</span>
      </div>

      <!-- Ambient Min Intensity -->
      <div class="control-group">
        <label>Amb Min</label>
        <input 
          type="range" 
          v-model.number="ambientMinIntensity" 
          min="0.0" 
          max="1.0" 
          step="0.01"
          @input="() => updateAmbientMinIntensity(ambientMinIntensity)"
        />
        <span class="value-display">{{ ambientMinIntensity.toFixed(2) }}</span>
      </div>

      <!-- Ambient Max Intensity -->
      <div class="control-group">
        <label>Amb Max</label>
        <input 
          type="range" 
          v-model.number="ambientMaxIntensity" 
          min="0.0" 
          max="2.0" 
          step="0.01"
          @input="() => updateAmbientMaxIntensity(ambientMaxIntensity)"
        />
        <span class="value-display">{{ ambientMaxIntensity.toFixed(2) }}</span>
      </div>

      <div class="section-header">Presets</div>

      <!-- Quick Presets -->
      <div class="control-group">
        <label>Load Preset</label>
        <select @change="loadPreset($event)">
          <option value="">-- Select Preset --</option>
          <option value="default">Default</option>
          <option value="cinematic">Cinematic</option>
          <option value="vibrant">Vibrant</option>
          <option value="desaturated">Desaturated</option>
          <option value="highContrast">High Contrast</option>
          <option value="soft">Soft & Dreamy</option>
          <option value="sharp">Sharp & Clear</option>
          <option value="noEffects">No Effects</option>
        </select>
      </div>

      <div class="section-header">Test Health Effects</div>

      <!-- Health Percentage -->
      <div class="control-group">
        <label>Health %</label>
        <input 
          type="range" 
          v-model.number="healthPercentage" 
          min="0.0" 
          max="1.0" 
          step="0.05"
          @input="() => updateHealthPercentage(healthPercentage)"
        />
        <span class="value-display">{{ (healthPercentage * 100).toFixed(0) }}%</span>
      </div>

      <!-- Export Settings Button -->
      <div class="control-group">
        <button @click="exportSettings" class="export-btn">Copy Settings to Console</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  visible: boolean;
  updateExposure: (value: number) => void;
  updateContrast: (value: number) => void;
  updateSaturation: (value: number) => void;
  updateChromaticAberration: (value: number) => void;
  updateSharpening: (value: number) => void;
  updateGrainIntensity: (value: number) => void;
  updateHealthPercentage: (value: number) => void;
  updatePencilEnabled: (value: boolean) => void;
  updatePencilEdgeStrength: (value: number) => void;
  updatePencilDepthWeight: (value: number) => void;
  updatePencilNormalWeight: (value: number) => void;
  updatePencilEdgeThreshold: (value: number) => void;
  updatePencilHatchIntensity: (value: number) => void;
  updatePencilHatchScale: (value: number) => void;
  updatePencilPaperIntensity: (value: number) => void;
  updateDirectionalLightIntensity: (value: number) => void;
  updateDirectionalLightColor: (value: string) => void;
  updateHemisphericLightIntensity: (value: number) => void;
  updateHemisphericLightColor: (value: string) => void;
  updateHemisphericGroundColor: (value: string) => void;
  updateAmbientTintStrength: (value: number) => void;
  updateAmbientMinIntensity: (value: number) => void;
  updateAmbientMaxIntensity: (value: number) => void;
  initialValues: {
    exposure: number;
    contrast: number;
    saturation: number;
    chromaticAberration: number;
    sharpening: number;
    grainIntensity: number;
    healthPercentage: number;
    pencilEnabled: boolean;
    pencilEdgeStrength: number;
    pencilDepthWeight: number;
    pencilNormalWeight: number;
    pencilEdgeThreshold: number;
    pencilHatchIntensity: number;
    pencilHatchScale: number;
    pencilPaperIntensity: number;
    dirLightIntensity: number;
    dirLightColor: string;
    hemiLightIntensity: number;
    hemiLightColor: string;
    hemiGroundColor: string;
    ambientTintStrength: number;
    ambientMinIntensity: number;
    ambientMaxIntensity: number;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

// Local state
const exposure = ref(props.initialValues.exposure);
const contrast = ref(props.initialValues.contrast);
const saturation = ref(props.initialValues.saturation);
const chromaticAberration = ref(props.initialValues.chromaticAberration);
const sharpening = ref(props.initialValues.sharpening);
const grainIntensity = ref(props.initialValues.grainIntensity);
const healthPercentage = ref(props.initialValues.healthPercentage);
const pencilEnabled = ref(props.initialValues.pencilEnabled);
const pencilEdgeStrength = ref(props.initialValues.pencilEdgeStrength);
const pencilDepthWeight = ref(props.initialValues.pencilDepthWeight);
const pencilNormalWeight = ref(props.initialValues.pencilNormalWeight);
const pencilEdgeThreshold = ref(props.initialValues.pencilEdgeThreshold);
const pencilHatchIntensity = ref(props.initialValues.pencilHatchIntensity);
const pencilHatchScale = ref(props.initialValues.pencilHatchScale);
const pencilPaperIntensity = ref(props.initialValues.pencilPaperIntensity);
const dirLightIntensity = ref(props.initialValues.dirLightIntensity);
const dirLightColor = ref(props.initialValues.dirLightColor);
const hemiLightIntensity = ref(props.initialValues.hemiLightIntensity);
const hemiLightColor = ref(props.initialValues.hemiLightColor);
const hemiGroundColor = ref(props.initialValues.hemiGroundColor);
const ambientTintStrength = ref(props.initialValues.ambientTintStrength);
const ambientMinIntensity = ref(props.initialValues.ambientMinIntensity);
const ambientMaxIntensity = ref(props.initialValues.ambientMaxIntensity);

// Watch for external changes
watch(() => props.initialValues, (newValues) => {
  exposure.value = newValues.exposure;
  contrast.value = newValues.contrast;
  saturation.value = newValues.saturation;
  chromaticAberration.value = newValues.chromaticAberration;
  sharpening.value = newValues.sharpening;
  grainIntensity.value = newValues.grainIntensity;
  healthPercentage.value = newValues.healthPercentage;
  pencilEnabled.value = newValues.pencilEnabled;
  pencilEdgeStrength.value = newValues.pencilEdgeStrength;
  pencilDepthWeight.value = newValues.pencilDepthWeight;
  pencilNormalWeight.value = newValues.pencilNormalWeight;
  pencilEdgeThreshold.value = newValues.pencilEdgeThreshold;
  pencilHatchIntensity.value = newValues.pencilHatchIntensity;
  pencilHatchScale.value = newValues.pencilHatchScale;
  pencilPaperIntensity.value = newValues.pencilPaperIntensity;
  dirLightIntensity.value = newValues.dirLightIntensity;
  dirLightColor.value = newValues.dirLightColor;
  hemiLightIntensity.value = newValues.hemiLightIntensity;
  hemiLightColor.value = newValues.hemiLightColor;
  hemiGroundColor.value = newValues.hemiGroundColor;
  ambientTintStrength.value = newValues.ambientTintStrength;
  ambientMinIntensity.value = newValues.ambientMinIntensity;
  ambientMaxIntensity.value = newValues.ambientMaxIntensity;
}, { deep: true });

function close() {
  emit('close');
}

// Update functions that call the props methods
function updateExposure(value: number) {
  props.updateExposure(value);
}

function updateContrast(value: number) {
  props.updateContrast(value);
}

function updateSaturation(value: number) {
  props.updateSaturation(value);
}

function updateChromaticAberration(value: number) {
  props.updateChromaticAberration(value);
}

function updateSharpening(value: number) {
  props.updateSharpening(value);
}

function updateGrainIntensity(value: number) {
  props.updateGrainIntensity(value);
}

function updateHealthPercentage(value: number) {
  props.updateHealthPercentage(value);
}

function updatePencilEnabled(value: boolean) {
  props.updatePencilEnabled(value);
}

function updatePencilEdgeStrength(value: number) {
  props.updatePencilEdgeStrength(value);
}

function updatePencilDepthWeight(value: number) {
  props.updatePencilDepthWeight(value);
}

function updatePencilNormalWeight(value: number) {
  props.updatePencilNormalWeight(value);
}

function updatePencilEdgeThreshold(value: number) {
  props.updatePencilEdgeThreshold(value);
}

function updatePencilHatchIntensity(value: number) {
  props.updatePencilHatchIntensity(value);
}

function updatePencilHatchScale(value: number) {
  props.updatePencilHatchScale(value);
}

function updatePencilPaperIntensity(value: number) {
  props.updatePencilPaperIntensity(value);
}

function updateDirectionalLightIntensity(value: number) {
  props.updateDirectionalLightIntensity(value);
}

function updateDirectionalLightColor(value: string) {
  props.updateDirectionalLightColor(value);
}

function updateHemisphericLightIntensity(value: number) {
  props.updateHemisphericLightIntensity(value);
}

function updateHemisphericLightColor(value: string) {
  props.updateHemisphericLightColor(value);
}

function updateHemisphericGroundColor(value: string) {
  props.updateHemisphericGroundColor(value);
}

function updateAmbientTintStrength(value: number) {
  props.updateAmbientTintStrength(value);
}

function updateAmbientMinIntensity(value: number) {
  props.updateAmbientMinIntensity(value);
}

function updateAmbientMaxIntensity(value: number) {
  props.updateAmbientMaxIntensity(value);
}

function loadPreset(event: Event) {
  const select = event.target as HTMLSelectElement;
  const preset = select.value;
  
  const presets: Record<string, any> = {
    default: {
      exposure: 1.05,
      contrast: 1.1,
      saturation: 1.5,
      chromaticAberration: 3.1,
      sharpening: 0.29,
      grainIntensity: 0.03,
      pencilEnabled: false,
      pencilEdgeStrength: 1.2,
      pencilDepthWeight: 0.7,
      pencilNormalWeight: 0.9,
      pencilEdgeThreshold: 0.12,
      pencilHatchIntensity: 0.35,
      pencilHatchScale: 1.4,
      pencilPaperIntensity: 0.08
    },
    cinematic: {
      exposure: 0.9,
      contrast: 1.15,
      saturation: 0.95,
      chromaticAberration: 2.0,
      sharpening: 0.15,
      grainIntensity: 0.04
    },
    vibrant: {
      exposure: 1.1,
      contrast: 1.2,
      saturation: 1.3,
      chromaticAberration: 0.5,
      sharpening: 0.3,
      grainIntensity: 0.01
    },
    desaturated: {
      exposure: 1.0,
      contrast: 1.1,
      saturation: 0.6,
      chromaticAberration: 1.0,
      sharpening: 0.2,
      grainIntensity: 0.03
    },
    highContrast: {
      exposure: 1.0,
      contrast: 1.4,
      saturation: 1.1,
      chromaticAberration: 1.5,
      sharpening: 0.35,
      grainIntensity: 0.02
    },
    soft: {
      exposure: 1.05,
      contrast: 0.9,
      saturation: 1.05,
      chromaticAberration: 0.8,
      sharpening: 0.0,
      grainIntensity: 0.015
    },
    sharp: {
      exposure: 1.0,
      contrast: 1.1,
      saturation: 1.0,
      chromaticAberration: 0.5,
      sharpening: 0.5,
      grainIntensity: 0.01
    },
    noEffects: {
      exposure: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      chromaticAberration: 0.0,
      sharpening: 0.0,
      grainIntensity: 0.0
    }
  };

    if (preset && presets[preset]) {
    const p = presets[preset];
    exposure.value = p.exposure;
    contrast.value = p.contrast;
    saturation.value = p.saturation;
    chromaticAberration.value = p.chromaticAberration;
    sharpening.value = p.sharpening;
    grainIntensity.value = p.grainIntensity;
      if (p.pencilEnabled !== undefined) {
        pencilEnabled.value = p.pencilEnabled;
        pencilEdgeStrength.value = p.pencilEdgeStrength;
        pencilDepthWeight.value = p.pencilDepthWeight;
        pencilNormalWeight.value = p.pencilNormalWeight;
        pencilEdgeThreshold.value = p.pencilEdgeThreshold;
        pencilHatchIntensity.value = p.pencilHatchIntensity;
        pencilHatchScale.value = p.pencilHatchScale;
        pencilPaperIntensity.value = p.pencilPaperIntensity;
      }

    // Apply all changes
    updateExposure(exposure.value);
    updateContrast(contrast.value);
    updateSaturation(saturation.value);
    updateChromaticAberration(chromaticAberration.value);
    updateSharpening(sharpening.value);
    updateGrainIntensity(grainIntensity.value);
    if (p.pencilEnabled !== undefined) {
      updatePencilEnabled(pencilEnabled.value);
      updatePencilEdgeStrength(pencilEdgeStrength.value);
      updatePencilDepthWeight(pencilDepthWeight.value);
      updatePencilNormalWeight(pencilNormalWeight.value);
      updatePencilEdgeThreshold(pencilEdgeThreshold.value);
      updatePencilHatchIntensity(pencilHatchIntensity.value);
      updatePencilHatchScale(pencilHatchScale.value);
      updatePencilPaperIntensity(pencilPaperIntensity.value);
    }
  }

  // Reset select
  select.value = '';
}

function exportSettings() {
  const settings = {
    exposure: exposure.value,
    contrast: contrast.value,
    saturation: saturation.value,
    chromaticAberration: chromaticAberration.value,
    sharpening: sharpening.value,
    grainIntensity: grainIntensity.value,
    pencilEnabled: pencilEnabled.value,
    pencilEdgeStrength: pencilEdgeStrength.value,
    pencilDepthWeight: pencilDepthWeight.value,
    pencilNormalWeight: pencilNormalWeight.value,
    pencilEdgeThreshold: pencilEdgeThreshold.value,
    pencilHatchIntensity: pencilHatchIntensity.value,
    pencilHatchScale: pencilHatchScale.value,
    pencilPaperIntensity: pencilPaperIntensity.value,
    dirLightIntensity: dirLightIntensity.value,
    dirLightColor: dirLightColor.value,
    hemiLightIntensity: hemiLightIntensity.value,
    hemiLightColor: hemiLightColor.value,
    hemiGroundColor: hemiGroundColor.value,
    ambientTintStrength: ambientTintStrength.value,
    ambientMinIntensity: ambientMinIntensity.value,
    ambientMaxIntensity: ambientMaxIntensity.value
  };
  
  console.log('──────────────────────────────────────');
  console.log('Post Process Settings:');
  console.log('──────────────────────────────────────');
  console.log(JSON.stringify(settings, null, 2));
  console.log('──────────────────────────────────────');
  console.log('Code:');
  console.log(`finalPostProcess.setExposure(${settings.exposure});`);
  console.log(`finalPostProcess.setContrast(${settings.contrast});`);
  console.log(`finalPostProcess.setSaturation(${settings.saturation});`);
  console.log(`finalPostProcess.setChromaticAberration(${settings.chromaticAberration});`);
  console.log(`finalPostProcess.setSharpening(${settings.sharpening});`);
  console.log(`finalPostProcess.setGrainIntensity(${settings.grainIntensity});`);
  console.log(`finalPostProcess.setPencilEnabled(${settings.pencilEnabled});`);
  console.log(`finalPostProcess.setPencilEdgeStrength(${settings.pencilEdgeStrength});`);
  console.log(`finalPostProcess.setPencilDepthWeight(${settings.pencilDepthWeight});`);
  console.log(`finalPostProcess.setPencilNormalWeight(${settings.pencilNormalWeight});`);
  console.log(`finalPostProcess.setPencilEdgeThreshold(${settings.pencilEdgeThreshold});`);
  console.log(`finalPostProcess.setPencilHatchIntensity(${settings.pencilHatchIntensity});`);
  console.log(`finalPostProcess.setPencilHatchScale(${settings.pencilHatchScale});`);
  console.log(`finalPostProcess.setPencilPaperIntensity(${settings.pencilPaperIntensity});`);
  console.log(`session.setDirectionalLightIntensity(${settings.dirLightIntensity});`);
  console.log(`session.setDirectionalLightColor('${settings.dirLightColor}');`);
  console.log(`session.setHemisphericLightIntensity(${settings.hemiLightIntensity});`);
  console.log(`session.setHemisphericLightColor('${settings.hemiLightColor}');`);
  console.log(`session.setHemisphericGroundColor('${settings.hemiGroundColor}');`);
  console.log(`session.setAmbientTintStrength(${settings.ambientTintStrength});`);
  console.log(`session.setAmbientMinIntensity(${settings.ambientMinIntensity});`);
  console.log(`session.setAmbientMaxIntensity(${settings.ambientMaxIntensity});`);
  console.log('──────────────────────────────────────');
  
  alert('Settings exported to console (F12)');
}
</script>

<style scoped>
.postprocess-debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 320px;
  max-height: 90vh;
  background-color: rgba(0, 0, 0, 0.85);
  color: #fff;
  border: 2px solid #555;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  z-index: 10000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: rgba(40, 40, 40, 0.95);
  border-bottom: 1px solid #555;
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: bold;
  color: #66ccff;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ff6666;
}

.panel-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.section-header {
  margin-top: 16px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #444;
  font-weight: bold;
  color: #88ddff;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-header:first-child {
  margin-top: 0;
}

.control-group {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.control-group label {
  color: #ccc;
  font-size: 11px;
}

.control-group input[type="range"] {
  width: 100%;
}

.control-group select {
  width: 100%;
  background-color: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px;
  font-size: 11px;
  font-family: 'Courier New', monospace;
}

.control-group select:hover {
  border-color: #66ccff;
}

.value-display {
  min-width: 55px;
  text-align: right;
  color: #ffdd66;
  font-weight: bold;
  font-size: 11px;
}

.export-btn {
  grid-column: 1 / -1;
  padding: 8px 12px;
  background-color: #2a5a8a;
  color: #fff;
  border: 1px solid #3a7aba;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  transition: background-color 0.2s;
}

.export-btn:hover {
  background-color: #3a7aba;
}

.export-btn:active {
  background-color: #1a4a6a;
}

/* Scrollbar styling */
.panel-content::-webkit-scrollbar {
  width: 8px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>
