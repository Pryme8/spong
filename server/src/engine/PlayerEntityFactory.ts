import type { World, Entity } from '@spong/shared';
import {
  createCharacterState,
  PLAYER_MAX_HEALTH,
  COMP_PLAYER,
  COMP_HEALTH,
  COMP_STAMINA,
  COMP_ACTIVE_BUFFS,
  COMP_ARMOR,
  COMP_HELMET,
  COMP_MATERIALS,
  COMP_COLLECTED,
  COMP_STATS,
  TAG_KILLABLE,
  TAG_DUMMY,
  type PlayerComponent,
  type HealthComponent,
  type StaminaComponent,
  type ActiveBuffsComponent,
  type ArmorComponent,
  type HelmetComponent,
  type MaterialsComponent,
  type CollectedComponent,
  type StatsComponent,
  type DummySpawnMessage,
} from '@spong/shared';

export function createPlayerEntity(world: World, connectionId: string): Entity {
  const entity = world.createEntity();
  const playerComp: PlayerComponent = {
    connectionId,
    state: createCharacterState(),
    input: { forward: 0, right: 0, cameraYaw: 0, jump: false, sprint: false },
    lastProcessedInput: 0,
    lastShootTime: 0,
    headPitch: 0,
    inputQueue: []
  };
  const healthComp: HealthComponent = {
    current: PLAYER_MAX_HEALTH,
    max: PLAYER_MAX_HEALTH
  };
  const staminaComp: StaminaComponent = {
    current: 100,
    max: 100,
    isExhausted: false,
    exhaustedAt: 0
  };
  const activeBuffsComp: ActiveBuffsComponent = { buffs: [] };
  const armorComp: ArmorComponent = { current: 0, max: 50 };
  const helmetComp: HelmetComponent = {
    hasHelmet: false,
    helmetHealth: 0,
    maxHelmetHealth: 20
  };
  const materialsComp: MaterialsComponent = { current: 500, max: 500 };
  const collectedComp: CollectedComponent = { items: [] };
  const statsComp: StatsComponent = {
    kills: 0,
    deaths: 0,
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0
  };

  entity
    .add(COMP_PLAYER, playerComp)
    .add(COMP_HEALTH, healthComp)
    .add(COMP_STAMINA, staminaComp)
    .add(COMP_ACTIVE_BUFFS, activeBuffsComp)
    .add(COMP_ARMOR, armorComp)
    .add(COMP_HELMET, helmetComp)
    .add(COMP_MATERIALS, materialsComp)
    .add(COMP_COLLECTED, collectedComp)
    .add(COMP_STATS, statsComp)
    .tag(TAG_KILLABLE);

  return entity;
}

export function createDummyEntity(
  world: World,
  worldX: number,
  worldY: number,
  worldZ: number,
  color: string = '#ff6b3d'
): { entity: Entity; spawnMsg: DummySpawnMessage } {
  const entity = world.createEntity();
  const playerComp: PlayerComponent = {
    connectionId: `dummy_${entity.id}`,
    state: createCharacterState(),
    input: { forward: 0, right: 0, cameraYaw: 0, jump: false, sprint: false },
    lastProcessedInput: 0,
    lastShootTime: 0,
    headPitch: 0,
    inputQueue: []
  };
  playerComp.state.posX = worldX;
  playerComp.state.posY = worldY;
  playerComp.state.posZ = worldZ;
  playerComp.state.velX = 0;
  playerComp.state.velY = 0;
  playerComp.state.velZ = 0;

  const healthComp: HealthComponent = {
    current: PLAYER_MAX_HEALTH,
    max: PLAYER_MAX_HEALTH
  };

  entity
    .add(COMP_PLAYER, playerComp)
    .add(COMP_HEALTH, healthComp)
    .tag(TAG_KILLABLE)
    .tag(TAG_DUMMY);

  const spawnMsg: DummySpawnMessage = {
    entityId: entity.id,
    posX: worldX,
    posY: worldY,
    posZ: worldZ,
    color
  };

  return { entity, spawnMsg };
}
