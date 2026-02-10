<template>
  <v-overlay 
    :model-value="visible" 
    class="victory-overlay"
    persistent
    no-click-animation
  >
    <div class="victory-content">
      <div class="victory-title">
        {{ winner ? `${winner.name} Wins!` : 'Draw!' }}
      </div>
      
      <div v-if="winner" class="victory-score">
        <span class="kills-count">{{ winner.kills }}</span>
        <span class="kills-label">Kills</span>
      </div>
      
      <div class="victory-scores">
        <h3>Final Scores</h3>
        <div class="scores-list">
          <div 
            v-for="(score, index) in scores" 
            :key="score.entityId"
            class="score-entry"
            :class="{ 'is-winner': index === 0 }"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="name">{{ score.name }}</span>
            <span class="stats">
              <span class="kills">{{ score.kills }}K</span>
              <span class="separator">/</span>
              <span class="deaths">{{ score.deaths }}D</span>
            </span>
            <span class="kd">{{ formatKD(score.kills, score.deaths) }}</span>
          </div>
        </div>
      </div>
      
      <div class="victory-footer">
        Next round starting soon...
      </div>
    </div>
  </v-overlay>
</template>

<script setup lang="ts">
interface PlayerScore {
  entityId: number;
  name: string;
  kills: number;
  deaths: number;
}

defineProps<{
  visible: boolean;
  winner: { entityId: number; name: string; kills: number } | null;
  scores: PlayerScore[];
}>();

function formatKD(kills: number, deaths: number): string {
  if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '0.00';
  return (kills / deaths).toFixed(2);
}
</script>

<style scoped>
.victory-overlay {
  background: rgba(0, 0, 0, 0.92);
  z-index: 9997;
}

.victory-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  max-width: 700px;
  width: 90%;
}

.victory-title {
  font-size: 72px;
  font-weight: 700;
  color: #00ff00;
  text-transform: uppercase;
  text-shadow: 
    0 0 40px rgba(0, 255, 0, 0.8),
    0 0 80px rgba(0, 255, 0, 0.4);
  animation: victory-pulse 2.5s ease-in-out infinite;
  text-align: center;
  letter-spacing: 4px;
}

.victory-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.kills-count {
  font-size: 48px;
  color: #00ff00;
  font-weight: 600;
}

.kills-label {
  font-size: 18px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.victory-scores {
  background: rgba(20, 20, 30, 0.95);
  border: 2px solid rgba(0, 255, 0, 0.5);
  border-radius: 12px;
  padding: 32px;
  width: 100%;
}

.victory-scores h3 {
  color: #00ff00;
  margin: 0 0 24px 0;
  text-align: center;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.scores-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-entry {
  display: grid;
  grid-template-columns: 50px 1fr 120px 80px;
  padding: 14px 16px;
  color: white;
  border-radius: 6px;
  transition: background 0.2s;
  align-items: center;
}

.score-entry:hover {
  background: rgba(255, 255, 255, 0.05);
}

.score-entry.is-winner {
  background: rgba(0, 255, 0, 0.1);
  border: 1px solid rgba(0, 255, 0, 0.3);
}

.rank {
  color: #666;
  font-weight: 700;
  font-size: 20px;
  text-align: center;
}

.score-entry.is-winner .rank {
  color: #00ff00;
}

.name {
  font-size: 16px;
  font-weight: 500;
}

.stats {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  font-size: 14px;
}

.kills {
  color: #00ff00;
  font-weight: 600;
}

.separator {
  color: #555;
}

.deaths {
  color: #ff4444;
}

.kd {
  text-align: right;
  color: #aaa;
  font-size: 14px;
  font-family: monospace;
}

.victory-footer {
  color: #666;
  font-size: 15px;
  letter-spacing: 1px;
  animation: fade-pulse 2s ease-in-out infinite;
}

@keyframes victory-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
}

@keyframes fade-pulse {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
