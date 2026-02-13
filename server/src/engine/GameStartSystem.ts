/**
 * Server-side game start flow: lobby → countdown → loading → playing.
 * Owns phase state, countdown/loading timers, ready set. Room does level gen between
 * enterLoadingPhase and startLoadingTimer.
 */

import { Opcode } from '@spong/shared';

export type GameStartPhase = 'lobby' | 'countdown' | 'loading' | 'playing';

export interface GameStartSystemOptions {
  /** Send a message to all connections in the room */
  broadcast: (opcode: number, msg: unknown) => void;
  getPlayerCount: () => number;
  /** Called when 3s countdown hits 0; Room should run level gen then call startLoadingTimer() */
  onCountdownComplete: () => void;
}

export class GameStartSystem {
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly getPlayerCount: () => number;
  private readonly onCountdownComplete: () => void;

  phase: GameStartPhase = 'lobby';
  countdownSeconds = 0;
  loadingSeconds = 0;
  seed: string | undefined;
  readyPlayers = new Set<string>();
  countdownTimer: ReturnType<typeof setInterval> | undefined;
  loadingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: GameStartSystemOptions) {
    this.broadcast = options.broadcast;
    this.getPlayerCount = options.getPlayerCount;
    this.onCountdownComplete = options.onCountdownComplete;
  }

  startCountdown(): boolean {
    if (this.phase !== 'lobby') {
      return false;
    }
    this.phase = 'countdown';
    this.countdownSeconds = 3;
    this.broadcastCountdown();
    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds > 0) {
        this.broadcastCountdown();
      } else {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
        this.onCountdownComplete();
      }
    }, 1000);
    return true;
  }

  cancelCountdown(): void {
    if (this.phase !== 'countdown') return;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    this.phase = 'lobby';
    this.countdownSeconds = 0;
    this.broadcast(Opcode.LobbyStartCancel, {});
  }

  private broadcastCountdown(): void {
    this.broadcast(Opcode.LobbyStartCountdown, {
      secondsRemaining: this.countdownSeconds
    });
  }

  /** Call when entering loading; Room then does level gen + GameLoading broadcast + startLoadingTimer(). */
  enterLoadingPhase(seed: string): void {
    this.phase = 'loading';
    this.loadingSeconds = 10;
    this.readyPlayers.clear();
    this.seed = seed;
  }

  /** Start the loading timer; call after Room has generated level and sent GameLoading. */
  startLoadingTimer(): void {
    this.broadcastReadyUpdate();
    this.loadingTimer = setInterval(() => {
      this.loadingSeconds--;
      this.broadcastReadyUpdate();
      if (this.loadingSeconds <= 0) {
        if (this.loadingTimer) clearInterval(this.loadingTimer);
        this.loadingTimer = undefined;
        this.startGame();
      }
    }, 1000);
  }

  broadcastReadyUpdate(): void {
    this.broadcast(Opcode.PlayersReadyUpdate, {
      readyPlayers: Array.from(this.readyPlayers),
      totalPlayers: this.getPlayerCount(),
      secondsRemaining: this.loadingSeconds
    });
  }

  markPlayerReady(playerId: string): boolean {
    if (this.phase !== 'loading') return false;
    this.readyPlayers.add(playerId);
    this.broadcastReadyUpdate();
    return true;
  }

  private startGame(): void {
    this.phase = 'playing';
    this.broadcast(Opcode.GameBegin, {});
  }

  isGameActive(): boolean {
    return this.phase !== 'lobby';
  }

  dispose(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    if (this.loadingTimer) {
      clearInterval(this.loadingTimer);
      this.loadingTimer = undefined;
    }
    this.phase = 'lobby';
  }
}
