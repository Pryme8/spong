import { ref, computed } from 'vue';
import type { RoundStateMessage, ScoreUpdateMessage, PlayerScore } from '@spong/shared';

interface KillEvent {
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  timestamp: number;
  isSuicide: boolean;
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
    const isSuicide = killerId === victimId;
    
    const killEvent: KillEvent = {
      killerId,
      killerName,
      victimId,
      victimName,
      timestamp: Date.now(),
      isSuicide,
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
  
  function getPlayerScore(entityId: number): PlayerScore | undefined {
    return scores.value.get(entityId);
  }
  
  function formatKD(kills: number, deaths: number): string {
    if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '0.00';
    return (kills / deaths).toFixed(2);
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
    getPlayerScore,
    formatKD,
  };
}
