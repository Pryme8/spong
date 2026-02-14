import type { Entity } from '@spong/shared';
import type { World } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_PROJECTILE,
  FIXED_TIMESTEP,
  stepProjectile,
  rayVsAABB,
  rayVsTriangleMesh,
  rayVsVoxelGrid,
  PLAYER_HITBOX_HALF,
  PLAYER_HITBOX_CENTER_Y,
  GROUND_HEIGHT,
  PROJECTILE_SUBSTEPS,
  PROJECTILE_COLLISION_INTERVAL,
  PROJECTILE_LIFETIME,
  PROJECTILE_LIFETIME_SHOTGUN,
  type PlayerComponent,
  type ProjectileComponent,
  type VoxelGrid,
  type ProjectileSpawnData,
} from '@spong/shared';
import type { RockColliderMesh, RockTransform } from '@spong/shared';

const TAG_DUMMY = 'Dummy';

export interface ProjectileSpawnParams {
  ownerId: number;
  weaponType: string;
  posX: number;
  posY: number;
  posZ: number;
  baseDirX: number;
  baseDirY: number;
  baseDirZ: number;
  pelletCount: number;
  currentAccuracy: number;
  projectileSpeed: number;
  damage: number;
  gravityStartDistance: number;
  proximityRadius?: number;
}

export interface ProjectileCollisionContext {
  voxelGrid?: import('@spong/shared').TerrainCollisionGrid;
  rockColliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
  octree?: {
    queryRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): Array<{ type: string; data: unknown }>;
  };
  groundY?: number;
}

export interface ProjectileTerrainHit {
  kind: 'terrain';
  projectileId: number;
  hitX: number;
  hitY: number;
  hitZ: number;
  proj: ProjectileComponent;
}

export interface ProjectileEntityHit {
  kind: 'entity';
  projectileId: number;
  targetEntityId: number;
  isHeadshot: boolean;
  proj: ProjectileComponent;
}

export type ProjectileHitEvent = ProjectileTerrainHit | ProjectileEntityHit;

export interface ProjectileTickResult {
  toDestroy: number[];
  hits: ProjectileHitEvent[];
}

/**
 * Server-side projectile system. Spawns projectiles, steps them, runs swept collision
 * (voxel, ground plane, rocks, entity hitboxes). Returns IDs to destroy and hit events
 * for Room to apply damage/broadcast.
 */
export class ProjectileSystem {
  /**
   * Create projectile entity(ies) and add to world. Returns spawn data for network.
   */
  spawn(world: World, params: ProjectileSpawnParams): ProjectileSpawnData | ProjectileSpawnData[] {
    const {
      ownerId,
      weaponType,
      posX,
      posY,
      posZ,
      baseDirX,
      baseDirY,
      baseDirZ,
      pelletCount,
      currentAccuracy,
      projectileSpeed,
      damage,
      gravityStartDistance,
      proximityRadius,
    } = params;

    const spawnDataArray: ProjectileSpawnData[] = [];
    const lifetime = pelletCount > 1 ? PROJECTILE_LIFETIME_SHOTGUN : PROJECTILE_LIFETIME;

    for (let i = 0; i < pelletCount; i++) {
      let dirX = baseDirX;
      let dirY = baseDirY;
      let dirZ = baseDirZ;

      if (currentAccuracy > 0) {
        const coneAngle = Math.random() * currentAccuracy;
        const spin = Math.random() * Math.PI * 2;
        let perpX: number, perpY: number, perpZ: number;
        if (Math.abs(dirY) < 0.9) {
          perpX = -dirZ;
          perpY = 0;
          perpZ = dirX;
        } else {
          perpX = dirY;
          perpY = 0;
          perpZ = -dirY;
        }
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
        perpX /= perpLen;
        perpY /= perpLen;
        perpZ /= perpLen;
        const cosSpin = Math.cos(spin);
        const sinSpin = Math.sin(spin);
        const crossX = perpY * dirZ - perpZ * dirY;
        const crossY = perpZ * dirX - perpX * dirZ;
        const crossZ = perpX * dirY - perpY * dirX;
        const rotPerpX = perpX * cosSpin + crossX * sinSpin;
        const rotPerpY = perpY * cosSpin + crossY * sinSpin;
        const rotPerpZ = perpZ * cosSpin + crossZ * sinSpin;
        const cosAngle = Math.cos(coneAngle);
        const sinAngle = Math.sin(coneAngle);
        dirX = dirX * cosAngle + rotPerpX * sinAngle;
        dirY = dirY * cosAngle + rotPerpY * sinAngle;
        dirZ = dirZ * cosAngle + rotPerpZ * sinAngle;
        const finalLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        dirX /= finalLen;
        dirY /= finalLen;
        dirZ /= finalLen;
      }

      const offsetRadius = 0.05;
      const angle = (i / pelletCount) * Math.PI * 2;
      const pelletPosX = posX + Math.cos(angle) * offsetRadius;
      const pelletPosZ = posZ + Math.sin(angle) * offsetRadius;

      const projEntity = world.createEntity();
      const projComp: ProjectileComponent = {
        ownerId,
        weaponType,
        dirX, dirY, dirZ,
        speed: projectileSpeed,
        damage,
        baseDamage: damage,
        lifetime,
        posX: pelletPosX,
        posY,
        posZ: pelletPosZ,
        velY: dirY * projectileSpeed,
        distanceTraveled: 0,
        gravityStartDistance,
        tickCounter: 0,
        lastCollisionCheckX: pelletPosX,
        lastCollisionCheckY: posY,
        lastCollisionCheckZ: pelletPosZ,
        proximityRadius,
      };
      projEntity.add(COMP_PROJECTILE, projComp);

      spawnDataArray.push({
        entityId: projEntity.id,
        ownerId,
        posX: pelletPosX,
        posY,
        posZ: pelletPosZ,
        dirX, dirY, dirZ,
        speed: projectileSpeed,
      });
    }

    return spawnDataArray.length === 1 ? spawnDataArray[0] : spawnDataArray;
  }

  tick(
    projectileEntities: Entity[],
    killableEntities: Entity[],
    ctx: ProjectileCollisionContext
  ): ProjectileTickResult {
    const toDestroy: number[] = [];
    const hits: ProjectileHitEvent[] = [];
    const groundY = ctx.groundY ?? GROUND_HEIGHT;

    for (const entity of projectileEntities) {
      const proj = entity.get<ProjectileComponent>(COMP_PROJECTILE);
      if (!proj) continue;

      if (proj.lifetime <= 0) {
        toDestroy.push(entity.id);
        continue;
      }

      stepProjectile(proj, FIXED_TIMESTEP);
      proj.tickCounter++;
      const shouldCheckCollision = (proj.tickCounter % PROJECTILE_COLLISION_INTERVAL) === 0;

      if (!shouldCheckCollision) continue;

      const prevCheckX = proj.lastCollisionCheckX;
      const prevCheckY = proj.lastCollisionCheckY;
      const prevCheckZ = proj.lastCollisionCheckZ;
      const totalDirX = proj.posX - prevCheckX;
      const totalDirY = proj.posY - prevCheckY;
      const totalDirZ = proj.posZ - prevCheckZ;
      const totalLength = Math.sqrt(totalDirX * totalDirX + totalDirY * totalDirY + totalDirZ * totalDirZ);

      if (totalLength < 0.0001) {
        proj.lastCollisionCheckX = proj.posX;
        proj.lastCollisionCheckY = proj.posY;
        proj.lastCollisionCheckZ = proj.posZ;
        continue;
      }

      let hitOccurred = false;
      for (let substep = 0; substep < PROJECTILE_SUBSTEPS && !hitOccurred; substep++) {
        const t0 = substep / PROJECTILE_SUBSTEPS;
        const t1 = (substep + 1) / PROJECTILE_SUBSTEPS;
        const stepStartX = prevCheckX + totalDirX * t0;
        const stepStartY = prevCheckY + totalDirY * t0;
        const stepStartZ = prevCheckZ + totalDirZ * t0;
        const stepEndX = prevCheckX + totalDirX * t1;
        const stepEndY = prevCheckY + totalDirY * t1;
        const stepEndZ = prevCheckZ + totalDirZ * t1;
        const rayDirX = stepEndX - stepStartX;
        const rayDirY = stepEndY - stepStartY;
        const rayDirZ = stepEndZ - stepStartZ;
        const rayLength = Math.sqrt(rayDirX * rayDirX + rayDirY * rayDirY + rayDirZ * rayDirZ);
        if (rayLength < 0.0001) continue;

        const rayDirNormX = rayDirX / rayLength;
        const rayDirNormY = rayDirY / rayLength;
        const rayDirNormZ = rayDirZ / rayLength;

        if (ctx.voxelGrid) {
          const voxelHit = rayVsVoxelGrid(
            ctx.voxelGrid,
            stepStartX, stepStartY, stepStartZ,
            rayDirNormX, rayDirNormY, rayDirNormZ,
            rayLength
          );
          if (voxelHit.hit) {
            hits.push({
              kind: 'terrain',
              projectileId: entity.id,
              hitX: proj.posX,
              hitY: proj.posY,
              hitZ: proj.posZ,
              proj
            });
            toDestroy.push(entity.id);
            hitOccurred = true;
            break;
          }
        } else {
          if (stepStartY > groundY && stepEndY <= groundY && rayDirNormY < 0) {
            const t = (groundY - stepStartY) / rayDirNormY;
            const hitX = stepStartX + rayDirNormX * t;
            const hitZ = stepStartZ + rayDirNormZ * t;
            hits.push({
              kind: 'terrain',
              projectileId: entity.id,
              hitX,
              hitY: groundY,
              hitZ,
              proj
            });
            toDestroy.push(entity.id);
            hitOccurred = true;
            break;
          }
        }

        let rocksToCheck = ctx.rockColliderMeshes;
        if (ctx.octree) {
          const nearbyEntries = ctx.octree.queryRay(stepStartX, stepStartY, stepStartZ, rayDirNormX, rayDirNormY, rayDirNormZ, rayLength);
          rocksToCheck = nearbyEntries.filter((e: { type: string }) => e.type === 'rock').map((e: { data: unknown }) => e.data as (typeof ctx.rockColliderMeshes)[0]);
        }
        for (const rockData of rocksToCheck) {
          const rockHit = rayVsTriangleMesh(
            [stepStartX, stepStartY, stepStartZ],
            [rayDirNormX, rayDirNormY, rayDirNormZ],
            rockData.mesh,
            rockData.transform,
            rayLength
          );
          if (rockHit.hit) {
            hits.push({
              kind: 'terrain',
              projectileId: entity.id,
              hitX: proj.posX,
              hitY: proj.posY,
              hitZ: proj.posZ,
              proj
            });
            toDestroy.push(entity.id);
            hitOccurred = true;
            break;
          }
        }
        if (hitOccurred) break;

        const PLAYER_CHECK_DISTANCE = 50;
        for (const targetEntity of killableEntities) {
          if (targetEntity.id === proj.ownerId) continue;
          const pc = targetEntity.get<PlayerComponent>(COMP_PLAYER);
          if (!pc) continue;

          const distX = proj.posX - pc.state.posX;
          const distZ = proj.posZ - pc.state.posZ;
          if (distX * distX + distZ * distZ > PLAYER_CHECK_DISTANCE * PLAYER_CHECK_DISTANCE) continue;

          const bx = pc.state.posX;
          const by = pc.state.posY;
          const bz = pc.state.posZ;
          const isDummyTarget = targetEntity.hasTag(TAG_DUMMY);
          const bodyCenterY = isDummyTarget ? by + PLAYER_HITBOX_CENTER_Y : by;
          const headCenterY = isDummyTarget ? by + PLAYER_HITBOX_CENTER_Y + 0.8 : by + 0.8;
          const headHalfSize = 0.3;

          const headResult = rayVsAABB(
            stepStartX, stepStartY, stepStartZ,
            rayDirNormX, rayDirNormY, rayDirNormZ,
            rayLength,
            bx, headCenterY, bz,
            headHalfSize
          );
          const bodyResult = rayVsAABB(
            stepStartX, stepStartY, stepStartZ,
            rayDirNormX, rayDirNormY, rayDirNormZ,
            rayLength,
            bx, bodyCenterY, bz,
            PLAYER_HITBOX_HALF
          );
          console.log('[raycast]', {
            targetEntityId: targetEntity.id,
            rayOrigin: [stepStartX, stepStartY, stepStartZ],
            rayDir: [rayDirNormX, rayDirNormY, rayDirNormZ],
            rayLength,
            headCenter: [bx, headCenterY, bz],
            bodyCenter: [bx, bodyCenterY, bz],
            head: { hit: headResult.hit, distance: headResult.distance },
            body: { hit: bodyResult.hit, distance: bodyResult.distance }
          });
          if (headResult.hit) {
            hits.push({
              kind: 'entity',
              projectileId: entity.id,
              targetEntityId: targetEntity.id,
              isHeadshot: true,
              proj
            });
            toDestroy.push(entity.id);
            hitOccurred = true;
            break;
          }

          if (bodyResult.hit) {
            hits.push({
              kind: 'entity',
              projectileId: entity.id,
              targetEntityId: targetEntity.id,
              isHeadshot: false,
              proj
            });
            toDestroy.push(entity.id);
            hitOccurred = true;
            break;
          }
        }
      }

      proj.lastCollisionCheckX = proj.posX;
      proj.lastCollisionCheckY = proj.posY;
      proj.lastCollisionCheckZ = proj.posZ;
    }

    return { toDestroy, hits };
  }
}
