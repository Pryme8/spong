# Agent B - Client Implementation Plan

## Overview

Agent A (server-side) is implementing the round system backend. Once complete, you will implement the client-side UI and state management. This document provides everything you need to build the client portion independently.

---

## What Agent A is Delivering

Agent A will modify:
1. `shared/src/protocol.ts` - New opcodes and message interfaces
2. `server/src/rooms/Room.ts` - Round state machine and score tracking

**You will receive these new network messages:**

### Opcode.RoundState (0x76)
Sent when round state changes (countdown starts, round starts, round ends, etc.)

```typescript
interface RoundStateMessage {
  phase: 'waiting' | 'countdown' | 'active' | 'ended';
  countdownSeconds?: number;  // Only present during countdown
  scores: PlayerScore[];
  config: {
    scoreLimit: number;
    timeLimit?: number;
    minPlayers: number;
  };
  winner?: { entityId: number; name: string; kills: number } | null;
}

interface PlayerScore {
  entityId: number;
  name: string;
  kills: number;
  deaths: number;
}
```

### Opcode.ScoreUpdate (0x77)
Sent when a player's score changes (incremental update)

```typescript
interface ScoreUpdateMessage {
  entityId: number;
  kills: number;
  deaths: number;
}
```

### Opcode.EntityDeath (0x23) - ALREADY EXISTS
You'll use this for the kill feed. It includes:

```typescript
interface EntityDeathMessage {
  entityId: number;  // Who died
  killerId: number;  // Who killed them
}
```

---

## Your Tasks

### Task 1: Create `useRoundState.ts` Composable

**File:** `client/src/composables/useRoundState.ts`

**Purpose:** Centralized reactive state for round system

**Requirements:**
- Track round phase, countdown, scores, winner
- Provide computed properties (sortedScores, isActive, etc.)
- Expose handlers for network messages
- Track recent kills for kill feed (last 5, auto-expire after 5 seconds)

**Implementation Template:**

```typescript
import { ref, computed } from 'vue';
import type { RoundStateMessage, ScoreUpdateMessage, PlayerScore } from '@spong/shared';

interface KillEvent {
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  timestamp: number;
}

export function useRoundState() {
  // Core state
  const phase = ref<'waiting' | 'countdown' | 'active' | 'ended'>('waiting');
  const countdownSeconds = ref<number>(0);
  const scores = ref<Map<number, PlayerScore>>(new Map());
  const winner = ref<{ entityId: number; name: string; kills: number } | null>(null);
  const recentKills = ref<KillEvent[]>([]);
  const config = ref({
    scoreLimit: 20,
    timeLimit: 300,
    minPlayers: 2,
  });
  
  // Computed properties
  const sortedScores = computed(() => {
    return Array.from(scores.value.values()).sort((a, b) => b.kills - a.kills);
  });
  
  const isWaiting = computed(() => phase.value === 'waiting');
  const isCountdown = computed(() => phase.value === 'countdown');
  const isActive = computed(() => phase.value === 'active');
  const isEnded = computed(() => phase.value === 'ended');
  
  const topPlayer = computed(() => sortedScores.value[0] || null);
  
  // Handlers
  function handleRoundState(msg: RoundStateMessage) {
    phase.value = msg.phase;
    countdownSeconds.value = msg.countdownSeconds || 0;
    winner.value = msg.winner || null;
    config.value = msg.config;
    
    // Rebuild scores map
    scores.value.clear();
    msg.scores.forEach(s => {
      scores.value.set(s.entityId, { ...s });
    });
  }
  
  function handleScoreUpdate(msg: ScoreUpdateMessage) {
    const existing = scores.value.get(msg.entityId);
    if (existing) {
      existing.kills = msg.kills;
      existing.deaths = msg.deaths;
    } else {
      // New player mid-round
      scores.value.set(msg.entityId, {
        entityId: msg.entityId,
        name: `Player ${msg.entityId}`,
        kills: msg.kills,
        deaths: msg.deaths,
      });
    }
  }
  
  function addKill(killerId: number, killerName: string, victimId: number, victimName: string) {
    const killEvent: KillEvent = {
      killerId,
      killerName,
      victimId,
      victimName,
      timestamp: Date.now(),
    };
    
    recentKills.value.push(killEvent);
    
    // Keep only last 5
    if (recentKills.value.length > 5) {
      recentKills.value.shift();
    }
    
    // Auto-expire after 5 seconds
    setTimeout(() => {
      recentKills.value = recentKills.value.filter(k => 
        Date.now() - k.timestamp < 5000
      );
    }, 5000);
  }
  
  function getPlayerName(entityId: number): string {
    return scores.value.get(entityId)?.name || `Player ${entityId}`;
  }
  
  return {
    // State
    phase,
    countdownSeconds,
    scores: sortedScores,
    winner,
    recentKills,
    config,
    
    // Computed
    isWaiting,
    isCountdown,
    isActive,
    isEnded,
    topPlayer,
    
    // Methods
    handleRoundState,
    handleScoreUpdate,
    addKill,
    getPlayerName,
  };
}
```

---

### Task 2: Wire into `useGameSession.ts`

**File:** `client/src/composables/useGameSession.ts`

**Changes needed:**

1. Import the composable (around line 10):
```typescript
import { useRoundState } from './useRoundState';
```

2. Create instance in setup (around line 50):
```typescript
const roundState = useRoundState();
```

3. Add network listeners (around line 435 where EntityDeath is handled):
```typescript
// Round state updates
networkClient.onLowFrequency(Opcode.RoundState, (payload: any) => {
  roundState.handleRoundState(payload);
});

networkClient.onLowFrequency(Opcode.ScoreUpdate, (payload: any) => {
  roundState.handleScoreUpdate(payload);
});

// Modify existing EntityDeath handler to add kill feed
networkClient.onLowFrequency(Opcode.EntityDeath, (payload: any) => {
  if (payload.entityId === myEntityId.value) {
    playerHealth.value = PLAYER_MAX_HEALTH;
    weaponSystem.clearWeapon();
  }
  
  // Add to kill feed
  const killerName = roundState.getPlayerName(payload.killerId);
  const victimName = roundState.getPlayerName(payload.entityId);
  roundState.addKill(payload.killerId, killerName, payload.entityId, victimName);
});
```

4. Expose to GameView (in return statement around line 500):
```typescript
return {
  // ... existing returns ...
  roundState,
};
```

---

### Task 3: Create `KillFeed.vue` Component

**File:** `client/src/components/KillFeed.vue`

**Purpose:** Display recent kills in top-right corner

**Design specs:**
- Position: Top-right, 20px from edge
- Max 5 entries, newest at bottom
- Each entry: "PlayerA killed PlayerB"
- Fade in when added, fade out after 5 seconds
- Semi-transparent dark background per entry
- Font: 14px, white text

**Template:**
```vue
<template>
  <div class="kill-feed">
    <transition-group name="kill-fade">
      <div 
        v-for="kill in kills" 
        :key="`${kill.killerId}-${kill.victimId}-${kill.timestamp}`"
        class="kill-entry"
      >
        <span class="killer">{{ kill.killerName }}</span>
        <span class="action">killed</span>
        <span class="victim">{{ kill.victimName }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
interface KillEvent {
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  timestamp: number;
}

defineProps<{
  kills: KillEvent[];
}>();
</script>

<style scoped>
.kill-feed {
  position: fixed;
  top: 80px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  z-index: 100;
}

.kill-entry {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
}

.killer {
  color: #00ff00;
  font-weight: bold;
}

.action {
  color: #aaa;
  margin: 0 6px;
}

.victim {
  color: #ff4444;
  font-weight: bold;
}

.kill-fade-enter-active,
.kill-fade-leave-active {
  transition: all 0.3s ease;
}

.kill-fade-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.kill-fade-leave-to {
  opacity: 0;
  transform: translateX(50px);
}
</style>
```

---

### Task 4: Create `Scoreboard.vue` Component

**File:** `client/src/components/Scoreboard.vue`

**Purpose:** Fullscreen overlay showing all player scores (shown when Tab is held)

**Design specs:**
- Fullscreen semi-transparent overlay
- Centered table
- Columns: Rank, Name, Kills, Deaths, K/D
- Sorted by kills (descending)
- Header row with column names
- Use Vuetify v-data-table or custom table

**Template:**
```vue
<template>
  <v-overlay 
    :model-value="visible" 
    class="scoreboard-overlay"
    persistent
    no-click-animation
  >
    <div class="scoreboard-container">
      <h2 class="scoreboard-title">Scoreboard</h2>
      
      <div class="scoreboard-table">
        <div class="scoreboard-header">
          <div class="col-rank">Rank</div>
          <div class="col-name">Player</div>
          <div class="col-kills">Kills</div>
          <div class="col-deaths">Deaths</div>
          <div class="col-kd">K/D</div>
        </div>
        
        <div class="scoreboard-body">
          <div 
            v-for="(score, index) in scores" 
            :key="score.entityId"
            class="scoreboard-row"
            :class="{ 'is-local': score.entityId === localEntityId }"
          >
            <div class="col-rank">{{ index + 1 }}</div>
            <div class="col-name">{{ score.name }}</div>
            <div class="col-kills">{{ score.kills }}</div>
            <div class="col-deaths">{{ score.deaths }}</div>
            <div class="col-kd">{{ formatKD(score.kills, score.deaths) }}</div>
          </div>
        </div>
      </div>
      
      <div class="scoreboard-footer">
        Press TAB to close
      </div>
    </div>
  </v-overlay>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface PlayerScore {
  entityId: number;
  name: string;
  kills: number;
  deaths: number;
}

const props = defineProps<{
  visible: boolean;
  scores: PlayerScore[];
  localEntityId?: number;
}>();

function formatKD(kills: number, deaths: number): string {
  if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '0.00';
  return (kills / deaths).toFixed(2);
}
</script>

<style scoped>
.scoreboard-overlay {
  background: rgba(0, 0, 0, 0.8);
}

.scoreboard-container {
  max-width: 800px;
  width: 90%;
}

.scoreboard-title {
  text-align: center;
  font-size: 32px;
  color: #00ff00;
  margin-bottom: 24px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.scoreboard-table {
  background: rgba(20, 20, 30, 0.95);
  border: 2px solid #00ff00;
  border-radius: 8px;
  overflow: hidden;
}

.scoreboard-header {
  display: grid;
  grid-template-columns: 80px 1fr 100px 100px 100px;
  background: rgba(0, 255, 0, 0.2);
  padding: 12px 16px;
  font-weight: bold;
  font-size: 14px;
  color: #00ff00;
  text-transform: uppercase;
}

.scoreboard-body {
  max-height: 500px;
  overflow-y: auto;
}

.scoreboard-row {
  display: grid;
  grid-template-columns: 80px 1fr 100px 100px 100px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  transition: background 0.2s;
}

.scoreboard-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.scoreboard-row.is-local {
  background: rgba(0, 255, 0, 0.15);
  font-weight: bold;
}

.col-rank {
  text-align: center;
  color: #888;
}

.col-name {
  text-align: left;
}

.col-kills,
.col-deaths,
.col-kd {
  text-align: center;
}

.col-kills {
  color: #00ff00;
}

.col-deaths {
  color: #ff4444;
}

.scoreboard-footer {
  text-align: center;
  margin-top: 16px;
  color: #888;
  font-size: 14px;
}
</style>
```

---

### Task 5: Create `CountdownOverlay.vue` Component

**File:** `client/src/components/CountdownOverlay.vue`

**Purpose:** Fullscreen countdown before round starts

**Design specs:**
- Fullscreen overlay
- Large countdown number (3, 2, 1)
- "Get Ready!" text below number
- Fade in/out transitions
- Pulse animation on number

**Template:**
```vue
<template>
  <v-overlay 
    :model-value="visible" 
    class="countdown-overlay"
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
  background: rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.countdown-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.countdown-number {
  font-size: 120px;
  font-weight: bold;
  color: #00ff00;
  text-shadow: 0 0 30px rgba(0, 255, 0, 0.8);
  animation: pulse 1s ease-in-out infinite;
}

.countdown-text {
  font-size: 32px;
  color: white;
  text-transform: uppercase;
  letter-spacing: 4px;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}
</style>
```

---

### Task 6: Create `VictoryScreen.vue` Component

**File:** `client/src/components/VictoryScreen.vue`

**Purpose:** Fullscreen victory screen when round ends

**Design specs:**
- Fullscreen overlay
- "Victory!" or winner name
- Final scores below
- "Next round in X seconds" countdown

**Template:**
```vue
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
        {{ winner.kills }} Kills
      </div>
      
      <div class="victory-scores">
        <h3>Final Scores</h3>
        <div 
          v-for="(score, index) in scores" 
          :key="score.entityId"
          class="score-entry"
        >
          <span class="rank">{{ index + 1 }}.</span>
          <span class="name">{{ score.name }}</span>
          <span class="kills">{{ score.kills }} kills</span>
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
</script>

<style scoped>
.victory-overlay {
  background: rgba(0, 0, 0, 0.9);
}

.victory-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  max-width: 600px;
}

.victory-title {
  font-size: 64px;
  font-weight: bold;
  color: #00ff00;
  text-transform: uppercase;
  text-shadow: 0 0 40px rgba(0, 255, 0, 0.8);
  animation: victory-pulse 2s ease-in-out infinite;
}

.victory-score {
  font-size: 32px;
  color: white;
}

.victory-scores {
  background: rgba(20, 20, 30, 0.9);
  border: 2px solid #00ff00;
  border-radius: 8px;
  padding: 24px;
  width: 100%;
}

.victory-scores h3 {
  color: #00ff00;
  margin-bottom: 16px;
  text-align: center;
}

.score-entry {
  display: grid;
  grid-template-columns: 40px 1fr 100px;
  padding: 8px 0;
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.score-entry:last-child {
  border-bottom: none;
}

.rank {
  color: #888;
}

.kills {
  text-align: right;
  color: #00ff00;
}

.victory-footer {
  color: #888;
  font-size: 16px;
}

@keyframes victory-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
</style>
```

---

### Task 7: Integrate into `GameView.vue`

**File:** `client/src/views/GameView.vue`

**Changes needed:**

1. Import components (in `<script setup>`):
```typescript
import KillFeed from '@/components/KillFeed.vue';
import Scoreboard from '@/components/Scoreboard.vue';
import CountdownOverlay from '@/components/CountdownOverlay.vue';
import VictoryScreen from '@/components/VictoryScreen.vue';
```

2. Add keyboard listener for Tab key (scoreboard toggle):
```typescript
const showScoreboard = ref(false);

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});

function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    showScoreboard.value = true;
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    showScoreboard.value = false;
  }
}
```

3. Add components to template (after existing GameHud):
```vue
<template>
  <!-- Existing canvas and GameHud -->
  
  <!-- Round system UI -->
  <KillFeed :kills="gameSession?.roundState.recentKills.value || []" />
  
  <Scoreboard 
    :visible="showScoreboard"
    :scores="gameSession?.roundState.scores.value || []"
    :local-entity-id="gameSession?.myEntityId.value"
  />
  
  <CountdownOverlay 
    :visible="gameSession?.roundState.isCountdown.value || false"
    :seconds="gameSession?.roundState.countdownSeconds.value || 0"
  />
  
  <VictoryScreen 
    :visible="gameSession?.roundState.isEnded.value || false"
    :winner="gameSession?.roundState.winner.value"
    :scores="gameSession?.roundState.scores.value || []"
  />
</template>
```

---

### Task 8: Optional - Add Round Info to `GameHud.vue`

**File:** `client/src/components/GameHud.vue`

**Enhancement:** Show current score and round phase in HUD

Add this to the HUD template (top-center):
```vue
<div v-if="roundState" class="round-info">
  <div v-if="roundState.isActive" class="round-score">
    Score: {{ myScore.kills }} / {{ roundState.config.scoreLimit }}
  </div>
  <div v-if="roundState.isWaiting" class="round-waiting">
    Waiting for players...
  </div>
</div>
```

---

## Testing Checklist

Once implementation is complete, verify:

- [ ] Kill feed appears when player dies
- [ ] Kill feed entries fade in/out correctly
- [ ] Max 5 entries in kill feed
- [ ] Scoreboard shows on Tab press, hides on release
- [ ] Scoreboard sorts by kills (descending)
- [ ] Scoreboard highlights local player
- [ ] Countdown overlay appears before round starts
- [ ] Countdown counts down 5, 4, 3, 2, 1
- [ ] Victory screen appears when player reaches 20 kills
- [ ] Victory screen shows correct winner and final scores
- [ ] Round auto-restarts after victory screen
- [ ] Scores reset between rounds
- [ ] No console errors

---

## Common Issues & Solutions

**Issue:** Type errors on Opcode enum
**Solution:** Make sure Agent A has committed `protocol.ts` changes. Check that opcodes 0x76 and 0x77 exist.

**Issue:** roundState is undefined in GameView
**Solution:** Verify useGameSession returns roundState in its return statement.

**Issue:** Kill feed not showing
**Solution:** Check that EntityDeath handler calls `roundState.addKill()`. Verify recentKills ref is being updated.

**Issue:** Scoreboard not closing
**Solution:** Verify both keydown AND keyup listeners are registered. Tab requires both events.

**Issue:** Countdown stuck at 0
**Solution:** Server sends countdownSeconds starting at 5 and counting down. Make sure you're reading the value from the message correctly.

---

## Estimated Time

- Task 1 (useRoundState): 30 minutes
- Task 2 (Wire into useGameSession): 15 minutes
- Task 3 (KillFeed): 30 minutes
- Task 4 (Scoreboard): 45 minutes
- Task 5 (CountdownOverlay): 20 minutes
- Task 6 (VictoryScreen): 30 minutes
- Task 7 (Integrate into GameView): 20 minutes
- Task 8 (Optional HUD): 15 minutes
- Testing & Polish: 30 minutes

**Total: 3-4 hours**

---

## Questions?

If you encounter blockers or need clarification on Agent A's implementation, check:
1. `shared/src/protocol.ts` for exact interface definitions
2. Server console logs for message format examples
3. Existing `useGameSession.ts` for network message patterns

Good luck! 🚀
