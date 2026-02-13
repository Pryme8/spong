<template>
  <div v-if="visible" class="camera-debug-panel">
    <div class="panel-header">
      <h3>Camera Debug (FPS)</h3>
      <button @click="$emit('close')" class="close-btn">×</button>
    </div>

    <div class="panel-content">
      <div class="section">
        <p class="hint">Adjust first-person camera. Base height = 1.1 (inside head). Forward = move along look direction.</p>
      </div>

      <div class="section">
        <h4>Offset</h4>
        <div class="control-group">
          <label>Height (Y):</label>
          <input type="range" min="-0.5" max="0.5" step="0.01" v-model.number="offsetY" @input="apply" />
          <input type="number" step="0.01" v-model.number="offsetY" @input="apply" class="number-input" />
        </div>
        <div class="control-group">
          <label>Forward:</label>
          <input type="range" min="-1" max="1" step="0.01" v-model.number="offsetForward" @input="apply" />
          <input type="number" step="0.01" v-model.number="offsetForward" @input="apply" class="number-input" />
        </div>
      </div>

      <div class="section">
        <button @click="reset" class="action-btn">Reset (0, 0)</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  getOffset: () => { y: number; forward: number };
  setOffset: (y: number, forward: number) => void;
}>();

defineEmits<{ (e: 'close'): void }>();

const offsetY = ref(0);
const offsetForward = ref(0);

function apply() {
  props.setOffset(offsetY.value, offsetForward.value);
}

function reset() {
  offsetY.value = 0;
  offsetForward.value = 0;
  apply();
}

watch(() => props.visible, (visible) => {
  if (visible) {
    const o = props.getOffset();
    offsetY.value = o.y;
    offsetForward.value = o.forward;
  }
}, { immediate: true });
</script>

<style scoped>
.camera-debug-panel {
  position: fixed;
  top: 50%;
  left: 20px;
  transform: translateY(-50%);
  background: rgba(10, 10, 20, 0.95);
  border: 2px solid rgba(0, 255, 136, 0.5);
  border-radius: 8px;
  padding: 16px;
  min-width: 280px;
  max-width: 360px;
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

.hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #00ff88;
}

.control-group {
  display: grid;
  grid-template-columns: 70px 1fr 80px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.control-group label {
  font-size: 12px;
  font-weight: bold;
  color: #00ff88;
}

.number-input {
  width: 70px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.action-btn {
  background: rgba(0, 255, 136, 0.2);
  border: 1px solid rgba(0, 255, 136, 0.5);
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.action-btn:hover {
  background: rgba(0, 255, 136, 0.3);
}
</style>
