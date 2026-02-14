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
  type RockTransform
} from '@spong/shared';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';
import { ShadowManager } from '../systems/ShadowManager';
import { createPlayerArmorMesh, disposePlayerArmorMesh } from '../entities/items/PlayerArmorMesh';
import { createPlayerHelmetMesh, disposePlayerHelmetMesh } from '../entities/items/PlayerHelmetMesh';
import type { BuildingCollisionManager } from '../building/BuildingCollisionManager';
import { EYE_HEIGHT, EYE_FORWARD_OFFSET, LAYER_HIDDEN_FROM_MAIN } from '../camera/CameraController';
import { WeaponHolder } from '../systems/WeaponHolder';
import type { WeaponType } from '../systems/WeaponSystem';
import { LevelWaterManager } from '../managers/LevelWaterManager';

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
  /** For remote players: view node at eye height with yaw+pitch so weapon matches first-person view. */
  private weaponViewNode: TransformNode | null = null;
  private state: CharacterState;
  private voxelGrid?: VoxelGrid;
  private buildingCollisionManager?: BuildingCollisionManager;
  private treeColliderGetter?: () => Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  private rockColliderGetter?: () => Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
  private octreeGetter?: () => any;
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
  private readonly MAX_BUFFER_SIZE = 64;

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
    octreeGetter?: () => any
  ) {
    this.entityId = entityId;
    this.isLocal = isLocal;
    this.voxelGrid = voxelGrid;
    this.buildingCollisionManager = buildingCollisionManager;
    this.treeColliderGetter = treeColliderGetter;
    this.rockColliderGetter = rockColliderGetter;
    this.octreeGetter = octreeGetter;
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
    if (isLocal) {
      this.headNode.layerMask = LAYER_HIDDEN_FROM_MAIN;
    }

    const headMat = new StandardMaterial(`headMat_${entityId}`, scene);
    headMat.diffuseColor = new Color3(0.6, 0.5, 0.4); // Default; overridden by setPlayerColor when player joins
    headMat.emissiveColor = new Color3(0, 0, 0); // No glow
    headMat.specularColor = new Color3(0.2, 0.15, 0.1); // Subtle specular
    this.headNode.material = headMat;
    
    // Register shadows if enabled
    if (this.hasShadows) {
      this.registerShadows();
    }

    // Initialize weapon holder
    this.weaponHolder = new WeaponHolder(scene, `player_${entityId}`, isLocal);

    // Remote players: create view node at eye height so weapon can use first-person hold transform
    if (!isLocal) {
      this.weaponViewNode = new TransformNode(`player_${entityId}_weaponView`, scene);
      this.weaponViewNode.parent = this.node;
      this.weaponViewNode.position.set(0, EYE_HEIGHT, EYE_FORWARD_OFFSET);
      this.weaponViewNode.rotationQuaternion = Quaternion.Identity();
    }
  }

  private registerShadows(): void {
    const sm = ShadowManager.getInstance();
    if (!sm) return;
    
    sm.addShadowCaster(this.bodyNode, true); // Enable self-shadows
    sm.addShadowCaster(this.headNode, true); // Enable self-shadows
  }

  /**
   * Set player color (used for head so players have distinct skin/head colors like the cube).
   */
  setPlayerColor(color: Color3): void {
    const headMat = this.headNode.material as StandardMaterial;
    if (headMat) headMat.diffuseColor = color.clone();
  }

  /** Called when player cube instance is attached. Hides default body only; keeps head visible and repositions it to sit on the cube (cube top at 0.5, head center at 0.8). */
  registerPlayerCube(cube: Mesh): void {
    this.bodyNode.setEnabled(false);
    this.bodyNode.position.y = -1000000; // Keep out of raycast range
    this.headNode.position.y = 0.8; // Cube is 1.0 tall, top at 0.5; head 0.6 tall → center at 0.5 + 0.3
    if (this.hasShadows) {
      const sm = ShadowManager.getInstance();
      if (sm) {
        sm.addShadowCaster(cube, true);
        sm.addShadowCaster(this.headNode, true);
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
    const blockColliders = this.buildingCollisionManager?.getBlockCollidersNear(
      this.state.posX, this.state.posY, this.state.posZ, 8
    );
    const fullTreeColliders = this.treeColliderGetter?.() ?? [];
    const fullRockColliders = this.rockColliderGetter?.() ?? [];
    let treeColliders = fullTreeColliders;
    let rockColliders = fullRockColliders;

    // Query octree for nearby colliders (broad-phase culling)
    const octree = this.octreeGetter?.();
    if (octree) {
      const nearby = octree.queryPoint(this.state.posX, this.state.posY, this.state.posZ, 8);
      treeColliders = nearby.filter((e: any) => e.type === 'tree').map((e: any) => e.data);
      rockColliders = nearby.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
    }

    stepCharacter(this.state, this.input, deltaTime, this.voxelGrid, treeColliders, rockColliders, blockColliders);
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
      // NOTE: We intentionally do NOT apply data.rotation or data.headPitch for the local player.
      // Camera rotation (yaw/pitch) is client-authoritative — the server echoes it for remote
      // rendering, but we never let server state override our camera. This keeps look feel
      // responsive at any latency; only position/velocity are reconciled.
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
      const blockColliders = this.buildingCollisionManager?.getBlockCollidersNear(
        this.state.posX, this.state.posY, this.state.posZ, 8
      );
      const fullTreeColliders = this.treeColliderGetter?.() ?? [];
      const fullRockColliders = this.rockColliderGetter?.() ?? [];
      let treeColliders = fullTreeColliders;
      let rockColliders = fullRockColliders;

      const octree = this.octreeGetter?.();
      if (octree) {
        const nearby = octree.queryPoint(this.state.posX, this.state.posY, this.state.posZ, 8);
        treeColliders = nearby.filter((e: any) => e.type === 'tree').map((e: any) => e.data);
        rockColliders = nearby.filter((e: any) => e.type === 'rock').map((e: any) => e.data);
      }

      for (const snapshot of this.inputBuffer) {
        stepCharacter(this.state, snapshot.input, FIXED_TIMESTEP, this.voxelGrid, treeColliders, rockColliders, blockColliders);
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

      // View node is a child of the body, so we only set local rotation: PI so -Z = body forward, plus pitch.
      // Pitch is negated so remote weapon points the same direction as the local first-person view.
      if (this.weaponViewNode && this.weaponViewNode.rotationQuaternion) {
        this.weaponViewNode.rotationQuaternion.copyFrom(
          Quaternion.RotationYawPitchRoll(Math.PI, -this.targetHeadPitch, 0)
        );
      }

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
    } else if (!hasArmor && this.armorNode) {
      // Remove armor mesh
      disposePlayerArmorMesh(`player_${this.entityId}`, this.scene);
      this.armorNode = null;
    }
  }

  private setHelmetLayerMask(mask: number): void {
    if (!this.helmetNode) return;
    const meshes = this.helmetNode.getChildMeshes(false);
    for (const mesh of meshes) {
      mesh.layerMask = mask;
    }
  }

  /**
   * Set whether this player has helmet (shows/hides helmet mesh).
   */
  setHelmet(hasHelmet: boolean) {
    if (hasHelmet && !this.helmetNode) {
      this.helmetNode = createPlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode.parent = this.headNode;
      if (this.isLocal) {
        this.setHelmetLayerMask(LAYER_HIDDEN_FROM_MAIN);
      }
    } else if (!hasHelmet && this.helmetNode) {
      // Remove helmet mesh
      disposePlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode = null;
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
   * Set visibility of player mesh (for debug third-person view). When visible, head/helmet use main layer so camera sees them.
   */
  setMeshVisibility(visible: boolean): void {
    this.headNode.isVisible = visible;
    this.bodyNode.isVisible = visible;
    if (this.isLocal) {
      this.headNode.layerMask = visible ? 0x0FFFFFFF : LAYER_HIDDEN_FROM_MAIN;
      this.setHelmetLayerMask(visible ? 0x0FFFFFFF : LAYER_HIDDEN_FROM_MAIN);
    }
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
      // Third-person: weapon on view node at eye height so it matches first-person position
      this.weaponHolder.updateThirdPerson(this.weaponViewNode ?? this.node);
    }
  }

  dispose() {
    LevelWaterManager.getInstance()?.removeNodeFromMirrorRenderList(this.node);
    if (this.armorNode) {
      disposePlayerArmorMesh(`player_${this.entityId}`, this.scene);
      this.armorNode = null;
    }
    if (this.helmetNode) {
      disposePlayerHelmetMesh(`player_${this.entityId}`, this.scene);
      this.helmetNode = null;
    }
    if (this.weaponViewNode) {
      this.weaponViewNode.dispose();
      this.weaponViewNode = null;
    }
    this.weaponHolder.dispose();
    this.bodyNode.dispose();
    this.headNode.dispose();
    this.node.dispose();
  }
}
