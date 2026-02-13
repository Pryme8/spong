import type { World, Entity } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_HEALTH,
  COMP_STATS,
  COMP_COLLECTED,
  COMP_WEAPON_TYPE,
  Opcode,
  type PlayerComponent,
  type HealthComponent,
  type StatsComponent,
  type CollectedComponent,
  type WeaponTypeComponent,
  type KillFeedMessage,
  type RoundStateMessage,
  type PlayerScore,
} from '@spong/shared';

export interface RoundSystemOptions {
  world: World;
  broadcast: (opcode: number, msg: unknown) => void;
  getActivePlayerEntities: () => Entity[];
  getPlayerColor: (entityId: number) => string | undefined;
}

export interface RoundConfig {
  scoreLimit: number;
  timeLimit?: number;
  minPlayers: number;
}

/**
 * Server-side round/game-mode system. Owns round state, countdown, scores, win condition.
 * Room calls checkRoundStart (e.g. on join/end), handleKill/checkWinCondition on kills, and getRoundStateMessage for broadcast.
 */
export class RoundSystem {
  private readonly world: World;
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly getActivePlayerEntities: () => Entity[];
  private readonly getPlayerColor: (entityId: number) => string | undefined;

  phase: 'waiting' | 'countdown' | 'active' | 'ended' = 'waiting';
  scores = new Map<number, PlayerScore>();
  countdownTimer?: NodeJS.Timeout;
  countdownSeconds = 0;
  roundStartTime?: number;
  config: RoundConfig = {
    scoreLimit: 20,
    timeLimit: 300,
    minPlayers: 2,
  };

  constructor(options: RoundSystemOptions) {
    this.world = options.world;
    this.broadcast = options.broadcast;
    this.getActivePlayerEntities = options.getActivePlayerEntities;
    this.getPlayerColor = options.getPlayerColor;
  }

  checkRoundStart(): void {
    if (this.phase !== 'waiting') return;
    const playerCount = this.getActivePlayerEntities().length;
    if (playerCount >= this.config.minPlayers) this.startCountdown();
  }

  startCountdown(): void {
    this.phase = 'countdown';
    this.countdownSeconds = 5;
    this.broadcastRoundState();
    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      this.broadcastRoundState();
      if (this.countdownSeconds <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.startRound();
      }
    }, 1000);
  }

  startRound(): void {
    this.phase = 'active';
    this.roundStartTime = Date.now();
    this.scores.clear();
    for (const entity of this.getActivePlayerEntities()) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (pc) {
        this.scores.set(entity.id, {
          entityId: entity.id,
          name: `Player ${entity.id}`,
          kills: 0,
          deaths: 0,
        });
      }
    }
    for (const entity of this.getActivePlayerEntities()) {
      const health = entity.get<HealthComponent>(COMP_HEALTH);
      if (health) health.current = health.max;
    }
    this.broadcastRoundState();
  }

  handleKill(killerId: number, victimId: number, weaponType: string | null = null, isHeadshot = false): void {
    const killerEntity = this.world.getEntity(killerId);
    const victimEntity = this.world.getEntity(victimId);
    if (killerEntity && victimEntity) {
      const killerStats = killerEntity.get<StatsComponent>(COMP_STATS);
      const victimStats = victimEntity.get<StatsComponent>(COMP_STATS);
      if (killerStats) killerStats.kills++;
      if (victimStats) victimStats.deaths++;
      if (!weaponType) {
        const killerCollected = killerEntity.get<CollectedComponent>(COMP_COLLECTED);
        if (killerCollected?.items.length) {
          const weaponEntity = this.world.getEntity(killerCollected.items[0]);
          const wt = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
          if (wt) weaponType = wt.type;
        }
      }
      const killerColor = this.getPlayerColor(killerId);
      const victimColor = this.getPlayerColor(victimId);
      if (killerColor !== undefined && victimColor !== undefined) {
        const killFeedMsg: KillFeedMessage = {
          killerEntityId: killerId,
          killerColor,
          victimEntityId: victimId,
          victimColor,
          weaponType: weaponType ?? null,
          isHeadshot,
          timestamp: Date.now(),
        };
        this.broadcast(Opcode.KillFeed, killFeedMsg);
      }
    }
    const killerScore = this.scores.get(killerId);
    if (killerScore) {
      killerScore.kills++;
      this.broadcast(Opcode.ScoreUpdate, { entityId: killerId, kills: killerScore.kills, deaths: killerScore.deaths });
    }
    const victimScore = this.scores.get(victimId);
    if (victimScore) {
      victimScore.deaths++;
      this.broadcast(Opcode.ScoreUpdate, { entityId: victimId, kills: victimScore.kills, deaths: victimScore.deaths });
    }
  }

  trackDamage(attackerId: number, damage: number): void {
    const e = this.world.getEntity(attackerId);
    const stats = e?.get<StatsComponent>(COMP_STATS);
    if (stats) stats.damageDealt += damage;
  }

  trackShotFired(shooterId: number): void {
    const e = this.world.getEntity(shooterId);
    const stats = e?.get<StatsComponent>(COMP_STATS);
    if (stats) stats.shotsFired++;
  }

  trackShotHit(shooterId: number): void {
    const e = this.world.getEntity(shooterId);
    const stats = e?.get<StatsComponent>(COMP_STATS);
    if (stats) stats.shotsHit++;
  }

  checkWinCondition(): void {
    if (this.phase !== 'active') return;
    const scores = Array.from(this.scores.values());
    const topScore = Math.max(...scores.map((s) => s.kills), 0);
    if (topScore >= this.config.scoreLimit) {
      this.endRound();
      return;
    }
    if (this.config.timeLimit && this.roundStartTime) {
      const elapsed = (Date.now() - this.roundStartTime) * 0.001;
      if (elapsed >= this.config.timeLimit) this.endRound();
    }
  }

  endRound(): void {
    this.phase = 'ended';
    this.broadcastRoundState();
    setTimeout(() => {
      this.phase = 'waiting';
      this.roundStartTime = undefined;
      this.checkRoundStart();
    }, 10000);
  }

  getRoundStateMessage(): RoundStateMessage {
    const scores = Array.from(this.scores.values()).sort((a, b) => b.kills - a.kills);
    return {
      phase: this.phase,
      countdownSeconds: this.countdownSeconds > 0 ? this.countdownSeconds : undefined,
      scores,
      config: this.config,
      winner:
        this.phase === 'ended' && scores[0]
          ? { entityId: scores[0].entityId, name: scores[0].name, kills: scores[0].kills }
          : undefined,
    };
  }

  broadcastRoundState(): void {
    this.broadcast(Opcode.RoundState, this.getRoundStateMessage());
  }

  /** Clear countdown timer and set phase to waiting (e.g. when too few players or room dispose). */
  cancelCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    this.phase = 'waiting';
    this.roundStartTime = undefined;
    this.broadcastRoundState();
  }
}
