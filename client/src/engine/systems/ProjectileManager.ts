import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, InstancedMesh } from '@babylonjs/core';
import {
  ProjectileSpawnData,
  ProjectileComponent,
  PROJECTILE_RADIUS,
  PROJECTILE_LIFETIME,
  PROJECTILE_LIFETIME_SHOTGUN,
  PROJECTILE_SUBSTEPS,
  stepProjectile,
  rayVsAABB,
  PLAYER_HITBOX_HALF,
  PLAYER_HITBOX_CENTER_Y
} from '@spong/shared';
import type { useTransformSync } from '../composables/useTransformSync';

interface ClientProjectile {
  entityId: number;
  component: ProjectileComponent;
  mesh: InstancedMesh;
  isPredicted: boolean;
  spawnTime: number; // For matching predicted with server
}

export class ProjectileManager {
  private scene: Scene;
  private projectiles = new Map<number, ClientProjectile>();
  private material: StandardMaterial;
  private baseMesh: Mesh; // Base mesh for instancing
  private transformSync: ReturnType<typeof useTransformSync> | null = null;
  private myEntityId: number | null = null;

  // Tracking for matching predicted projectiles with server confirmations
  private recentPredictedIds: number[] = [];
  private readonly MATCH_WINDOW_MS = 500; // Match window
  /** When we skip spawning server visual for our own shot, map server entityId -> our predicted id so destroy(serverId) removes the right visual. */
  private serverEntityIdToPredictedId = new Map<number, number>();

  constructor(scene: Scene) {
    this.scene = scene;

    // Shared neon material for all projectiles
    this.material = new StandardMaterial('projMat', scene);
    this.material.diffuseColor = new Color3(1, 0.3, 0);    // Orange
    this.material.emissiveColor = new Color3(1, 0.15, 0);   // Warm glow
    this.material.specularColor = new Color3(1, 1, 0);      // Yellow highlights

    // Create base mesh for instancing (never rendered, just template)
    this.baseMesh = MeshBuilder.CreateSphere('projectileBase', {
      diameter: PROJECTILE_RADIUS * 2,
      segments: 4 // Reduced from 6 for better performance
    }, scene);
    this.baseMesh.material = this.material;
    this.baseMesh.isVisible = false; // Hide the base mesh
  }

  /** Set transform sync for collision checks. */
  setTransformSync(sync: ReturnType<typeof useTransformSync>, myId: number) {
    this.transformSync = sync;
    this.myEntityId = myId;
  }

  /** Spawn a projectile from server broadcast. */
  spawnFromServer(data: ProjectileSpawnData): void {
    // Our own shot: keep local-only visual to avoid warp; map server id so destroy(serverId) removes our predicted.
    if (this.myEntityId !== null && data.ownerId === this.myEntityId) {
      const predictedId = this.recentPredictedIds.find(id => {
        const proj = this.projectiles.get(id);
        return proj?.isPredicted && proj.component.ownerId === this.myEntityId;
      });
      if (predictedId !== undefined) {
        this.serverEntityIdToPredictedId.set(data.entityId, predictedId);
        this.recentPredictedIds = this.recentPredictedIds.filter(id => id !== predictedId);
      }
      return;
    }

    if (this.projectiles.has(data.entityId)) return;
    this.createProjectile(data.entityId, data, false);
  }

  /** Spawn a batch of projectiles from server broadcast (for multi-pellet weapons). */
  spawnBatchFromServer(dataArray: ProjectileSpawnData[]): void {
    if (dataArray.length === 0) return;

    const ownerId = dataArray[0].ownerId;
    if (this.myEntityId !== null && ownerId === this.myEntityId) {
      const ourPredicted = this.recentPredictedIds
        .map(id => ({ id, proj: this.projectiles.get(id) }))
        .filter((p): p is { id: number; proj: ClientProjectile } => p.proj?.isPredicted === true && p.proj.component.ownerId === this.myEntityId)
        .sort((a, b) => a.proj.spawnTime - b.proj.spawnTime)
        .map(p => p.id);
      for (let i = 0; i < dataArray.length && i < ourPredicted.length; i++) {
        this.serverEntityIdToPredictedId.set(dataArray[i].entityId, ourPredicted[i]);
      }
      this.recentPredictedIds = this.recentPredictedIds.filter(id => !ourPredicted.includes(id));
      return;
    }

    for (const data of dataArray) {
      if (!this.projectiles.has(data.entityId)) {
        this.createProjectile(data.entityId, data, false);
      }
    }
  }

  /**
   * Spawn a predicted projectile locally (before server confirms).
   * Uses a temporary negative ID so it doesn't collide with server IDs.
   */
  private nextPredictedId = -1;

  spawnPredicted(
    posX: number, posY: number, posZ: number,
    dirX: number, dirY: number, dirZ: number,
    speed: number, ownerId: number
  ): number {
    // Use decrementing negative IDs (guaranteed unique)
    const tempId = this.nextPredictedId--;

    this.createProjectile(tempId, {
      entityId: tempId,
      ownerId,
      posX, posY, posZ,
      dirX, dirY, dirZ,
      speed
    }, true);

    // Track for matching with server confirmation
    this.recentPredictedIds.push(tempId);

    return tempId;
  }

  /** Remove a projectile by entity ID (server id or internal id). Returns position if found. */
  destroy(entityId: number): { x: number; y: number; z: number } | null {
    const actualId = this.serverEntityIdToPredictedId.get(entityId) ?? entityId;
    if (actualId !== entityId) {
      this.serverEntityIdToPredictedId.delete(entityId);
    }
    const proj = this.projectiles.get(actualId);
    if (proj) {
      const position = {
        x: proj.mesh.position.x,
        y: proj.mesh.position.y,
        z: proj.mesh.position.z
      };
      proj.mesh.dispose();
      this.projectiles.delete(actualId);
      for (const [sId, pId] of this.serverEntityIdToPredictedId) {
        if (pId === actualId) this.serverEntityIdToPredictedId.delete(sId);
      }
      return position;
    }
    return null;
  }

  /** Fixed-timestep tick: advance all projectiles, check collisions, cull expired. */
  fixedUpdate(dt: number): void {
    const toRemove: number[] = [];

    for (const [id, proj] of this.projectiles) {
      // Store previous position for swept collision
      const prevX = proj.component.posX;
      const prevY = proj.component.posY;
      const prevZ = proj.component.posZ;

      // Advance projectile
      stepProjectile(proj.component, dt);

      // Check expiry
      if (proj.component.lifetime <= 0) {
        toRemove.push(id);
        continue;
      }

      // Client-side collision prediction (for visual feedback)
      if (this.transformSync) {
        const hit = this.checkProjectileCollision(
          prevX, prevY, prevZ,
          proj.component.posX, proj.component.posY, proj.component.posZ,
          proj.component.ownerId
        );

        if (hit) {
          toRemove.push(id);
        }
      }
    }

    // Clean up old predicted IDs that weren't matched
    const now = Date.now();
    this.recentPredictedIds = this.recentPredictedIds.filter(id => {
      const proj = this.projectiles.get(id);
      if (!proj) return false;
      return (now - proj.spawnTime) < this.MATCH_WINDOW_MS;
    });

    for (const id of toRemove) {
      this.destroy(id);
    }
  }

  /** Render frame update: sync mesh positions. */
  update(): void {
    for (const proj of this.projectiles.values()) {
      proj.mesh.position.set(
        proj.component.posX,
        proj.component.posY,
        proj.component.posZ
      );
    }
  }

  private createProjectile(id: number, data: ProjectileSpawnData, isPredicted: boolean): void {
    // Create an instance of the base mesh (much faster than creating new geometry)
    // Instancing reuses the same geometry for all projectiles - huge performance win
    const mesh = this.baseMesh.createInstance(`proj_${id}`);
    mesh.position.set(data.posX, data.posY, data.posZ);

    const component: ProjectileComponent = {
      ownerId: data.ownerId,
      dirX: data.dirX,
      dirY: data.dirY,
      dirZ: data.dirZ,
      speed: data.speed,
      damage: 0, // Client doesn't need damage
      baseDamage: 0,
      lifetime: PROJECTILE_LIFETIME, // 2.0s default (server handles shotgun 0.5s lifetime)
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      velY: data.dirY * data.speed, // Initialize vertical velocity
      distanceTraveled: 0,
      gravityStartDistance: 50, // Default gravity distance (client doesn't receive this from server)
      tickCounter: 0, // Match server-side component
      lastCollisionCheckX: data.posX, // Initialize to spawn position
      lastCollisionCheckY: data.posY,
      lastCollisionCheckZ: data.posZ
    };

    this.projectiles.set(id, {
      entityId: id,
      component,
      mesh,
      isPredicted,
      spawnTime: Date.now()
    });
  }

  /**
   * Check swept collision against all players except the shooter.
   * Uses substeps for accuracy with fast projectiles (matches server).
   */
  private checkProjectileCollision(
    prevX: number, prevY: number, prevZ: number,
    newX: number, newY: number, newZ: number,
    shooterId: number
  ): boolean {
    if (!this.transformSync) return false;

    // Calculate total movement
    const totalDirX = newX - prevX;
    const totalDirY = newY - prevY;
    const totalDirZ = newZ - prevZ;
    const totalLength = Math.sqrt(totalDirX * totalDirX + totalDirY * totalDirY + totalDirZ * totalDirZ);

    if (totalLength < 0.0001) return false;

    // Substep collision: divide movement into smaller segments for accuracy
    for (let substep = 0; substep < PROJECTILE_SUBSTEPS; substep++) {
      const t0 = substep / PROJECTILE_SUBSTEPS;
      const t1 = (substep + 1) / PROJECTILE_SUBSTEPS;
      
      const stepStartX = prevX + totalDirX * t0;
      const stepStartY = prevY + totalDirY * t0;
      const stepStartZ = prevZ + totalDirZ * t0;
      
      const stepEndX = prevX + totalDirX * t1;
      const stepEndY = prevY + totalDirY * t1;
      const stepEndZ = prevZ + totalDirZ * t1;
      
      const rayDirX = stepEndX - stepStartX;
      const rayDirY = stepEndY - stepStartY;
      const rayDirZ = stepEndZ - stepStartZ;
      const rayLength = Math.sqrt(rayDirX * rayDirX + rayDirY * rayDirY + rayDirZ * rayDirZ);
      
      if (rayLength < 0.0001) continue;
      
      const rayDirNormX = rayDirX / rayLength;
      const rayDirNormY = rayDirY / rayLength;
      const rayDirNormZ = rayDirZ / rayLength;

      // Check all transforms for this substep
      const transforms = this.transformSync.getAllTransforms();
      for (const [entityId, transform] of transforms) {
        // Don't hit the shooter
        if (entityId === shooterId) continue;

        const pos = transform.getPosition();
        const bx = pos.x;
        const by = pos.y; // pos.y is already the hitbox center
        const bz = pos.z;

        // Check HEAD hitbox first (matches server priority)
        const headY = by + 1.3; // Head positioned +1.3 above body center (matches visual)
        const headHalfSize = 0.3;
        const headResult = rayVsAABB(
          stepStartX, stepStartY, stepStartZ,
          rayDirNormX, rayDirNormY, rayDirNormZ,
          rayLength,
          bx, headY, bz,
          headHalfSize
        );

        if (headResult.hit) {
          return true;
        }

        // Check BODY hitbox
        const bodyResult = rayVsAABB(
          stepStartX, stepStartY, stepStartZ,
          rayDirNormX, rayDirNormY, rayDirNormZ,
          rayLength,
          bx, by, bz,
          PLAYER_HITBOX_HALF
        );

        if (bodyResult.hit) {
          return true;
        }
      }
    } // End of substep loop

    return false;
  }

  dispose(): void {
    for (const proj of this.projectiles.values()) {
      proj.mesh.dispose();
    }
    this.projectiles.clear();
    this.serverEntityIdToPredictedId.clear();
    this.baseMesh.dispose();
    this.material.dispose();
  }
}
