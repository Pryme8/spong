import type { Scene, TransformNode } from '@babylonjs/core';
import type { ItemSpawnMessage, ItemUpdateMessage, ItemPickupMessage, VoxelGrid } from '@spong/shared';
import type { WeaponSystem, WeaponType } from './WeaponSystem';
import type { LocalTransform } from './LocalTransform';
import type { NetworkClient } from '../network/NetworkClient';
import { createPistolMesh } from './PistolMesh';
import { createSMGMesh } from './SMGMesh';
import { createLMGMesh } from './LMGMesh';
import { createShotgunMesh } from './ShotgunMesh';
import { createDoubleBarrelShotgunMesh } from './DoubleBarrelShotgunMesh';
import { createSniperMesh } from './SniperMesh';
import { createAssaultRifleMesh } from './AssaultRifleMesh';
import { createDMRMesh } from './DMRMesh';
import { createRocketLauncherMesh } from './RocketLauncherMesh';
import { createHammerMesh } from './HammerMesh';
import { createMedicPackMesh } from './MedicPackMesh';
import { createLargeMedicPackMesh } from './LargeMedicPackMesh';
import { createAppleMesh } from './AppleMesh';
import { createPillBottleMesh } from './PillBottleMesh';
import { createKevlarMesh } from './KevlarMesh';
import { createHelmetMesh } from './HelmetMesh';
import { createLadderMesh } from './LadderMesh';

export class ItemSystem {
  private itemNodes = new Map<number, TransformNode>(); // Tracks spawned items
  private isTossingItem = false;
  private tossingItemNode: TransformNode | null = null;

  /**
   * Handle item spawn from server
   */
  handleSpawn(payload: ItemSpawnMessage, scene: Scene): void {
    console.log(`[ItemSystem] Spawn: type=${payload.itemType} entity=${payload.entityId}`);

    // Remove existing node if re-spawned
    const existing = this.itemNodes.get(payload.entityId);
    if (existing) {
      existing.getChildMeshes().forEach(m => m.dispose());
      existing.dispose();
    }

    // Create the appropriate mesh based on item type
    let node: TransformNode;
    if (payload.itemType === 'smg') {
      node = createSMGMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'lmg') {
      node = createLMGMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'shotgun') {
      node = createShotgunMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'doublebarrel') {
      node = createDoubleBarrelShotgunMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'sniper') {
      node = createSniperMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'assault') {
      node = createAssaultRifleMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'dmr') {
      node = createDMRMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'rocket') {
      node = createRocketLauncherMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'hammer') {
      node = createHammerMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'medic_pack') {
      node = createMedicPackMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'large_medic_pack') {
      node = createLargeMedicPackMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'apple') {
      node = createAppleMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'pill_bottle') {
      node = createPillBottleMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'kevlar') {
      node = createKevlarMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'helmet') {
      node = createHelmetMesh(`item_${payload.entityId}`, scene);
    } else if (payload.itemType === 'ladder') {
      node = createLadderMesh(`item_${payload.entityId}`, scene);
    } else {
      node = createPistolMesh(`item_${payload.entityId}`, scene);
    }
    node.position.set(payload.posX, payload.posY, payload.posZ);
    this.itemNodes.set(payload.entityId, node);

    // Bobbing animation - float up and down so it's easy to spot
    const baseY = payload.posY;
    const bobObserver = scene.onBeforeRenderObservable.add(() => {
      if (!node || node.isDisposed()) {
        scene.onBeforeRenderObservable.remove(bobObserver);
        return;
      }
      // Always animate - more pronounced bounce and faster spin
      const currentBaseY = node.metadata?.settled ? node.metadata.settledY : baseY;
      const time = performance.now() * 0.001; // Time in seconds

      // Bouncing animation: sin wave for smooth up/down (shifted up 0.25 to prevent ground clipping)
      node.position.y = currentBaseY + 0.25 + Math.sin(time * 2.5) * 0.3;

      // Rotating animation: constant spin
      node.rotation.y = time * 1.5; // Full rotation every ~4 seconds
    });
    node.metadata = { bobObserver, settled: false, settledY: baseY };

    console.log(`[ItemSystem] Created ${payload.itemType} mesh for entity ${payload.entityId}`);
  }

  /**
   * Handle item position update from server
   */
  handleUpdate(payload: ItemUpdateMessage): void {
    const node = this.itemNodes.get(payload.entityId);
    if (node && node.metadata) {
      // Update base position if still moving
      if (!node.metadata.settled) {
        node.metadata.settledY = payload.posY;
      }

      // Mark as settled when physics stops
      if (payload.settled && !node.metadata.settled) {
        node.metadata.settled = true;
        node.metadata.settledY = payload.posY;
      }
    }
  }

  /**
   * Handle item pickup from server
   */
  handlePickup(
    payload: ItemPickupMessage,
    myEntityId: number | null,
    weaponSystem: WeaponSystem,
    scene: Scene,
    hasHammer?: { value: boolean },
    hasLadder?: { value: boolean },
    playerTransform?: any
  ): void {
    console.log(`[ItemSystem] Pickup: entity=${payload.entityId} by player=${payload.playerId}`);

    // Remove the item mesh from the world
    const node = this.itemNodes.get(payload.entityId);
    if (node) {
      if (node.metadata?.bobObserver && scene) {
        scene.onBeforeRenderObservable.remove(node.metadata.bobObserver);
      }
      node.getChildMeshes().forEach(m => m.dispose());
      node.dispose();
      this.itemNodes.delete(payload.entityId);
    }

    // If WE picked it up, check what type of item it is
    if (payload.playerId === myEntityId) {
      // Check if it's a pickup (health, ammo, etc.) or a weapon
      if (payload.itemType === 'medic_pack' || payload.itemType === 'large_medic_pack') {
        console.log(`[ItemSystem] We picked up a ${payload.itemType}! Health restored.`);
        // Health is handled server-side, just log here
      } else if (payload.itemType === 'apple') {
        console.log(`[ItemSystem] We picked up an apple! Stamina restored.`);
        // Stamina is handled server-side, just log here
      } else if (payload.itemType === 'pill_bottle') {
        console.log(`[ItemSystem] We picked up a pill bottle! INFINITE STAMINA activated!`);
        // Buff is handled server-side, just log here
      } else if (payload.itemType === 'kevlar') {
        console.log(`[ItemSystem] We picked up kevlar! +50 ARMOR!`);
        // Armor is handled server-side, just log here
      } else if (payload.itemType === 'helmet') {
        console.log(`[ItemSystem] We picked up helmet! HEADSHOT PROTECTION!`);
        // Helmet is handled server-side, just log here
      } else if (payload.itemType === 'hammer') {
        console.log(`[ItemSystem] We picked up a HAMMER! Building enabled!`);
        // Hammer enables building
        if (hasHammer) {
          hasHammer.value = true;
        }
      } else if (payload.itemType === 'ladder') {
        console.log(`[ItemSystem] We picked up a LADDER! Placement enabled!`);
        // Ladder enables ladder placement
        if (hasLadder) {
          hasLadder.value = true;
        }
      } else {
        // It's a weapon, equip it
        weaponSystem.equipWeapon(payload.itemType as WeaponType);
        console.log(`[ItemSystem] We picked up a ${payload.itemType}! Shooting enabled.`);
        // Also equip visual weapon on player transform
        if (playerTransform) {
          playerTransform.equipWeapon(payload.itemType as WeaponType);
        }
      }
    } else if (playerTransform && payload.itemType !== 'medic_pack' && payload.itemType !== 'large_medic_pack' && 
               payload.itemType !== 'apple' && payload.itemType !== 'pill_bottle' && payload.itemType !== 'kevlar' && 
               payload.itemType !== 'helmet' && payload.itemType !== 'hammer' && payload.itemType !== 'ladder') {
      // Remote player picked up a weapon - equip visual on their transform
      playerTransform.equipWeapon(payload.itemType as WeaponType);
    }
  }

  /**
   * Handle item drop (toss animation)
   */
  handleDrop(
    myTransform: LocalTransform,
    camYaw: number,
    weaponType: WeaponType,
    scene: Scene,
    networkClient: NetworkClient,
    voxelGrid?: VoxelGrid
  ): boolean {
    if (this.isTossingItem) return false;

    this.isTossingItem = true;

    // Calculate toss target (2.5 units in front of player, on ground)
    const state = myTransform.getState();
    const tossDistance = 2.5;
    const tossTargetX = state.posX + Math.sin(camYaw) * tossDistance;
    const tossTargetZ = state.posZ + Math.cos(camYaw) * tossDistance;

    // Sample ground height
    let tossTargetY = 0.5;
    if (voxelGrid) {
      tossTargetY = voxelGrid.getWorldSurfaceY(tossTargetX, tossTargetZ) + 0.5;
    }

    // Create visual weapon mesh for toss animation based on current weapon type
    if (weaponType === 'smg') {
      this.tossingItemNode = createSMGMesh('tossingItem', scene);
    } else if (weaponType === 'lmg') {
      this.tossingItemNode = createLMGMesh('tossingItem', scene);
    } else if (weaponType === 'shotgun') {
      this.tossingItemNode = createShotgunMesh('tossingItem', scene);
    } else if (weaponType === 'doublebarrel') {
      this.tossingItemNode = createDoubleBarrelShotgunMesh('tossingItem', scene);
    } else if (weaponType === 'sniper') {
      this.tossingItemNode = createSniperMesh('tossingItem', scene);
    } else if (weaponType === 'assault') {
      this.tossingItemNode = createAssaultRifleMesh('tossingItem', scene);
    } else if (weaponType === 'dmr') {
      this.tossingItemNode = createDMRMesh('tossingItem', scene);
    } else if (weaponType === 'rocket') {
      this.tossingItemNode = createRocketLauncherMesh('tossingItem', scene);
    } else if (weaponType === 'hammer') {
      this.tossingItemNode = createHammerMesh('tossingItem', scene);
    } else if (weaponType === 'ladder') {
      this.tossingItemNode = createLadderMesh('tossingItem', scene);
    } else {
      this.tossingItemNode = createPistolMesh('tossingItem', scene);
    }
    this.tossingItemNode.position.set(state.posX, state.posY + 1.5, state.posZ);

    // Animate toss arc (0.5 second duration)
    const startTime = performance.now();
    const duration = 500; // ms
    const startX = state.posX;
    const startY = state.posY + 1.5;
    const startZ = state.posZ;
    const arcHeight = 1.5;

    const tossObserver = scene.onBeforeRenderObservable.add(() => {
      if (!this.tossingItemNode || !scene) return;

      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);

      if (t >= 1) {
        // Animation complete
        scene.onBeforeRenderObservable.remove(tossObserver);
        this.tossingItemNode.dispose();
        this.tossingItemNode = null;
        this.isTossingItem = false;

        // Tell server item has landed
        networkClient.sendItemTossLand(tossTargetX, tossTargetY, tossTargetZ);
        return;
      }

      // Lerp position with parabolic arc
      this.tossingItemNode!.position.x = startX + (tossTargetX - startX) * t;
      this.tossingItemNode!.position.z = startZ + (tossTargetZ - startZ) * t;
      this.tossingItemNode!.position.y = startY + (tossTargetY - startY) * t + arcHeight * Math.sin(t * Math.PI);

      // Spin during flight
      this.tossingItemNode!.rotation.y += 0.1;
      this.tossingItemNode!.rotation.x += 0.05;
    });

    return true;
  }

  /**
   * Check if currently tossing an item
   */
  isTossing(): boolean {
    return this.isTossingItem;
  }

  /**
   * Dispose all item meshes
   */
  dispose(scene: Scene): void {
    this.itemNodes.forEach((node) => {
      if (node.metadata?.bobObserver && scene) {
        scene.onBeforeRenderObservable.remove(node.metadata.bobObserver);
      }
      node.getChildMeshes().forEach(m => m.dispose());
      node.dispose();
    });
    this.itemNodes.clear();

    if (this.tossingItemNode) {
      this.tossingItemNode.dispose();
      this.tossingItemNode = null;
    }
  }
}
