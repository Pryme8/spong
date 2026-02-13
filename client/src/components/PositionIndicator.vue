<template>
  <v-card
    class="position-indicator"
    color="rgba(10, 8, 40, 0.85)"
    elevation="4"
  >
    <v-card-text class="pa-3">
      <div class="position-label">Position</div>
      <div class="coordinate-row">
        <span class="coordinate-label x-label">X:</span>
        <span class="coordinate-value">{{ x.toFixed(2) }}</span>
      </div>
      <div class="coordinate-row">
        <span class="coordinate-label y-label">Y:</span>
        <span class="coordinate-value">{{ y.toFixed(2) }}</span>
      </div>
      <div class="coordinate-row">
        <span class="coordinate-label z-label">Z:</span>
        <span class="coordinate-value">{{ z.toFixed(2) }}</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{
  x: number;
  y: number;
  z: number;
}>();
</script>

<style scoped>
.position-indicator {
  position: fixed;
  top: 20px;
  left: 20px;
  min-width: 140px;
  border: 2px solid rgba(0, 200, 150, 0.6);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  z-index: 1000;
}

.position-label {
  font-size: 14px;
  font-weight: bold;
  color: rgba(0, 200, 150, 1);
  margin-bottom: 8px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.coordinate-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 16px;
}

.coordinate-row:last-child {
  margin-bottom: 0;
}

.coordinate-label {
  font-weight: bold;
  margin-right: 8px;
  min-width: 20px;
}

.x-label {
  color: rgba(255, 100, 100, 1);
}

.y-label {
  color: rgba(100, 255, 100, 1);
}

.z-label {
  color: rgba(100, 150, 255, 1);
}

.coordinate-value {
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
  text-align: right;
  flex: 1;
}
</style>
