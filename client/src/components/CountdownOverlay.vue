<template>
  <v-overlay 
    :model-value="visible" 
    class="countdown-overlay"
    content-class="countdown-overlay__content"
    persistent
    no-click-animation
  >
    <div class="countdown-content">
      <div class="countdown-number">{{ seconds }}</div>
      <div class="countdown-text">Get Ready!</div>
    </div>
  </v-overlay>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  seconds: number;
}>();
</script>

<style scoped>
.countdown-overlay {
  background: rgba(0, 0, 0, 0.7);
  pointer-events: none;
  z-index: 9998;
}

.countdown-overlay__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.countdown-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.countdown-number {
  font-size: 140px;
  font-weight: 700;
  color: #00ff00;
  text-shadow: 
    0 0 30px rgba(0, 255, 0, 0.8),
    0 0 60px rgba(0, 255, 0, 0.5);
  animation: pulse 1s ease-in-out infinite;
  font-family: monospace;
}

.countdown-text {
  font-size: 36px;
  color: white;
  text-transform: uppercase;
  letter-spacing: 6px;
  font-weight: 300;
  opacity: 0.9;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.85;
  }
}
</style>
