<template>
  <div class="kill-feed">
    <TransitionGroup name="kill-feed">
      <div 
        v-for="entry in entries" 
        :key="entry.id"
        class="kill-feed-entry"
      >
        <span class="player-name killer" :style="{ color: entry.killerColor }">
          Player#{{ entry.killerEntityId }}
        </span>
        
        <template v-if="entry.weaponType">
          <v-icon size="18" class="weapon-icon">{{ getWeaponIcon(entry.weaponType) }}</v-icon>
          <span class="weapon-name">{{ entry.weaponType.toUpperCase() }}</span>
          <v-icon v-if="entry.isHeadshot" size="20" class="headshot-icon" title="Headshot!">mdi-bullseye-arrow</v-icon>
          <!-- Debug: show raw value -->
          <span style="font-size: 10px; margin-left: 4px; opacity: 0.6;">[HS:{{ entry.isHeadshot }}]</span>
        </template>
        <v-icon v-else size="18" class="weapon-icon">mdi-skull</v-icon>
        
        <span class="player-name victim" :style="{ color: entry.victimColor }">
          Player#{{ entry.victimEntityId }}
        </span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';

export interface KillFeedEntry {
  id: number;
  killerEntityId: number;
  killerColor: string;
  victimEntityId: number;
  victimColor: string;
  weaponType: string | null;
  isHeadshot: boolean;
  timestamp: number;
}

interface Props {
  entries: KillFeedEntry[];
}

defineProps<Props>();

function getWeaponIcon(weaponType: string): string {
  const icons: Record<string, string> = {
    'pistol': 'mdi-pistol',
    'smg': 'mdi-pistol',
    'shotgun': 'mdi-shotgun',
    'lmg': 'mdi-ammunition',
    'sniper': 'mdi-crosshairs-gps',
    'assault': 'mdi-rifle',
    'rocket': 'mdi-rocket-launch',
    'hammer': 'mdi-hammer'
  };
  return icons[weaponType] || 'mdi-pistol';
}
</script>

<style scoped>
.kill-feed {
  position: fixed;
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 999;
  pointer-events: none;
}

.kill-feed-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(10, 10, 26, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.player-name {
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}

.weapon-icon {
  color: rgba(255, 255, 255, 0.8);
  margin: 0 2px;
}

.weapon-name {
  font-size: 11px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.5px;
}

.headshot-icon {
  color: #ff3333 !important;
  filter: drop-shadow(0 0 6px #ff3333);
  animation: pulse-glow 0.6s ease-out;
}

@keyframes pulse-glow {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.2);
  }
}

/* Transition animations */
.kill-feed-enter-active {
  animation: slide-in 0.3s ease-out;
}

.kill-feed-leave-active {
  animation: fade-out 0.5s ease-out;
}

@keyframes slide-in {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
