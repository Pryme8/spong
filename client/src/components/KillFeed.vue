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
        <span v-if="entry.weaponType" class="weapon-icon">
          <v-icon size="16">{{ getWeaponIcon(entry.weaponType) }}</v-icon>
          <span class="weapon-name">{{ entry.weaponType.toUpperCase() }}</span>
        </span>
        <span v-else class="weapon-icon">
          <v-icon size="16">mdi-skull</v-icon>
        </span>
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
    'shotgun': 'mdi-pistol',
    'lmg': 'mdi-pistol',
    'sniper': 'mdi-pistol',
    'assault': 'mdi-pistol',
    'rocket': 'mdi-rocket',
    'hammer': 'mdi-hammer'
  };
  return icons[weaponType] || 'mdi-pistol';
}
</script>

<style scoped>
.kill-feed {
  position: fixed;
  top: 80px;
  right: 16px;
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
  padding: 6px 12px;
  background: rgba(10, 10, 26, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 13px;
  font-family: monospace;
  backdrop-filter: blur(4px);
}

.player-name {
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.weapon-icon {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.6);
}

.weapon-name {
  font-size: 11px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.7);
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
    transform: translateX(100%);
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
