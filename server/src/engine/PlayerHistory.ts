import type { Entity } from '@spong/shared';
import { COMP_PLAYER, type PlayerComponent } from '@spong/shared';

export type RewindPosition = { x: number; y: number; z: number };

type Snapshot = {
  timeMs: number;
  positions: Map<number, RewindPosition>;
};

/**
 * Small ring buffer of player positions for lag compensation.
 * Stores recent snapshots and supports interpolated lookup by time.
 */
export class PlayerHistory {
  private readonly maxAgeMs: number;
  private readonly snapshots: Snapshot[] = [];

  constructor(maxAgeMs: number) {
    this.maxAgeMs = maxAgeMs;
  }

  record(entities: Entity[], timeMs: number): void {
    const positions = new Map<number, RewindPosition>();
    for (const entity of entities) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER);
      if (!pc) continue;
      positions.set(entity.id, {
        x: pc.state.posX,
        y: pc.state.posY,
        z: pc.state.posZ
      });
    }

    this.snapshots.push({ timeMs, positions });

    const cutoff = timeMs - this.maxAgeMs;
    while (this.snapshots.length > 0 && this.snapshots[0].timeMs < cutoff) {
      this.snapshots.shift();
    }
  }

  getPosition(entityId: number, timeMs: number): RewindPosition | null {
    if (this.snapshots.length === 0) return null;

    let older: Snapshot | null = null;
    let newer: Snapshot | null = null;

    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const snap = this.snapshots[i];
      if (snap.timeMs <= timeMs) {
        older = snap;
        newer = this.snapshots[i + 1] ?? snap;
        break;
      }
    }

    if (!older) {
      older = this.snapshots[0];
      newer = this.snapshots[1] ?? older;
    }

    const p0 = older.positions.get(entityId);
    if (!p0) return null;

    const p1 = newer.positions.get(entityId) ?? p0;
    if (older.timeMs === newer.timeMs) {
      return { x: p0.x, y: p0.y, z: p0.z };
    }

    const t = (timeMs - older.timeMs) / (newer.timeMs - older.timeMs);
    const clamped = Math.max(0, Math.min(1, t));

    return {
      x: p0.x + (p1.x - p0.x) * clamped,
      y: p0.y + (p1.y - p0.y) * clamped,
      z: p0.z + (p1.z - p0.z) * clamped
    };
  }
}
