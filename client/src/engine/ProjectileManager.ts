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
    // If this is our own projectile, destroy the predicted version
    if (this.myEntityId !== null && data.ownerId === this.myEntityId) {
      // Destroy ALL predicted projectiles from us (there should only be one)
      for (const id of [...this.recentPredictedIds]) {
        const proj = this.projectiles.get(id);
        if (proj && proj.isPredicted && proj.component.ownerId === data.ownerId) {
          this.destroy(id);
        }
      }
      this.recentPredictedIds = this.recentPredictedIds.filter(id => this.projectiles.has(id));
    }

    // Don't create if already exists (safety check)
    if (this.projectiles.has(data.entityId)) {
      return;
    }

    this.createProjectile(data.entityId, data, false);
  }

  /** Spawn a batch of projectiles from server broadcast (for multi-pellet weapons). */
  spawnBatchFromServer(dataArray: ProjectileSpawnData[]): void {
    if (dataArray.length === 0) return;

    // Clean up predicted projectiles once for the entire batch
    const ownerId = dataArray[0].ownerId;
    if (this.myEntityId !== null && ownerId === this.myEntityId) {
      // Destroy ALL predicted projectiles from us
      for (const id of [...this.recentPredictedIds]) {
        const proj = this.projectiles.get(id);
        if (proj && proj.isPredicted && proj.component.ownerId === ownerId) {
          this.destroy(id);
        }
      }
      this.recentPredictedIds = this.recentPredictedIds.filter(id => this.projectiles.has(id));
    }

    // Create all projectiles in the batch
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

  /** Remove a projectile by entity ID. Returns position if found. */
  destroy(entityId: number): { x: number; y: number; z: number } | null {
    const proj = this.projectiles.get(entityId);
    if (proj) {
      const position = {
        x: proj.mesh.position.x,
        y: proj.mesh.position.y,
        z: proj.mesh.position.z
      };
      proj.mesh.dispose();
      this.projectiles.delete(entityId);
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
   * Find a predicted projectile that matches the server spawn data.
   * Match by owner + recency. The cooldown system ensures at most one
   * predicted projectile per player at a time, so owner match is sufficient.
   */
  private findMatchingPredicted(serverData: ProjectileSpawnData): number | null {
    const now = Date.now();

    for (const id of this.recentPredictedIds) {
      const proj = this.projectiles.get(id);
      if (!proj || !proj.isPredicted) continue;

      // Check if too old
      if (now - proj.spawnTime > this.MATCH_WINDOW_MS) continue;

      // Match by owner -- cooldown guarantees one in-flight per player
      if (proj.component.ownerId === serverData.ownerId) {
        return id;
      }
    }

    return null;
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
        const by = pos.y + PLAYER_HITBOX_CENTER_Y;
        const bz = pos.z;

        // Check HEAD hitbox first (matches server priority)
        const headY = by + 0.8;
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
    this.baseMesh.dispose();
    this.material.dispose();
  }
}
