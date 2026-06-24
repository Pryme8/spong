<template>
  <div v-if="visible" class="latency-debug-panel">
    <div class="panel-header">
      <h3>Latency Validation</h3>
      <button @click="$emit('close')" class="close-btn">×</button>
    </div>
    <div class="panel-content">
      <p class="hint">Client prediction validation. Reload with simulated one-way latency. RTT ≈ 2× value.</p>
      <div class="presets">
        <button
          v-for="ms in presets"
          :key="ms"
          class="preset-btn"
          :class="{ active: currentMs === ms }"
          @click="applyLatency(ms)"
        >
          {{ ms === 0 ? 'Off' : ms + ' ms' }}
        </button>
      </div>
      <p class="tip">Test: no rubber-banding on building blocks, smooth movement at each preset.</p>

      <div class="stats">
        <div class="stat-row"><span>Pred error (avg)</span><b>{{ stats.avgErrorUnits.toFixed(3) }} u</b></div>
        <div class="stat-row"><span>Pred error (last)</span><b>{{ stats.lastErrorUnits.toFixed(3) }} u</b></div>
        <div class="stat-row"><span>Corrections/s</span><b>{{ stats.correctionsPerSec }}</b></div>
        <div class="stat-row"><span>Unacked inputs</span><b>{{ stats.unackedInputs }}</b></div>
      </div>

      <button class="preset-btn toggle" @click="toggleReconcile">
        Reconciliation: {{ reconcileOn ? 'ON (server-auth)' : 'OFF (client-auth)' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { LocalTransform } from '../engine/core/LocalTransform';

const props = defineProps<{
  visible: boolean;
  currentLatencyMs: number;
}>();

defineEmits<{ (e: 'close'): void }>();

const presets = [0, 50, 100, 200];

const currentMs = computed(() => props.currentLatencyMs);

const stats = reactive({ lastErrorUnits: 0, avgErrorUnits: 0, correctionsPerSec: 0, unackedInputs: 0 });
const reconcileOn = ref(LocalTransform.ReconciliationEnabled);
let rafId = 0;

function pump() {
  const s = LocalTransform.NetStats;
  stats.lastErrorUnits = s.lastErrorUnits;
  stats.avgErrorUnits = s.avgErrorUnits;
  stats.correctionsPerSec = s.correctionsPerSec;
  stats.unackedInputs = s.unackedInputs;
  reconcileOn.value = LocalTransform.ReconciliationEnabled;
  rafId = requestAnimationFrame(pump);
}

onMounted(() => { rafId = requestAnimationFrame(pump); });
onUnmounted(() => cancelAnimationFrame(rafId));

function toggleReconcile() {
  LocalTransform.ReconciliationEnabled = !LocalTransform.ReconciliationEnabled;
  reconcileOn.value = LocalTransform.ReconciliationEnabled;
}

function applyLatency(ms: number) {
  const url = new URL(window.location.href);
  if (ms === 0) {
    url.searchParams.delete('latency');
    url.searchParams.delete('lag');
  } else {
    url.searchParams.set('latency', String(ms));
  }
  window.location.href = url.toString();
}
</script>

<style scoped>
.latency-debug-panel {
  position: fixed;
  top: 50%;
  right: 20px;
  transform: translateY(-50%);
  background: rgba(10, 10, 20, 0.95);
  border: 2px solid rgba(255, 170, 0, 0.5);
  border-radius: 8px;
  padding: 16px;
  min-width: 220px;
  z-index: 1000;
  font-family: 'Courier New', monospace;
  color: #ffaa00;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 170, 0, 0.3);
  padding-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.close-btn {
  background: none;
  border: none;
  color: #ffaa00;
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
  gap: 12px;
}

.hint {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 8px 14px;
  background: rgba(255, 170, 0, 0.15);
  border: 1px solid rgba(255, 170, 0, 0.4);
  border-radius: 4px;
  color: #ffaa00;
  font-size: 12px;
  cursor: pointer;
}

.preset-btn:hover {
  background: rgba(255, 170, 0, 0.25);
}

.preset-btn.active {
  background: rgba(255, 170, 0, 0.35);
  border-color: rgba(255, 170, 0, 0.7);
}

.tip {
  margin: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px solid rgba(255, 170, 0, 0.3);
  padding-top: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.stat-row b {
  color: #ffaa00;
}

.preset-btn.toggle {
  width: 100%;
  text-align: center;
}
</style>
