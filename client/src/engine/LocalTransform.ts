import { TransformNode, Scene, Vector3, Quaternion, MeshBuilder, Mesh, StandardMaterial, Color3 } from '@babylonjs/core';
import {
  TransformData,
  CharacterState,
  CharacterInput,
  createCharacterState,
  stepCharacter,
  FIXED_TIMESTEP,
  VoxelGrid,
  type RockColliderMesh,
  type RockTransform,
  type WaterLevelProvider
} from '@spong/shared';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';
import { ShadowManager } from './ShadowManager';
import { createPlayerArmorMesh, disposePlayerArmorMesh } from './PlayerArmorMesh';
import { createPlayerHelmetMesh, disposePlayerHelmetMesh } from './PlayerHelmetMesh';
import type { BuildingCollisionManager } from './BuildingCollisionManager';
import { WeaponHolder } from './WeaponHolder';
import type { WeaponType } from './WeaponSystem';

interface InputSnapshot {
  sequence: number;
  input: CharacterInput;
}

export class LocalTransform {
  readonly entityId: number;
  private node: TransformNode;
  private headNode: Mesh;
  private bodyNode: Mesh;
  private armorNode: TransformNode | null = null;
  private helmetNode: TransformNode | null = null;
  private weaponHolder: WeaponHolder;
  private state: CharacterState;
  private voxelGrid?: VoxelGrid;
  private buildingCollisionManager?: BuildingCollisionManager;
  private treeColliderGetter?: () => Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  private rockColliderGetter?: () => Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
  private octreeGetter?: () => any;
  private waterLevelProviderGetter?: () => WaterLevelProvider | undefined;
  private scene: Scene;

  // Current input (updated each physics tick, consumed by fixedUpdate)
  private input: CharacterInput = {
    forward: 0,
    right: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    jump: false,
    sprint: false
  };

  // Local vs remote
  private isLocal: boolean;

  // ── Input replay buffer (local player only) ────────────────
  private inputBuffer: InputSnapshot[] = [];
  private currentSequence = 0;
  private readonly MAX_BUFFER_SIZE = 128;

  // ── Local player: physics tick interpolation ───────────────
  // We store the state BEFORE the most recent physics step so we
  // can interpolate between (prev → current) using the accumulator alpha.
  // These are ONLY written by fixedUpdate() - never by reconciliation.
  private prevPosX = 0;
  private prevPosY = 0;
  private prevPosZ = 0;

  // ── Local player: visual error offset ──────────────────────
  // When server reconciliation produces a slightly different result
  // than our prediction, we absorb the delta here so the rendered
  // position doesn't visually jump. Then we exponentially decay it
  // toward zero over ~100ms.
  private errorOffsetX = 0;
  private errorOffsetY = 0;
  private errorOffsetZ = 0;

  // ── Local player: smooth visual Y ─────────────────────────
  // Instead of snapping to physics Y, we maintain a separate visual Y:
  //   Going UP while grounded → smooth rise (step-up / stair climb)
  //   Going DOWN → instant follow (falling must feel responsive)
  // This avoids any step-up detection logic entirely.
  private smoothY = 0;
  private smoothYInitialized = false;

  // ── Remote player: interpolation ───────────────────────────
  private prevPosition = Vector3.Zero();
  private prevRotation = Quaternion.Identity();
  private targetPosition = Vector3.Zero();
  private targetRotation = Quaternion.Identity();
  private targetHeadPitch = 0;
  private interpT = 0;
  private interpDuration = 0.05; // 50ms = 20Hz

  readonly hasShadows = true;

  constructor(
    entityId: number,
    scene: Scene,
    isLocal: boolean = false,
    voxelGrid?: VoxelGrid,
    buildingCollisionManager?: BuildingCollisionManager,
    treeColliderGetter?: () => Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>,
    rockColliderGetter?: () => Array<{ mesh: RockColliderMesh; transform: RockTransform }>,
    octreeGetter?: () => any,
    waterLevelProviderGetter?: () => WaterLevelProvider | undefined
  ) {
    this.entityId = entityId;
    this.isLocal = isLocal;
    this.voxelGrid = voxelGrid;
    this.buildingCollisionManager = buildingCollisionManager;
    this.treeColliderGetter = treeColliderGetter;
    this.rockColliderGetter = rockColliderGetter;
    this.octreeGetter = octreeGetter;
    this.waterLevelProviderGetter = waterLevelProviderGetter;
    this.scene = scene;
    this.node = new TransformNode(`local_${entityId}`, scene);
    this.node.position = Vector3.Zero();
    this.node.rotationQuaternion = Quaternion.Identity();
    this.state = createCharacterState();
    
    // Create body cube
    this.bodyNode = MeshBuilder.CreateBox(`body_${entityId}`, {
      width: 0.8,
      height: 1.0,
      depth: 0.8
    }, scene);
    this.bodyNode.parent = this.node;
    this.bodyNode.position.set(0, 0.5, 0);
    
    // Hide local player's body in first-person view
    if (isLocal) {
      this.bodyNode.isVisible = false;
    }
    
    const bodyMat = new StandardMaterial(`bodyMat_${entityId}`, scene);
    bodyMat.diffuseColor = new Color3(0.3, 0.3, 0.35); // Dark gray body
    bodyMat.emissiveColor = new Color3(0, 0, 0);
    bodyMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this.bodyNode.material = bodyMat;
    
    // Create head cube
    this.headNode = MeshBuilder.CreateBox(`head_${entityId}`, {
      width: 0.6,
      height: 0.6,
      depth: 0.6
    }, scene);
    this.headNode.parent = this.node;
    this.headNode.position.set(0, 1.3, 0);
    
    // Hide local player's head in first-person view
    if (isLocal) {
      this.headNode.isVisible = false;
    }
    
    const headMat = new StandardMaterial(`headMat_${entityId}`, scene);
    headMat.diffuseColor = new Color3(0.6, 0.5, 0.4); // Darker skin tone
    headMat.emissiveColor = new Color3(0, 0, 0); // No glow
    headMat.specularColor = new Color3(0.2, 0.15, 0.1); // Subtle specular
    this.headNode.material = headMat;
    
    // Register shadows if enabled
    if (this.hasShadows) {
      this.registerShadows();
    }

    // Initialize weapon holder
    this.weaponHolder = new WeaponHolder(scene, `player_${entityId}`, isLocal);
  }

  private registerShadows(): void {
    const sm = ShadowManager.getInstance();
    if (!sm) return;
    
    sm.addShadowCaster(this.bodyNode, true); // Enable self-shadows
    sm.addShadowCaster(this.headNode, true); // Enable self-shadows
  }

  /** Called when player cube instance is attached to this transform. */
  registerPlayerCube(cube: Mesh): void {
    if (this.hasShadows) {
      const sm = ShadowManager.getInstance();
      if (sm) {
        sm.addShadowCaster(cube, true); // Enable self-shadows
      }
    }
  }

  setInput(forward: number, right: number, cameraYaw: number, jump: boolean, sprint: boolean = false, cameraPitch: number = 0) {
    this.input.forward = forward;
    this.input.right = right;
    this.input.cameraYaw = cameraYaw;
    this.input.cameraPitch = cameraPitch;
    this.input.jump = jump;
    this.input.sprint = sprint;
  }

  setHeadPitch(pitch: number) {
    if (this.isLocal) {
      this.headNode.rotation.x = pitch;
    }
  }

  setCurrentSequence(seq: number) {
    this.currentSequence = seq;
  }

  /**
   * Called at fixed timestep (60 Hz).
   * Saves previous position, then steps simulation.
   */
  fixedUpdate(deltaTime: number) {
    if (!this.isLocal) return;

    // ── Save previous position for render interpolation ───────
    // ONLY this method writes to prevPos — reconciliation never touches it.
    this.prevPosX = this.state.posX;
    this.prevPosY = this.state.posY;
    this.prevPosZ = this.state.posZ;

    // Snapshot input
    const inputSnapshot: CharacterInput = {
      forward: this.input.forward,
      right: this.input.right,
      cameraYaw: this.input.cameraYaw,
      cameraPitch: this.input.cameraPitch,
      jump: this.input.jump,
      sprint: this.input.sprint
    };

    this.inputBuffer.push({
      sequence: this.currentSequence,
      input: inputSnapshot
    });

    if (this.inputBuffer.length > this.MAX_BUFFER_SIZE) {
      this.inputBuffer.shift();
    }

    // Get collision data for client-side prediction (must match server exactly)
    const blockColliders = this.buildingCollisionManager?.getBlockColliders();
    let treeColliders = this.treeColliderGetter?.() ?? [];
    let rockColliders = this.rockColliderGetter?.() ?? [];
    
    // Query octree for nearby colliders (broad-phase culling)
    const octree = this.octreeGetter?.();
    if (octree) {
      const nearby = octree.queryPoint(this.state.posX, this.state.posY, this.state.posZ, 8);
      treeColliders = nearby.filter((e: any) => e.type === 'tree').map((e: any) => e.data);
      rockColliders = nearby.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
    }
    
    const waterProvider = this.waterLevelProviderGetter ? this.waterLevelProviderGetter() : undefined;
    stepCharacter(this.state, this.input, deltaTime, this.voxelGrid, treeColliders, rockColliders, blockColliders, waterProvider);
  }

  /**
   * Server reconciliation.
   *
   * 1. Save our current predicted position
   * 2. Snap to server state and replay unacknowledged inputs
   * 3. Compute the delta between old and new prediction
   * 4. Absorb that delta into errorOffset (so the visual pos doesn't jump)
   *
   * IMPORTANT: we never touch prevPosX/Y/Z here. Those belong to fixedUpdate
   * and represent the physics tick boundary. Corrupting them would break
   * the render interpolation.
   */
  applyServerState(data: TransformData) {
    if (this.isLocal) {
      // 1. Prune acknowledged inputs
      if (data.lastProcessedInput) {
        this.inputBuffer = this.inputBuffer.filter(
          snapshot => snapshot.sequence > data.lastProcessedInput!
        );
      }

      // 2. Remember where we predicted we'd be RIGHT NOW
      const oldPredictedX = this.state.posX;
      const oldPredictedY = this.state.posY;
      const oldPredictedZ = this.state.posZ;

      // 3. Snap simulation to server's authoritative state
      this.state.posX = data.position.x;
      this.state.posY = data.position.y;
      this.state.posZ = data.position.z;
      this.state.velX = data.velocity.x;
      this.state.velY = data.velocity.y;
      this.state.velZ = data.velocity.z;
      
      // Sync water state from server
      if (data.isInWater !== undefined) {
        this.state.isInWater = data.isInWater;
      }
      if (data.isHeadUnderwater !== undefined) {
        this.state.isHeadUnderwater = data.isHeadUnderwater;
      }
      if (data.breathRemaining !== undefined) {
        this.state.breathRemaining = data.breathRemaining;
      }
      if (data.waterDepth !== undefined) {
        this.state.waterDepth = data.waterDepth;
      }
      if (data.isExhausted !== undefined) {
        this.state.isExhausted = data.isExhausted;
      }

      // 4. Replay all unacknowledged inputs
      // CRITICAL: Must use same collision data as initial prediction
      const blockColliders = this.buildingCollisionManager?.getBlockColliders();
      let treeColliders = this.treeColliderGetter?.() ?? [];
      let rockColliders = this.rockColliderGetter?.() ?? [];
      
      // Query octree for nearby colliders (broad-phase culling)
      const octree = this.octreeGetter?.();
      if (octree) {
        const nearby = octree.queryPoint(this.state.posX, this.state.posY, this.state.posZ, 8);
        treeColliders = nearby.filter((e: any) => e.type === 'tree').map((e: any) => e.data);
        rockColliders = nearby.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
      }
      
      for (const snapshot of this.inputBuffer) {
        const waterProvider = this.waterLevelProviderGetter ? this.waterLevelProviderGetter() : undefined;
        stepCharacter(this.state, snapshot.input, FIXED_TIMESTEP, this.voxelGrid, treeColliders, rockColliders, blockColliders, waterProvider);
      }

      // 5. How much did our prediction change?
      const deltaX = oldPredictedX - this.state.posX;
      const deltaY = oldPredictedY - this.state.posY;
      const deltaZ = oldPredictedZ - this.state.posZ;
      const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);

      if (dist > 4.0) {
        // Huge desync (teleport / respawn) — hard snap, zero offset
        this.errorOffsetX = 0;
        this.errorOffsetY = 0;
        this.errorOffsetZ = 0;
        // Also reset prev so interpolation doesn't lerp from stale data
        this.prevPosX = this.state.posX;
        this.prevPosY = this.state.posY;
        this.prevPosZ = this.state.posZ;
        // Hard-snap visual Y too
        this.smoothY = this.state.posY;
      } else {
        // Absorb the correction into the visual offset.
        // This keeps the rendered position continuous — no visible pop.
        this.errorOffsetX += deltaX;
        this.errorOffsetY += deltaY;
        this.errorOffsetZ += deltaZ;
      }
    } else {
      // Remote player — set up interpolation targets
      const newTargetX = data.position.x;
      const newTargetY = data.position.y;
      const newTargetZ = data.position.z;
      
      // Check for large teleport (respawn/death)
      const deltaX = newTargetX - this.node.position.x;
      const deltaY = newTargetY - this.node.position.y;
      const deltaZ = newTargetZ - this.node.position.z;
      const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      
      if (dist > 4.0) {
        // Large teleport (respawn) - snap immediately without interpolation
        this.node.position.set(newTargetX, newTargetY, newTargetZ);
        this.prevPosition.copyFrom(this.node.position);
        this.targetPosition.copyFrom(this.node.position);
        
        if (this.node.rotationQuaternion) {
          this.node.rotationQuaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
          this.prevRotation.copyFrom(this.node.rotationQuaternion);
          this.targetRotation.copyFrom(this.node.rotationQuaternion);
        }
        this.targetHeadPitch = data.headPitch || 0;
        this.headNode.rotation.x = this.targetHeadPitch;
        this.interpT = 1.0;
      } else {
        // Normal movement - interpolate smoothly
        this.prevPosition.copyFrom(this.node.position);
        if (this.node.rotationQuaternion) {
          this.prevRotation.copyFrom(this.node.rotationQuaternion);
        }
        this.targetPosition.set(newTargetX, newTargetY, newTargetZ);
        this.targetRotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
        this.targetHeadPitch = data.headPitch || 0;
        this.interpT = 0;
      }
      
      // Sync water state for remote players too (for future effects)
      if (data.isInWater !== undefined) {
        this.state.isInWater = data.isInWater;
      }
      if (data.isHeadUnderwater !== undefined) {
        this.state.isHeadUnderwater = data.isHeadUnderwater;
      }
      if (data.breathRemaining !== undefined) {
        this.state.breathRemaining = data.breathRemaining;
      }
      if (data.waterDepth !== undefined) {
        this.state.waterDepth = data.waterDepth;
      }
      if (data.isExhausted !== undefined) {
        this.state.isExhausted = data.isExhausted;
      }
    }
  }

  /**
   * Called every render frame.
   *
   * Local player:
   *   renderPos = lerp(prevPos, state, alpha) + errorOffset
   *   errorOffset decays exponentially each frame
   *
   * @param physicsAlpha 0-1 fraction between last and next physics tick
   */
  update(deltaTime: number, physicsAlpha: number = 0) {
    if (!this.node.rotationQuaternion) {
      this.node.rotationQuaternion = Quaternion.Identity();
    }

    if (this.isLocal) {
      // ── Decay error offset (~100ms half-life) ────────────────
      const decay = 1 - Math.exp(-10 * deltaTime);
      this.errorOffsetX *= 1 - decay;
      this.errorOffsetY *= 1 - decay;
      this.errorOffsetZ *= 1 - decay;

      // Kill negligible offsets to prevent floating point drift
      if (Math.abs(this.errorOffsetX) < 0.001) this.errorOffsetX = 0;
      if (Math.abs(this.errorOffsetY) < 0.001) this.errorOffsetY = 0;
      if (Math.abs(this.errorOffsetZ) < 0.001) this.errorOffsetZ = 0;

      // ── Interpolate X/Z between physics tick boundaries ──────
      const renderX = this.prevPosX + (this.state.posX - this.prevPosX) * physicsAlpha;
      const renderZ = this.prevPosZ + (this.state.posZ - this.prevPosZ) * physicsAlpha;

      // ── Smooth visual Y ──────────────────────────────────────
      // Physics Y (the "truth" we're chasing)
      const targetY = this.prevPosY + (this.state.posY - this.prevPosY) * physicsAlpha;

      if (!this.smoothYInitialized) {
        this.smoothY = targetY;
        this.smoothYInitialized = true;
      }

      if (targetY < this.smoothY) {
        // Going DOWN (falling, stepping off edge) → follow instantly.
        // Falling must feel responsive with zero lag.
        this.smoothY = targetY;
      } else if (targetY > this.smoothY) {
        // Going UP while on ground (step-up) → smooth rise.
        // Rate: ~4 units/sec ensures 0.5u step takes ~125ms.
        const maxRise = 4.0 * deltaTime;
        const diff = targetY - this.smoothY;
        this.smoothY += Math.min(diff, maxRise);
      }

      // ── Final visual position ────────────────────────────────
      this.node.position.x = renderX + this.errorOffsetX;
      this.node.position.y = this.smoothY + this.errorOffsetY;
      this.node.position.z = renderZ + this.errorOffsetZ;

      // Rotation from state
      this.node.rotationQuaternion.set(
        0,
        Math.sin(this.state.yaw * 0.5),
        0,
        Math.cos(this.state.yaw * 0.5)
      );
    } else {
      this.interpT = Math.min(1.0, this.interpT + deltaTime / this.interpDuration);
      Vector3.LerpToRef(this.prevPosition, this.targetPosition, this.interpT, this.node.position);
      Quaternion.SlerpToRef(this.prevRotation, this.targetRotation, this.interpT, this.node.rotationQuaternion);
      this.headNode.rotation.x = this.targetHeadPitch;

      // Update remote player's weapon holder (third-person view)
      this.updateWeaponHolder();
    }
  }

  getNode(): TransformNode {
    return this.node;
  }

  getPosition(): Vector3 {
    return this.node.position;
  }

  getState(): Readonly<CharacterState> {
    return this.state;
  }

  /**
   * Set whether this player has armor (shows/hides armor mesh).
   */
  setArmor(hasArmor: boolean) {
    if (hasArmor && !this.armorNode) {
      // Create armor mesh
      this.armorNode = createPlayerArmorMesh(`player_${this.entityId}`, this.scene);
      this.armorNode.parent = this.node;
      console.log(`[LocalTransform] Created armor mesh for entity ${this.entityId}`);
    } else if (!hasArmor && this.armorNode) {
      // Remove armor mesh
      disposePlayerArmorMesh(`player_${this.entityId}`, this.scene);
      this.armorNode = null;
      console.log(`[LocalTransform] Removed armor mesh for entity ${this.entityId}`);
    }
  }

  /**
   * Set whether this player has helmet (shows/hides helmet mesh).
   */
  setHelmet(hasHelmet: boolean) {
    if (hasHelmet && !this.helmetNode) {
      // Create helmet mesh attached to head
      this.helmetNode = createPlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode.parent = this.headNode;
      console.log(`[LocalTransform] Created helmet mesh for entity ${this.entityId}`);
    } else if (!hasHelmet && this.helmetNode) {
      // Remove helmet mesh
      disposePlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode = null;
      console.log(`[LocalTransform] Removed helmet mesh for entity ${this.entityId}`);
    }
  }

  /**
   * Equip a weapon (shows weapon mesh)
   */
  equipWeapon(weaponType: WeaponType): void {
    this.weaponHolder.equipWeapon(weaponType);
  }

  /**
   * Clear weapon (removes weapon mesh)
   */
  clearWeapon(): void {
    this.weaponHolder.clearWeapon();
  }

  /**
   * Set visibility of player mesh (for debug third-person view)
   */
  setMeshVisibility(visible: boolean): void {
    this.headNode.isVisible = visible;
    this.bodyNode.isVisible = visible;
  }

  /**
   * Get weapon holder (for debug panel)
   */
  getWeaponHolder(): WeaponHolder {
    return this.weaponHolder;
  }

  /**
   * Update weapon holder position (pass camera for local player in first-person)
   */
  updateWeaponHolder(camera?: any): void {
    if (camera) {
      // First-person mode (weapon attached to camera)
      this.weaponHolder.updateFirstPerson(camera);
    } else {
      // Third-person mode (weapon attached to player node)
      this.weaponHolder.updateThirdPerson(this.node);
    }
  }

  dispose() {
    if (this.armorNode) {
      disposePlayerArmorMesh(`player_${this.entityId}`, this.scene);
      this.armorNode = null;
    }
    if (this.helmetNode) {
      disposePlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode = null;
    }
    this.weaponHolder.dispose();
    this.bodyNode.dispose();
    this.headNode.dispose();
    this.node.dispose();
  }
}
