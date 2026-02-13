import type { World, Entity } from '@spong/shared';
import {
  COMP_LADDER_COLLIDER,
  TAG_LADDER,
  Opcode,
  type LadderColliderComponent,
  type LadderPlaceMessage,
  type LadderDestroyMessage,
} from '@spong/shared';

export interface LadderSystemOptions {
  world: World;
  broadcast: (opcode: number, msg: unknown) => void;
}

/**
 * Server-side ladder system. Owns ladder entities and place/destroy.
 * Room delegates opcode handling to it.
 */
export class LadderSystem {
  private readonly world: World;
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly ladderEntities = new Map<number, Entity>();

  constructor(options: LadderSystemOptions) {
    this.world = options.world;
    this.broadcast = options.broadcast;
  }

  handleLadderPlace(playerEntityId: number, data: LadderPlaceMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Ladder] Player entity not found:', playerEntityId);
      return;
    }

    const ladderEntity = this.world.createEntity();
    const ladderEntityId = ladderEntity.id;
    const ladderCollider: LadderColliderComponent = {
      width: 1.2,
      height: data.segmentCount * 0.5,
      depth: 0.4,
      normalX: data.normalX,
      normalY: data.normalY,
      normalZ: data.normalZ,
      segmentCount: data.segmentCount,
    };
    ladderEntity.add(COMP_LADDER_COLLIDER, ladderCollider);
    ladderEntity.tag(TAG_LADDER);
    this.ladderEntities.set(ladderEntityId, ladderEntity);

    this.broadcast(Opcode.LadderSpawned, {
      entityId: ladderEntityId,
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      normalX: data.normalX,
      normalY: data.normalY,
      normalZ: data.normalZ,
      segmentCount: data.segmentCount,
    });
  }

  handleLadderDestroy(playerEntityId: number, data: LadderDestroyMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Ladder] Player entity not found:', playerEntityId);
      return;
    }
    const ladderEntity = this.ladderEntities.get(data.entityId);
    if (!ladderEntity) {
      console.error('[Ladder] Ladder entity not found:', data.entityId);
      return;
    }
    this.world.destroyEntity(ladderEntity.id);
    this.ladderEntities.delete(data.entityId);
    this.broadcast(Opcode.LadderDestroyed, { entityId: data.entityId });
  }
}
