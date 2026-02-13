/**
 * Server-side combat: damage application, proximity/AOE, line-of-sight, death/respawn.
 * Uses shared raycast helpers (rayVsVoxelGrid, rayVsTriangleMesh, rayVsAABB).
 */

import type { World, Entity } from '@spong/shared';
import type { VoxelGrid } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_HEALTH,
  COMP_ARMOR,
  COMP_HELMET,
  COMP_COLLECTED,
  COMP_WEAPON_TYPE,
  TAG_DUMMY,
  FIXED_TIMESTEP,
  Opcode,
  WATER,
  rayVsAABB,
  rayVsTriangleMesh,
  rayVsVoxelGrid,
  PLAYER_HITBOX_HALF,
  type PlayerComponent,
  type HealthComponent,
  type ArmorComponent,
  type HelmetComponent,
  type EntityDamageMessage,
  type EntityDeathMessage,
  type ExplosionSpawnMessage,
  type CollectedComponent,
  type WeaponTypeComponent,
} from '@spong/shared';
import type { ProjectileEntityHit, ProjectileTerrainHit, ProjectileHitEvent } from './ProjectileSystem.js';
import type { RoundSystem } from './RoundSystem.js';

export type LevelSystemCollision = {
  getRockColliderMeshes(): Array<{ mesh: unknown; transform: unknown }>;
  getOctree(): { queryRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): Array<{ type: string; data: unknown }> } | null;
};

export interface CombatSystemOptions {
  world: World;
  broadcast: (opcode: number, msg: unknown) => void;
  getVoxelGrid: () => VoxelGrid | undefined;
  getWaterLevelProvider: () => { isValidSpawnPosition(x: number, y: number, z: number): boolean } | undefined;
  getLevelSystem: () => LevelSystemCollision;
  roundSystem: RoundSystem;
  dropWeaponAtPosition: (entity: Entity, x: number, y: number, z: number) => void;
  lobbyConfig?: { headshotDmg?: number; normalDmg?: number };
}

export class CombatSystem {
  private readonly world: World;
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly getVoxelGrid: () => VoxelGrid | undefined;
  private readonly getWaterLevelProvider: () => { isValidSpawnPosition(x: number, y: number, z: number): boolean } | undefined;
  private readonly getLevelSystem: () => LevelSystemCollision;
  private readonly roundSystem: RoundSystem;
  private readonly dropWeaponAtPosition: (entity: Entity, x: number, y: number, z: number) => void;
  private readonly lobbyConfig: { headshotDmg?: number; normalDmg?: number };

  constructor(options: CombatSystemOptions) {
    this.world = options.world;
    this.broadcast = options.broadcast;
    this.getVoxelGrid = options.getVoxelGrid;
    this.getWaterLevelProvider = options.getWaterLevelProvider;
    this.getLevelSystem = options.getLevelSystem;
    this.roundSystem = options.roundSystem;
    this.dropWeaponAtPosition = options.dropWeaponAtPosition;
    this.lobbyConfig = options.lobbyConfig ?? {};
  }

  findValidSpawnPosition(): { x: number; y: number; z: number } {
    const waterLevelProvider = this.getWaterLevelProvider();
    if (waterLevelProvider) {
      if (waterLevelProvider.isValidSpawnPosition(0, 0, 0)) {
        return { x: 0, y: 0, z: 0 };
      }
      const voxelGrid = this.getVoxelGrid();
      const maxAttempts = 100;
      const maxRadius = 50;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        let y = 0;
        if (voxelGrid) {
          y = voxelGrid.getWorldSurfaceY(x, z) + 0.5;
        }
        if (waterLevelProvider.isValidSpawnPosition(x, y, z)) {
          return { x, y, z };
        }
      }
    }
    return { x: 0, y: 0, z: 0 };
  }

  applyProximityDamage(
    impactX: number,
    impactY: number,
    impactZ: number,
    radius: number,
    baseDamage: number,
    projectileDistance: number,
    attackerId: number,
    killableEntities: Entity[]
  ): void {
    const explosionMsg: ExplosionSpawnMessage = {
      posX: impactX,
      posY: impactY,
      posZ: impactZ,
      radius
    };
    this.broadcast(Opcode.ExplosionSpawn, explosionMsg);
    let damageMult = 1.0;
    if (projectileDistance > 20) {
      damageMult = Math.max(0.3, 1.0 - (projectileDistance - 20) * 0.0125);
    }
    const effectiveDamage = baseDamage * damageMult;
    const voxelGrid = this.getVoxelGrid();
    const levelSystem = this.getLevelSystem();

    for (const targetEntity of killableEntities) {
      const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
      const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
      if (!pc || !health) continue;

      const dx = pc.state.posX - impactX;
      const dy = pc.state.posY - impactY;
      const dz = pc.state.posZ - impactZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > radius) continue;

      const rayDirX = dx / distance;
      const rayDirY = dy / distance;
      const rayDirZ = dz / distance;
      let losBlocked = false;

      if (voxelGrid) {
        const voxelHit = rayVsVoxelGrid(
          voxelGrid,
          impactX, impactY, impactZ,
          rayDirX, rayDirY, rayDirZ,
          distance
        );
        if (voxelHit.hit) losBlocked = true;
      }

      if (!losBlocked) {
        let rocksToCheck = levelSystem.getRockColliderMeshes();
        const oct = levelSystem.getOctree();
        if (oct) {
          const nearbyEntries = oct.queryRay(impactX, impactY, impactZ, rayDirX, rayDirY, rayDirZ, distance);
          rocksToCheck = nearbyEntries.filter((e: { type: string }) => e.type === 'rock').map((e: { data: unknown }) => e.data as { mesh: unknown; transform: unknown });
        }
        for (const rockData of rocksToCheck) {
          const rockHit = rayVsTriangleMesh(
            [impactX, impactY, impactZ],
            [rayDirX, rayDirY, rayDirZ],
            rockData.mesh as Parameters<typeof rayVsTriangleMesh>[2],
            rockData.transform as Parameters<typeof rayVsTriangleMesh>[3],
            distance
          );
          if (rockHit.hit) {
            losBlocked = true;
            break;
          }
        }
      }

      if (!losBlocked) {
        for (const blockingEntity of killableEntities) {
          if (blockingEntity.id === targetEntity.id) continue;
          const blockingPc = blockingEntity.get<PlayerComponent>(COMP_PLAYER);
          if (!blockingPc) continue;
          const blockingResult = rayVsAABB(
            impactX, impactY, impactZ,
            rayDirX, rayDirY, rayDirZ,
            distance,
            blockingPc.state.posX,
            blockingPc.state.posY,
            blockingPc.state.posZ,
            PLAYER_HITBOX_HALF
          );
          if (blockingResult.hit) {
            losBlocked = true;
            break;
          }
        }
      }

      if (losBlocked) continue;

      const proximityMult = Math.max(0, 1.0 - (distance / radius));
      const finalDamage = effectiveDamage * proximityMult;
      this.applyDamageToEntity(targetEntity, finalDamage);
      const isDummy = targetEntity.hasTag(TAG_DUMMY);
      if (isDummy) health.current = health.max;

      if (distance > 0.001) {
        const impulseStrength = 20.0;
        const impulseMult = proximityMult * 0.5;
        const impulseFalloff = impulseMult * impulseMult;
        const finalImpulse = impulseStrength * impulseFalloff;
        const dirX = dx / distance;
        const dirY = dy / distance;
        const dirZ = dz / distance;
        pc.state.velX += dirX * finalImpulse;
        pc.state.velY += dirY * finalImpulse * 0.5;
        pc.state.velZ += dirZ * finalImpulse;
      }

      this.roundSystem.trackDamage(attackerId, finalDamage);
      const dmgMsg: EntityDamageMessage = {
        entityId: targetEntity.id,
        damage: finalDamage,
        newHealth: health.current,
        attackerId
      };
      this.broadcast(Opcode.EntityDamage, dmgMsg);

      if (!isDummy && health.current <= 0) {
        this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);
        this.broadcast(Opcode.EntityDeath, { entityId: targetEntity.id, killerId: attackerId });
        if (this.roundSystem.phase === 'active') {
          let weaponType: string | null = null;
          const attackerEntity = this.world.getEntity(attackerId);
          if (attackerEntity) {
            const attackerCollected = attackerEntity.get<CollectedComponent>(COMP_COLLECTED);
            if (attackerCollected?.items.length) {
              const weaponEntity = this.world.getEntity(attackerCollected.items[0]);
              const weaponTypeComp = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
              if (weaponTypeComp) weaponType = weaponTypeComp.type;
            }
          }
          this.roundSystem.handleKill(attackerId, targetEntity.id, weaponType, false);
          this.roundSystem.checkWinCondition();
        }
        this.respawnEntity(targetEntity, pc, health);
      }
    }
  }

  processProjectileEntityHit(hit: ProjectileEntityHit, killableEntities: Entity[]): void {
    const targetEntity = this.world.getEntity(hit.targetEntityId);
    if (!targetEntity) return;
    const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
    const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
    if (!pc || !health) return;

    const proj = hit.proj;
    const isDummy = targetEntity.hasTag(TAG_DUMMY);
    const headshotMultiplier = this.lobbyConfig.headshotDmg ?? 2.0;
    const normalMultiplier = this.lobbyConfig.normalDmg ?? 1.0;

    if (hit.isHeadshot) {
      let damageMult = 1.0;
      if (proj.distanceTraveled > 20) {
        damageMult = Math.max(0.3, 1.0 - (proj.distanceTraveled - 20) * 0.0125);
      }
      const finalDamage = proj.baseDamage * damageMult;
      const helmet = targetEntity.get<HelmetComponent>(COMP_HELMET);
      let actualDamage: number;
      if (helmet?.hasHelmet && helmet.helmetHealth > 0) {
        const damageAfterNegation = finalDamage;
        const helmetAbsorbed = Math.min(helmet.helmetHealth, damageAfterNegation);
        helmet.helmetHealth = Math.max(0, helmet.helmetHealth - damageAfterNegation);
        actualDamage = Math.max(0, damageAfterNegation - helmetAbsorbed);
        if (helmet.helmetHealth <= 0) helmet.hasHelmet = false;
      } else {
        actualDamage = finalDamage * headshotMultiplier;
      }
      health.current = Math.max(0, health.current - actualDamage);
      if (isDummy) health.current = health.max;
      this.roundSystem.trackShotHit(proj.ownerId);
      this.roundSystem.trackDamage(proj.ownerId, actualDamage);
      this.broadcast(Opcode.EntityDamage, { entityId: targetEntity.id, damage: actualDamage, newHealth: health.current, attackerId: proj.ownerId });
      if (!isDummy && health.current <= 0) {
        this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);
        this.broadcast(Opcode.EntityDeath, { entityId: targetEntity.id, killerId: proj.ownerId });
        if (this.roundSystem.phase === 'active') {
          this.roundSystem.handleKill(proj.ownerId, targetEntity.id, proj.weaponType, true);
          this.roundSystem.checkWinCondition();
        }
        this.respawnEntity(targetEntity, pc, health);
      }
      if (proj.proximityRadius && proj.proximityRadius > 0) {
        this.applyProximityDamage(proj.posX, proj.posY, proj.posZ, proj.proximityRadius, proj.baseDamage, proj.distanceTraveled, proj.ownerId, killableEntities);
      }
      return;
    }

    let damageMult = 1.0;
    if (proj.distanceTraveled > 20) {
      damageMult = Math.max(0.3, 1.0 - (proj.distanceTraveled - 20) * 0.0125);
    }
    const finalDamage = proj.baseDamage * damageMult * normalMultiplier;
    this.applyDamageToEntity(targetEntity, finalDamage);
    if (isDummy) health.current = health.max;
    this.roundSystem.trackShotHit(proj.ownerId);
    this.roundSystem.trackDamage(proj.ownerId, finalDamage);
    this.broadcast(Opcode.EntityDamage, { entityId: targetEntity.id, damage: finalDamage, newHealth: health.current, attackerId: proj.ownerId });
    if (!isDummy && health.current <= 0) {
      this.dropWeaponAtPosition(targetEntity, pc.state.posX, pc.state.posY, pc.state.posZ);
      this.broadcast(Opcode.EntityDeath, { entityId: targetEntity.id, killerId: proj.ownerId });
      if (this.roundSystem.phase === 'active') {
        this.roundSystem.handleKill(proj.ownerId, targetEntity.id, proj.weaponType, false);
        this.roundSystem.checkWinCondition();
      }
      this.respawnEntity(targetEntity, pc, health);
    }
    if (proj.proximityRadius && proj.proximityRadius > 0) {
      this.applyProximityDamage(proj.posX, proj.posY, proj.posZ, proj.proximityRadius, proj.baseDamage, proj.distanceTraveled, proj.ownerId, killableEntities);
    }
  }

  applyDamageToEntity(entity: Entity, damage: number): number {
    const health = entity.get<HealthComponent>(COMP_HEALTH);
    const armor = entity.get<ArmorComponent>(COMP_ARMOR);
    if (!health) return 0;

    let damageToHealth = damage;
    if (armor && armor.current > 0) {
      const damageAbsorbed = Math.min(armor.current, damage);
      armor.current = Math.max(0, armor.current - damage);
      damageToHealth = Math.max(0, damage - damageAbsorbed);
    }
    health.current = Math.max(0, health.current - damageToHealth);
    return damageToHealth;
  }

  /** Apply drowning damage and handle death/respawn for active players. */
  tickDrowning(activePlayers: Entity[], _now: number): void {
    for (const entity of activePlayers) {
      const pc = entity.get<PlayerComponent>(COMP_PLAYER)!;
      const health = entity.get<HealthComponent>(COMP_HEALTH);
      if (!health || pc.state.breathRemaining > 0 || !pc.state.isHeadUnderwater) continue;

      const drowningDamage = WATER.DROWNING_DAMAGE * FIXED_TIMESTEP;
      const oldHealth = health.current;
      health.current = Math.max(0, health.current - drowningDamage);

      const damageMsg: EntityDamageMessage = {
        entityId: entity.id,
        damage: drowningDamage,
        newHealth: health.current,
        attackerId: 0
      };
      this.broadcast(Opcode.EntityDamage, damageMsg);

      if (health.current <= 0 && oldHealth > 0) {
        const deathMsg: EntityDeathMessage = { entityId: entity.id, killerId: 0 };
        this.broadcast(Opcode.EntityDeath, deathMsg);
        if (this.roundSystem.phase === 'active') {
          this.roundSystem.handleKill(0, entity.id);
          this.roundSystem.checkWinCondition();
        }
        this.respawnPlayer(entity);
      }
    }
  }

  /** Process projectile hit events (terrain proximity + entity hits). */
  processProjectileHits(hits: ProjectileHitEvent[], killableEntities: Entity[]): void {
    for (const hit of hits) {
      if (hit.kind === 'terrain') {
        const th = hit as ProjectileTerrainHit;
        if (th.proj.proximityRadius && th.proj.proximityRadius > 0) {
          this.applyProximityDamage(
            th.hitX, th.hitY, th.hitZ,
            th.proj.proximityRadius,
            th.proj.baseDamage,
            th.proj.distanceTraveled,
            th.proj.ownerId,
            killableEntities
          );
        }
      } else {
        this.processProjectileEntityHit(hit as ProjectileEntityHit, killableEntities);
      }
    }
  }

  /** Called by Room for drowning/other non-projectile deaths that need respawn. */
  respawnPlayer(targetEntity: Entity): void {
    const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
    const health = targetEntity.get<HealthComponent>(COMP_HEALTH);
    if (!pc || !health) return;
    this.respawnEntity(targetEntity, pc, health);
  }

  private respawnEntity(_entity: Entity, pc: PlayerComponent, health: HealthComponent): void {
    const spawnPos = this.findValidSpawnPosition();
    pc.state.posX = spawnPos.x;
    pc.state.posY = spawnPos.y;
    pc.state.posZ = spawnPos.z;
    pc.state.velX = 0;
    pc.state.velY = 0;
    pc.state.velZ = 0;
    pc.state.isInWater = false;
    pc.state.isHeadUnderwater = false;
    pc.state.breathRemaining = 10.0;
    pc.state.waterDepth = 0;
    pc.inputQueue!.length = 0;
    health.current = health.max;
  }
}
