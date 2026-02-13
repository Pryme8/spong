import type { World } from '@spong/shared';
import {
  COMP_PLAYER,
  COMP_COLLECTED,
  COMP_SHOOTABLE,
  COMP_AMMO,
  COMP_WEAPON_TYPE,
  Opcode,
  getCurrentAccuracy,
  getBloomIncrement,
  type PlayerComponent,
  type CollectedComponent,
  type ShootableComponent,
  type AmmoComponent,
  type WeaponTypeComponent,
  type ReloadStartedMessage,
  type ProjectileSpawnData,
  type WeaponType,
} from '@spong/shared';
import type { ProjectileSystem } from './ProjectileSystem.js';
import type { RoundSystem } from './RoundSystem.js';

export interface ShootSystemOptions {
  world: World;
  getPlayer: (connectionId: string) => { entityId: number } | undefined;
  projectileSystem: ProjectileSystem;
  roundSystem: RoundSystem;
  broadcast: (opcode: number, msg: unknown) => void;
}

export class ShootSystem {
  private readonly world: World;
  private readonly getPlayer: (connectionId: string) => { entityId: number } | undefined;
  private readonly projectileSystem: ProjectileSystem;
  private readonly roundSystem: RoundSystem;
  private readonly broadcast: (opcode: number, msg: unknown) => void;

  constructor(options: ShootSystemOptions) {
    this.world = options.world;
    this.getPlayer = options.getPlayer;
    this.projectileSystem = options.projectileSystem;
    this.roundSystem = options.roundSystem;
    this.broadcast = options.broadcast;
  }

  handleShootRequest(
    connectionId: string,
    aimDirX: number,
    aimDirY: number,
    aimDirZ: number,
    clientSpawnX: number,
    clientSpawnY: number,
    clientSpawnZ: number
  ): ProjectileSpawnData | ProjectileSpawnData[] | null {
    const player = this.getPlayer(connectionId);
    if (!player) {
      console.log('[Shoot] No player found for connection');
      return null;
    }

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) {
      console.log('[Shoot] No player entity found');
      return null;
    }

    const pc = playerEntity.get<PlayerComponent>(COMP_PLAYER);
    if (!pc) {
      console.log('[Shoot] No player component');
      return null;
    }

    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (!collected || collected.items.length === 0) {
      console.log('[Shoot] No weapon in collection');
      return null;
    }

    const weaponTypeComp = playerEntity.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
    const weaponType = weaponTypeComp?.type || 'unknown';

    const shootable = playerEntity.get<ShootableComponent>(COMP_SHOOTABLE);
    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);

    if (!shootable || !ammo) {
      console.log('[Shoot] Missing shootable or ammo component');
      return null;
    }

    if (ammo.isReloading) return null;

    if (!ammo.infinite && ammo.current <= 0) {
      const now = Date.now() * 0.001;
      ammo.isReloading = true;
      ammo.reloadStartTime = now;
      if (collected.items.length > 0) {
        const weaponEntity = this.world.getEntity(collected.items[0]);
        const wt = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
        const reloadMsg: ReloadStartedMessage = {
          entityId: player.entityId,
          weaponType: wt?.type || 'pistol',
          excludeSender: true,
        };
        this.broadcast(Opcode.ReloadStarted, reloadMsg);
      }
      return null;
    }

    const now = Date.now() * 0.001;
    const cooldown = 1.0 / shootable.fireRate;
    if (now - shootable.lastFireTime < cooldown) return null;
    shootable.lastFireTime = now;

    if (!ammo.infinite) {
      const ammoPerShot = weaponType === 'doublebarrel' ? 2 : 1;
      ammo.current -= ammoPerShot;
    }

    const len = Math.sqrt(aimDirX * aimDirX + aimDirY * aimDirY + aimDirZ * aimDirZ);
    if (len < 0.001) return null;
    const baseDirX = aimDirX / len;
    const baseDirY = aimDirY / len;
    const baseDirZ = aimDirZ / len;

    const pelletCount = shootable.pelletsPerShot || 1;
    const currentAccuracy = getCurrentAccuracy(weaponType as WeaponType, shootable.currentBloom);

    const result = this.projectileSystem.spawn(this.world, {
      ownerId: player.entityId,
      weaponType,
      posX: clientSpawnX,
      posY: clientSpawnY,
      posZ: clientSpawnZ,
      baseDirX,
      baseDirY,
      baseDirZ,
      pelletCount,
      currentAccuracy,
      projectileSpeed: shootable.projectileSpeed,
      damage: shootable.damage,
      gravityStartDistance: shootable.gravityStartDistance,
      proximityRadius: shootable.proximityRadius,
    });

    const bloomIncrement = getBloomIncrement(weaponType as WeaponType);
    shootable.currentBloom += bloomIncrement;

    const spawnDataArray = Array.isArray(result) ? result : [result];
    for (let i = 0; i < spawnDataArray.length; i++) {
      this.roundSystem.trackShotFired(player.entityId);
    }

    return result;
  }

  handleReloadRequest(connectionId: string): void {
    const player = this.getPlayer(connectionId);
    if (!player) return;

    const playerEntity = this.world.getEntity(player.entityId);
    if (!playerEntity) return;

    const ammo = playerEntity.get<AmmoComponent>(COMP_AMMO);
    if (!ammo) return;

    if (ammo.isReloading || ammo.infinite || ammo.current >= ammo.capacity) return;

    const now = Date.now() * 0.001;
    ammo.isReloading = true;
    ammo.reloadStartTime = now;

    const collected = playerEntity.get<CollectedComponent>(COMP_COLLECTED);
    if (collected && collected.items.length > 0) {
      const weaponEntity = this.world.getEntity(collected.items[0]);
      const weaponTypeComp = weaponEntity?.get<WeaponTypeComponent>(COMP_WEAPON_TYPE);
      const reloadMsg: ReloadStartedMessage = {
        entityId: player.entityId,
        weaponType: weaponTypeComp?.type || 'pistol',
        excludeSender: true,
      };
      this.broadcast(Opcode.ReloadStarted, reloadMsg);
    }
  }
}
