<template>
  <div v-if="visible" class="scoreboard-overlay" @click="$emit('close')">
    <div class="scoreboard-container" @click.stop>
      <!-- Header -->
      <div class="scoreboard-header">
        <div class="header-title">SCOREBOARD</div>
        <div class="header-subtitle">{{ roomId }}</div>
      </div>

      <!-- Player Table -->
      <div class="scoreboard-table">
        <div class="table-header">
          <div class="col-color"></div>
          <div class="col-player">PLAYER</div>
          <div class="col-kills">KILLS</div>
          <div class="col-deaths">DEATHS</div>
          <div class="col-kd">K/D</div>
          <div class="col-ping">PING</div>
        </div>

        <div class="table-body">
          <div 
            v-for="player in sortedPlayers" 
            :key="player.entityId"
            class="table-row"
            :class="{ 'is-me': player.entityId === myEntityId }"
          >
            <div class="col-color">
              <div class="color-indicator" :style="{ backgroundColor: player.color }"></div>
            </div>
            <div class="col-player">Player#{{ player.entityId }}</div>
            <div class="col-kills">{{ player.kills }}</div>
            <div class="col-deaths">{{ player.deaths }}</div>
            <div class="col-kd">{{ calculateKD(player.kills, player.deaths) }}</div>
            <div class="col-ping">
              <span :class="getPingClass(player.entityId)">
                {{ getPing(player.entityId) }}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="scoreboard-footer">
        <div class="footer-hint">Press TAB to close</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface PlayerInfo {
  id: string;
  entityId: number;
  color: string;
  kills: number;
  deaths: number;
}

interface Props {
  visible: boolean;
  players: Map<string, PlayerInfo>;
  myEntityId: number | null;
  roomId: string | null;
  latency: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const sortedPlayers = computed(() => {
  const playerArray = Array.from(props.players.values());
  return playerArray.sort((a, b) => {
    // Sort by kills descending, then by deaths ascending
    if (b.kills !== a.kills) {
      return b.kills - a.kills;
    }
    return a.deaths - b.deaths;
  });
});

function calculateKD(kills: number, deaths: number): string {
  if (deaths === 0) {
    return kills > 0 ? kills.toFixed(2) : '0.00';
  }
  return (kills / deaths).toFixed(2);
}

function getPing(entityId: number): number {
  // For now, show own latency for self, placeholder for others
  if (entityId === props.myEntityId) {
    return Math.round(props.latency);
  }
  return Math.round(10 + Math.random() * 50); // Placeholder
}

function getPingClass(entityId: number): string {
  const ping = getPing(entityId);
  if (ping >= 120) return 'ping-bad';
  if (ping >= 60) return 'ping-ok';
  return 'ping-good';
}
</script>

<style scoped>
.scoreboard-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}

.scoreboard-container {
  width: 90%;
  max-width: 800px;
  background: rgba(10, 10, 26, 0.98);
  border: 2px solid rgba(0, 255, 136, 0.4);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.scoreboard-header {
  padding: 20px;
  background: rgba(0, 255, 136, 0.1);
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
}

.header-title {
  font-size: 28px;
  font-weight: bold;
  color: #00ff88;
  font-family: monospace;
  text-align: center;
  letter-spacing: 2px;
}

.header-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  margin-top: 4px;
  font-family: monospace;
}

.scoreboard-table {
  padding: 0;
}

.table-header {
  display: grid;
  grid-template-columns: 40px 1fr 80px 80px 80px 80px;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(0, 255, 136, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.7);
  font-family: monospace;
}

.table-body {
  max-height: 400px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 40px 1fr 80px 80px 80px 80px;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-family: monospace;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  transition: background 0.2s;
}

.table-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.table-row.is-me {
  background: rgba(0, 255, 136, 0.15);
  border-left: 3px solid #00ff88;
}

.col-color {
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-indicator {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 8px currentColor;
}

.col-player {
  display: flex;
  align-items: center;
  font-weight: 500;
}

.col-kills,
.col-deaths,
.col-kd,
.col-ping {
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-kills {
  color: #00ff88;
  font-weight: bold;
}

.col-deaths {
  color: #ff6666;
}

.col-kd {
  color: #ffaa00;
  font-weight: bold;
}

.ping-good {
  color: #00ff88;
}

.ping-ok {
  color: #ffaa00;
}

.ping-bad {
  color: #ff3333;
}

.scoreboard-footer {
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

/* Scrollbar styling */
.table-body::-webkit-scrollbar {
  width: 8px;
}

.table-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}

.table-body::-webkit-scrollbar-thumb {
  background: rgba(0, 255, 136, 0.3);
  border-radius: 4px;
}

.table-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 255, 136, 0.5);
}
</style>
