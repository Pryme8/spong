<template>
  <div class="touch-controller" v-if="isMobile">
    <!-- Left D-Pad -->
    <div class="dpad-container">
      <div class="dpad">
        <!-- Forward -->
        <button 
          class="dpad-btn dpad-up"
          :class="{ active: buttonStates.forward }"
          @touchstart.prevent="() => onButtonPress('forward')"
          @touchend.prevent="() => onButtonRelease('forward')"
          @touchcancel.prevent="() => onButtonRelease('forward')"
        >
          <v-icon>mdi-chevron-up</v-icon>
        </button>
        
        <!-- Left -->
        <button 
          class="dpad-btn dpad-left"
          :class="{ active: buttonStates.left }"
          @touchstart.prevent="() => onButtonPress('left')"
          @touchend.prevent="() => onButtonRelease('left')"
          @touchcancel.prevent="() => onButtonRelease('left')"
        >
          <v-icon>mdi-chevron-left</v-icon>
        </button>
        
        <!-- Right -->
        <button 
          class="dpad-btn dpad-right"
          :class="{ active: buttonStates.right }"
          @touchstart.prevent="() => onButtonPress('right')"
          @touchend.prevent="() => onButtonRelease('right')"
          @touchcancel.prevent="() => onButtonRelease('right')"
        >
          <v-icon>mdi-chevron-right</v-icon>
        </button>
        
        <!-- Back -->
        <button 
          class="dpad-btn dpad-down"
          :class="{ active: buttonStates.back }"
          @touchstart.prevent="() => onButtonPress('back')"
          @touchend.prevent="() => onButtonRelease('back')"
          @touchcancel.prevent="() => onButtonRelease('back')"
        >
          <v-icon>mdi-chevron-down</v-icon>
        </button>
        
        <!-- Center -->
        <div class="dpad-center"></div>
      </div>
    </div>
    
    <!-- Right Action Buttons -->
    <div class="action-container">
      <button 
        class="action-btn action-a"
        :class="{ active: buttonStates.a }"
        @touchstart.prevent="() => onButtonPress('a')"
        @touchend.prevent="() => onButtonRelease('a')"
        @touchcancel.prevent="() => onButtonRelease('a')"
      >
        A
      </button>
      <button 
        class="action-btn action-b"
        :class="{ active: buttonStates.b }"
        @touchstart.prevent="() => onButtonPress('b')"
        @touchend.prevent="() => onButtonRelease('b')"
        @touchcancel.prevent="() => onButtonRelease('b')"
      >
        B
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isMobile = ref(false);

const emit = defineEmits<{
  inputChange: [forward: number, right: number, rotateLeft: boolean, rotateRight: boolean, jump: boolean]
  shoot: []
}>();

// Button state
const buttonStates = ref({
  forward: false,
  back: false,
  left: false,
  right: false,
  a: false,
  b: false
});

onMounted(() => {
  // Detect mobile device
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || window.innerWidth < 768;
});

const onButtonPress = (button: string) => {
  buttonStates.value[button] = true;
  
  // A button shoots immediately on press (once)
  if (button === 'a') {
    emit('shoot');
  }
  
  emitInputState();
};

const onButtonRelease = (button: string) => {
  buttonStates.value[button] = false;
  emitInputState();
};

const emitInputState = () => {
  let forward = 0;
  let right = 0;
  
  if (buttonStates.value.forward) forward += 1;
  if (buttonStates.value.back) forward -= 1;
  if (buttonStates.value.right) right += 1;
  if (buttonStates.value.left) right -= 1;
  
  // B button = jump
  const rotateLeft = false;
  const rotateRight = false;
  const jump = buttonStates.value.b;
  
  emit('inputChange', forward, right, rotateLeft, rotateRight, jump);
};
</script>

<style scoped>
.touch-controller {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 1000;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

/* D-Pad Container */
.dpad-container {
  pointer-events: auto;
}

.dpad {
  position: relative;
  width: 140px;
  height: 140px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  gap: 2px;
}

.dpad-btn {
  background: rgba(20, 20, 50, 0.9);
  border: 2px solid rgba(0, 255, 136, 0.6);
  color: #00ff88;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
}

.dpad-btn:active,
.dpad-btn.active {
  background: rgba(0, 255, 136, 0.3);
  box-shadow: 0 0 30px rgba(0, 255, 136, 0.6);
  border-color: #00ff88;
}

.dpad-up {
  grid-column: 2;
  grid-row: 1;
  border-radius: 8px 8px 0 0;
}

.dpad-left {
  grid-column: 1;
  grid-row: 2;
  border-radius: 8px 0 0 8px;
}

.dpad-right {
  grid-column: 3;
  grid-row: 2;
  border-radius: 0 8px 8px 0;
}

.dpad-down {
  grid-column: 2;
  grid-row: 3;
  border-radius: 0 0 8px 8px;
}

.dpad-center {
  grid-column: 2;
  grid-row: 2;
  background: rgba(10, 10, 26, 0.8);
  border: 1px solid rgba(0, 255, 136, 0.3);
  pointer-events: none;
}

/* Action Buttons */
.action-container {
  pointer-events: auto;
  display: flex;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 10px;
}

.action-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(20, 20, 50, 0.9);
  border: 3px solid rgba(124, 77, 255, 0.6);
  color: #7c4dff;
  font-size: 20px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(124, 77, 255, 0.3);
}

.action-btn:active,
.action-btn.active {
  background: rgba(124, 77, 255, 0.3);
  box-shadow: 0 0 30px rgba(124, 77, 255, 0.6);
  border-color: #7c4dff;
}

.action-a {
  margin-bottom: 0;
}

.action-b {
  margin-bottom: 10px;
}
</style>
