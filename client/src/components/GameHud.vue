<template>
  <div class="game-hud">
    <!-- Kill Feed -->
    <KillFeed v-if="isInRoom" :entries="killFeedEntries" />
    
    <!-- Hit Marker (white X when you hit someone) -->
    <div v-if="hitMarkerVisible" class="hit-marker">
      <div class="hit-marker-line hit-marker-line-1"></div>
      <div class="hit-marker-line hit-marker-line-2"></div>
    </div>
    
    <!-- Combined Status Bars -->
    <div v-if="isInRoom" class="status-bars-overlay">
      <v-card class="status-bars-card" variant="flat">
        <v-card-text class="pa-2">
          <!-- Health Bar -->
          <div class="bar-container">
            <div 
              class="health-bar" 
              :class="healthBarClass"
              :style="{ width: healthPercent + '%' }"
            ></div>
          </div>

          <!-- Armor Bar (only show if player has armor) -->
          <div v-if="playerArmor > 0" class="bar-container" :class="{ 'has-helmet': playerHelmetHealth > 0 }">
            <div 
              class="armor-bar"
              :style="{ width: armorPercent + '%' }"
            ></div>
          </div>

          <!-- Stamina Bar -->
          <div class="bar-container">
            <div 
              class="stamina-bar" 
              :class="staminaBarClass"
              :style="{ width: staminaPercent + '%' }"
            ></div>
          </div>

          <!-- Breath Bar (show whenever in water to see status) -->
          <div v-if="playerIsInWater" class="bar-container">
            <div 
              class="breath-bar" 
              :class="breathBarClass"
              :style="{ width: breathPercent + '%' }"
            ></div>
          </div>

          <!-- Materials Bar (only show if player has hammer) -->
          <div v-if="hasHammer" class="bar-container">
            <div 
              class="materials-bar"
              :style="{ width: materialsPercent + '%' }"
            ></div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Build Panel (below status bars) -->
      <v-card v-if="hasHammer" class="build-panel-card" variant="flat">
        <v-card-text class="pa-2">
          <!-- Mode Icons -->
          <div class="build-modes">
            <div class="build-mode-icon" :class="{ active: buildMode === 'select' }">
              <span class="mode-number">1</span>
              <v-icon size="18">mdi-cursor-default</v-icon>
            </div>
            <div class="build-mode-icon" :class="{ active: buildMode === 'build' }">
              <span class="mode-number">2</span>
              <v-icon size="18">mdi-cube-outline</v-icon>
            </div>
            <div class="build-mode-icon" :class="{ active: buildMode === 'transform' }">
              <span class="mode-number">3</span>
              <v-icon size="18">mdi-axis-arrow</v-icon>
            </div>
            <div class="build-mode-icon" :class="{ active: buildMode === 'demolish' }">
              <span class="mode-number">4</span>
              <v-icon size="18">mdi-delete</v-icon>
            </div>
          </div>

          <!-- Mode Instructions -->
          <div class="build-instructions">
            <template v-if="buildMode === 'select'">
              <div class="instruction-text">SELECT: Left-click grid | Right-click deselect</div>
              <div class="instruction-hint">1-4: Switch modes | [/]: Change color</div>
            </template>
            <template v-else-if="buildMode === 'build'">
              <div class="instruction-text">BUILD: Left-click place | Right-click remove</div>
              <div class="instruction-hint" v-if="buildSelectedGridId">Editing grid #{{ buildSelectedGridId }}</div>
              <div class="instruction-hint" v-else>Creating new grid | Hold Right-click: disable snap</div>
            </template>
            <template v-else-if="buildMode === 'transform'">
              <div class="instruction-text">TRANSFORM: Drag gizmos to move/rotate</div>
              <div class="instruction-hint" v-if="buildSelectedGridId">Editing grid #{{ buildSelectedGridId }}</div>
              <div class="instruction-hint" v-else>Select a grid first (mode 1)</div>
            </template>
            <template v-else-if="buildMode === 'demolish'">
              <div class="instruction-text">DEMOLISH: Hold left-click 3s to destroy</div>
              <div class="instruction-hint">Warning: This deletes the entire grid!</div>
            </template>
          </div>

          <!-- Color Indicator -->
          <div v-if="buildMode === 'build'" class="build-color-indicator">
            <div class="color-box" :style="{ backgroundColor: buildColorHex }"></div>
            <span class="color-text">Color {{ buildColorIndex + 1 }}/16</span>
          </div>

          <!-- Materials Counter -->
          <div class="build-materials">
            <v-icon size="16" color="#ffaa00">mdi-cube</v-icon>
            <span class="materials-text">{{ playerMaterials }} / 500</span>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Ladder Panel (below build panel area) -->
    <div v-if="hasLadder" class="ladder-panel-overlay">
      <v-card class="ladder-panel-card" variant="flat">
        <v-card-text class="pa-2">
          <div class="ladder-indicator">
            <v-icon size="18" color="#8B6914">mdi-ladder</v-icon>
            <span class="ladder-text">LADDER - Right-click wall to place</span>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Demolish Progress Spinner (center of screen) -->
    <div v-if="hasHammer && buildMode === 'demolish' && buildDemolishProgress > 0" class="demolish-progress-overlay">
      <svg class="demolish-spinner" width="100" height="100">
        <circle 
          cx="50" 
          cy="50" 
          r="40" 
          stroke="#ff0000" 
          stroke-width="6" 
          fill="none" 
          :stroke-dasharray="circleCircumference" 
          :stroke-dashoffset="circleDashOffset"
          transform="rotate(-90 50 50)"
        />
      </svg>
    </div>

    <!-- Lag simulation indicator (debug URL param ?latency= or ?lag=) -->
    <div v-if="(simulatedLatencyMs ?? 0) > 0" class="lag-sim-overlay">
      <span class="lag-sim-label">Lag sim:</span>
      <span class="lag-sim-value">{{ simulatedLatencyMs }} ms</span>
    </div>

    <!-- Ammo Counter -->
    <div v-if="isInRoom && hasWeapon" class="ammo-overlay">
      <v-card class="ammo-card" variant="flat">
        <v-card-text class="pa-3">
          <div class="weapon-indicator">
            <v-icon size="24" color="#ffaa00">mdi-pistol</v-icon>
            <div class="weapon-name">{{ weaponType?.toUpperCase() }}</div>
          </div>
          <div class="ammo-count">
            {{ currentAmmo }}
          </div>
          <div v-if="maxCapacity > 0" class="ammo-capacity">
            / {{ maxCapacity }}
          </div>
          <div v-if="isReloading" class="reload-indicator">
            <div class="reload-bar" :style="{ width: reloadProgress + '%' }"></div>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import KillFeed from './KillFeed.vue';
import type { KillFeedEntry } from './KillFeed.vue';

interface Props {
  title?: string;
  isConnected: boolean;
  isInRoom: boolean;
  roomId: string | null;
  myEntityId: number | null;
  players: Map<string, any>;
  killFeedEntries: KillFeedEntry[];
  playerHealth: number;
  maxHealth: number;
  playerArmor: number;
  playerHelmetHealth: number;
  playerStamina: number;
  playerIsExhausted: boolean;
  playerHasInfiniteStamina: boolean;
  playerBreathRemaining: number;
  playerMaxBreath: number;
  playerIsUnderwater: boolean;
  playerIsInWater: boolean;
  hasWeapon: boolean;
  weaponType: string | null;
  currentAmmo: number;
  maxCapacity: number;
  isReloading: boolean;
  reloadProgress: number;
  latency: number;
  pingColorClass: string;
  /** Simulated one-way latency in ms from URL (?latency= or ?lag=). 0 = off. */
  simulatedLatencyMs?: number;
  hitMarkerVisible?: boolean;
  // Build system props
  hasHammer?: boolean;
  hasLadder?: boolean;
  buildMode?: string;
  buildSelectedGridId?: number | null;
  buildColorIndex?: number;
  buildDemolishProgress?: number;
  playerMaterials?: number;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Game Session',
});

const healthPercent = computed(() => {
  return Math.max(0, Math.min(100, (props.playerHealth / props.maxHealth) * 100));
});

const healthBarClass = computed(() => {
  const percent = healthPercent.value;
  if (percent > 70) return 'health-high';
  if (percent > 40) return 'health-medium';
  return 'health-low';
});

const armorPercent = computed(() => {
  // Armor max is 50, so scale to percentage
  return Math.max(0, Math.min(100, (props.playerArmor / 50) * 100));
});

const staminaPercent = computed(() => {
  return Math.max(0, Math.min(100, props.playerStamina));
});

const staminaBarClass = computed(() => {
  if (props.playerHasInfiniteStamina) {
    return 'stamina-infinite';
  }
  if (props.playerIsExhausted) {
    return 'stamina-exhausted';
  }
  return 'stamina-normal';
});

const breathPercent = computed(() => {
  return Math.max(0, Math.min(100, (props.playerBreathRemaining / props.playerMaxBreath) * 100));
});

const breathBarClass = computed(() => {
  const percent = breathPercent.value;
  if (percent > 50) return 'breath-normal';
  if (percent > 20) return 'breath-low';
  return 'breath-critical';
});

// Build system computed properties
const COLOR_PALETTE = [
  '#ffffff', '#808080', '#333333', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff', '#804020',
  '#ffc0cc', '#008000', '#800000', '#000080'
];

const buildColorHex = computed(() => {
  const index = props.buildColorIndex || 0;
  return COLOR_PALETTE[index] || '#ffffff';
});

const circleCircumference = 2 * Math.PI * 40; // radius = 40

const circleDashOffset = computed(() => {
  const progress = props.buildDemolishProgress || 0;
  return circleCircumference * (1 - progress);
});

const materialsPercent = computed(() => {
  const materials = props.playerMaterials || 0;
  return Math.max(0, Math.min(100, (materials / 500) * 100));
});
</script>

<style scoped>
.game-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

/* Lag simulation indicator */
.lag-sim-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  font-size: 12px;
  color: #ffaa00;
}
.lag-sim-label { margin-right: 6px; }
.lag-sim-value { font-weight: 600; }

/* Hit Marker */
.hit-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: hit-marker-fade 0.25s ease-out;
}

.hit-marker-line {
  position: absolute;
  width: 100%;
  height: 1px;
  background: white;
}

.hit-marker-line-1 {
  top: 50%;
  left: 0;
  transform: translateY(-50%) rotate(45deg) scaleY(0.25);
}

.hit-marker-line-2 {
  top: 50%;
  left: 0;
  transform: translateY(-50%) rotate(-45deg) scaleY(0.25);
}

@keyframes hit-marker-fade {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.5);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* Combined Status Bars */
.status-bars-overlay {
  position: absolute;
  top: 16px;
  right: 16px;
  pointer-events: none;
}

.status-bars-card {
  background: rgba(10, 10, 26, 0.95) !important;
  border: 1px solid rgba(100, 100, 150, 0.4);
  border-radius: 4px;
  min-width: 220px;
  pointer-events: auto;
}

.bar-container {
  width: 100%;
  height: 10px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.bar-container:last-child {
  margin-bottom: 0;
}

/* Health Bar */
.health-bar {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  box-shadow: 0 0 8px currentColor;
}

.health-high {
  background: linear-gradient(90deg, #00ff88 0%, #00cc66 100%);
  color: #00ff88;
}

.health-medium {
  background: linear-gradient(90deg, #ffaa00 0%, #ff8800 100%);
  color: #ffaa00;
}

.health-low {
  background: linear-gradient(90deg, #ff3333 0%, #cc0000 100%);
  color: #ff3333;
  animation: health-pulse 1s ease-in-out infinite;
}

@keyframes health-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Armor Bar */
.armor-bar {
  height: 100%;
  background: linear-gradient(90deg, #c8aa82 0%, #a08860 100%);
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(200, 170, 130, 0.6);
}

/* Armor bar with helmet - white outline */
.bar-container.has-helmet {
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

/* Stamina Bar */
.stamina-bar {
  height: 100%;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px currentColor;
}

.stamina-normal {
  background: linear-gradient(90deg, #ffdd00 0%, #ccaa00 100%);
  color: #ffdd00;
}

.stamina-exhausted {
  background: linear-gradient(90deg, #ff3333 0%, #ffdd00 100%);
  color: #ff3333;
  animation: stamina-exhausted-blink 0.5s ease-in-out infinite;
}

.stamina-infinite {
  background: linear-gradient(90deg, #ffffff 0%, #ffdd00 100%);
  color: #ffffff;
  animation: stamina-infinite-blink 0.8s ease-in-out infinite;
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
}

@keyframes stamina-exhausted-blink {
  0%, 100% {
    background: linear-gradient(90deg, #ff3333 0%, #ffdd00 100%);
  }
  50% {
    background: linear-gradient(90deg, #ffdd00 0%, #ff3333 100%);
  }
}

@keyframes stamina-infinite-blink {
  0%, 100% {
    background: linear-gradient(90deg, #ffffff 0%, #ffdd00 100%);
  }
  50% {
    background: linear-gradient(90deg, #ffdd00 0%, #ffffff 100%);
  }
}

/* Breath Bar */
.breath-bar {
  height: 100%;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px currentColor;
}

.breath-normal {
  background: linear-gradient(90deg, #00ccff 0%, #0088cc 100%);
  color: #00ccff;
}

.breath-low {
  background: linear-gradient(90deg, #ffaa00 0%, #ff8800 100%);
  color: #ffaa00;
  animation: breath-warning 1s ease-in-out infinite;
}

.breath-critical {
  background: linear-gradient(90deg, #ff3333 0%, #cc0000 100%);
  color: #ff3333;
  animation: breath-critical 0.5s ease-in-out infinite;
}

@keyframes breath-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes breath-critical {
  0%, 100% { 
    opacity: 1;
    box-shadow: 0 0 8px #ff3333;
  }
  50% { 
    opacity: 0.4;
    box-shadow: 0 0 16px #ff3333;
  }
}

/* Materials Bar */
.materials-bar {
  height: 100%;
  background: linear-gradient(90deg, #cc7700, #ffaa00);
  border-radius: 2px;
  transition: width 0.3s ease-out;
}

/* Ammo Counter */
.ammo-overlay {
  position: absolute;
  top: 80px;
  right: 16px;
  pointer-events: none;
}

.ammo-card {
  background: rgba(20, 20, 50, 0.9) !important;
  border: 2px solid rgba(255, 170, 0, 0.5);
  min-width: 200px;
  pointer-events: auto;
}

.weapon-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.weapon-name {
  color: #ffaa00;
  font-size: 0.875rem;
  font-weight: bold;
  font-family: monospace;
  text-transform: uppercase;
}

.ammo-count {
  color: #ffaa00;
  font-size: 2rem;
  font-weight: bold;
  line-height: 1;
  font-family: monospace;
}

.ammo-capacity {
  color: rgba(255, 170, 0, 0.6);
  font-size: 1rem;
  font-family: monospace;
}

.reload-indicator {
  margin-top: 8px;
  height: 4px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  overflow: hidden;
}

.reload-bar {
  height: 100%;
  background: linear-gradient(90deg, #ff6600, #ffaa00);
  transition: width 0.1s linear;
}

/* Build Panel Styles */
.build-panel-card {
  background: rgba(10, 10, 26, 0.95) !important;
  border: 1px solid rgba(255, 200, 0, 0.4);
  border-radius: 4px;
  margin-top: 8px;
  pointer-events: auto;
}

.ladder-panel-overlay {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
}

.ladder-panel-card {
  background: rgba(10, 10, 26, 0.95) !important;
  border: 1px solid rgba(139, 105, 20, 0.6);
  border-radius: 4px;
  pointer-events: auto;
}

.ladder-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ladder-text {
  color: #d4a850;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.build-modes {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.build-mode-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  opacity: 0.5;
  transition: all 0.2s;
}

.build-mode-icon.active {
  opacity: 1;
  border-color: rgba(255, 200, 0, 0.8);
  background: rgba(255, 200, 0, 0.2);
}

.mode-number {
  font-size: 0.7rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2px;
}

.build-instructions {
  margin-bottom: 8px;
}

.instruction-text {
  font-size: 0.85rem;
  font-weight: bold;
  color: #ffaa00;
  margin-bottom: 2px;
}

.instruction-hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}

.build-color-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-box {
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 2px;
}

.color-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.build-materials {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.materials-text {
  font-size: 0.85rem;
  font-weight: bold;
  color: #ffaa00;
}

/* Demolish Progress Spinner */
.demolish-progress-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.demolish-spinner {
  filter: drop-shadow(0 0 8px rgba(255, 0, 0, 0.8));
}
</style>
