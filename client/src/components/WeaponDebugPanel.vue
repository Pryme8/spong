<template>
  <div v-if="visible" class="weapon-debug-panel">
    <div class="panel-header">
      <h3>Weapon Debug</h3>
      <button @click="$emit('close')" class="close-btn">×</button>
    </div>
    
    <div class="panel-content">
      <div class="section">
        <div class="label">Weapon Type:</div>
        <div class="value">{{ weaponType || 'None' }}</div>
      </div>

      <div class="section">
        <h4>Position</h4>
        <div class="control-group">
          <label>X:</label>
          <input type="range" min="-2" max="2" step="0.01" v-model.number="position.x" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="position.x" @input="updateTransform" class="number-input" />
        </div>
        <div class="control-group">
          <label>Y:</label>
          <input type="range" min="-2" max="2" step="0.01" v-model.number="position.y" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="position.y" @input="updateTransform" class="number-input" />
        </div>
        <div class="control-group">
          <label>Z:</label>
          <input type="range" min="-2" max="2" step="0.01" v-model.number="position.z" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="position.z" @input="updateTransform" class="number-input" />
        </div>
      </div>

      <div class="section">
        <h4>Rotation (radians)</h4>
        <div class="control-group">
          <label>X:</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotation.x" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="rotation.x" @input="updateTransform" class="number-input" />
        </div>
        <div class="control-group">
          <label>Y:</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotation.y" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="rotation.y" @input="updateTransform" class="number-input" />
        </div>
        <div class="control-group">
          <label>Z:</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotation.z" @input="updateTransform" />
          <input type="number" step="0.01" v-model.number="rotation.z" @input="updateTransform" class="number-input" />
        </div>
      </div>

      <div class="section">
        <button @click="resetTransform" class="action-btn">Reset</button>
        <button @click="exportValues" class="action-btn">Export Values</button>
        <button @click="disableDebugMode" class="action-btn">Disable Debug</button>
      </div>

      <div v-if="exportedCode" class="section export-section">
        <h4>Exported Code:</h4>
        <pre class="code-output">{{ exportedCode }}</pre>
        <button @click="copyToClipboard" class="action-btn">Copy to Clipboard</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  weaponType: string | null;
  initialPosition?: { x: number; y: number; z: number };
  initialRotation?: { x: number; y: number; z: number };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'transform-change', position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }): void;
  (e: 'disable-debug'): void;
}>();

const position = ref({ x: 0, y: 0, z: 0 });
const rotation = ref({ x: 0, y: 0, z: 0 });
const exportedCode = ref('');

// Initialize with props
watch(() => props.initialPosition, (val) => {
  if (val) {
    position.value = { ...val };
  }
}, { immediate: true });

watch(() => props.initialRotation, (val) => {
  if (val) {
    rotation.value = { ...val };
  }
}, { immediate: true });

function updateTransform() {
  emit('transform-change', { ...position.value }, { ...rotation.value });
}

function resetTransform() {
  position.value = { x: 0, y: 0, z: 0 };
  rotation.value = { x: 0, y: 0, z: 0 };
  updateTransform();
}

function exportValues() {
  const code = `// ${props.weaponType} hold transform
position: { x: ${position.value.x.toFixed(3)}, y: ${position.value.y.toFixed(3)}, z: ${position.value.z.toFixed(3)} }
rotation: { x: ${rotation.value.x.toFixed(3)}, y: ${rotation.value.y.toFixed(3)}, z: ${rotation.value.z.toFixed(3)} }`;
  
  exportedCode.value = code;
}

function copyToClipboard() {
  navigator.clipboard.writeText(exportedCode.value);
}

function disableDebugMode() {
  emit('disable-debug');
}
</script>

<style scoped>
.weapon-debug-panel {
  position: fixed;
  top: 50%;
  left: 20px;
  transform: translateY(-50%);
  background: rgba(10, 10, 20, 0.95);
  border: 2px solid rgba(0, 255, 136, 0.5);
  border-radius: 8px;
  padding: 16px;
  min-width: 300px;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  z-index: 1000;
  font-family: 'Courier New', monospace;
  color: #00ff88;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
  padding-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.close-btn {
  background: none;
  border: none;
  color: #00ff88;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  line-height: 1;
}

.close-btn:hover {
  color: #ff4444;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  background: rgba(0, 255, 136, 0.05);
  padding: 12px;
  border-radius: 4px;
  border: 1px solid rgba(0, 255, 136, 0.2);
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #00ff88;
}

.label {
  font-size: 12px;
  font-weight: bold;
  color: #ffaa00;
  margin-bottom: 4px;
}

.value {
  font-size: 14px;
  color: #ffffff;
}

.control-group {
  display: grid;
  grid-template-columns: 30px 1fr 80px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.control-group label {
  font-size: 12px;
  font-weight: bold;
  color: #00ff88;
}

input[type="range"] {
  width: 100%;
  accent-color: #00ff88;
}

.number-input {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #ffffff;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  width: 100%;
}

.number-input:focus {
  outline: none;
  border-color: #00ff88;
}

.action-btn {
  background: rgba(0, 255, 136, 0.2);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-right: 8px;
}

.action-btn:hover {
  background: rgba(0, 255, 136, 0.3);
}

.export-section {
  background: rgba(0, 0, 0, 0.3);
}

.code-output {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 255, 136, 0.2);
  padding: 12px;
  border-radius: 4px;
  color: #00ff88;
  font-size: 11px;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 8px 0;
}
</style>
