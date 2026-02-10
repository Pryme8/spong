import { ref, computed, Ref, watch } from 'vue';
import type { Engine, Scene } from '@babylonjs/core';
import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import {
  FIXED_TIMESTEP,
  Opcode,
  InputData,
  PLAYER_MAX_HEALTH,
  VoxelGrid,
  GreedyMesher
} from '@spong/shared';
import { NetworkClient } from '../network/NetworkClient';
import { useRoom } from './useRoom';
import { useTransformSync } from './useTransformSync';
import { useRoundState } from './useRoundState';
import { createEngine, createGameScene, createPlayerInstance, hexToColor3 } from '../engine/setupScene';
import { generateSunConfig } from '@spong/shared';
import { InputManager } from '../engine/InputManager';
import { CameraController } from '../engine/CameraController';
import { ProjectileManager } from '../engine/ProjectileManager';
import { LevelMesh } from '../engine/LevelMesh';
import { LevelTreeManager } from '../engine/LevelTreeManager';
import { LevelRockManager } from '../engine/LevelRockManager';
import { CloudPostProcess } from '../engine/CloudPostProcess';
import { LevelCloudManager } from '../engine/LevelCloudManager';
import { FinalPostProcess } from '../engine/FinalPostProcess';
import { SkyPickSphere } from '../engine/SkyPickSphere';
import { AudioManager } from '../engine/AudioManager';
import { SOUND_MANIFEST } from '../engine/soundManifest';
import { playSFX3D } from '../engine/audioHelpers';
import { WeaponSystem } from '../engine/WeaponSystem';
import { ItemSystem } from '../engine/ItemSystem';
import { GameLoop } from '../engine/GameLoop';
import { BuildingCollisionManager } from '../engine/BuildingCollisionManager';
import { BuildSystem } from '../engine/BuildSystem';
import { LadderPlacementSystem } from '../engine/LadderPlacementSystem';
import { createLadderSegmentMesh, disposeLadderMesh } from '../engine/LadderMesh';
import type { 
  BuildingInitialStateMessage, 
  BuildingCreatedMessage,
  BuildingTransformedMessage,
  BuildingDestroyedMessage,
  BlockPlacedMessage, 
  BlockRemovedMessage,
  LadderSpawnedMessage,
  LadderDestroyedMessage,
  KillFeedMessage
} from '@spong/shared';

export interface KillFeedEntry {
  id: number;
  killerEntityId: number;
  killerColor: string;
  victimEntityId: number;
  victimColor: string;
  weaponType: string | null;
  timestamp: number;
}

export interface GameSessionConfig {
  roomId: string;
  levelSeed?: string;
  isMobile?: boolean;
  levelConfig?: any;
}

export function useGameSession() {
  // State refs
  const isConnected = ref(false);
  const isInRoom = ref(false);
  const roomId = ref<string | null>(null);
  const myEntityId = ref<number | null>(null);
  const players = ref<Map<string, any>>(new Map());
  const playerHealth = ref(PLAYER_MAX_HEALTH);
  const playerArmor = ref(0);
  const playerHelmetHealth = ref(0);
  const playerStamina = ref(100);
  const playerIsExhausted = ref(false);
  const playerHasInfiniteStamina = ref(false);
  const playerX = ref(0);
  const playerY = ref(0);
  const playerZ = ref(0);
  
  // Round state (needs to be at top level to be returned)
  const roundState = useRoundState();
  
  // Latency tracking
  const latency = ref(0);
  const latencySamples: number[] = [];
  const MAX_LATENCY_SAMPLES = 20;
  let lastInputSendTime = 0;
  
  const pingColorClass = computed(() => {
    if (latency.value >= 120) return 'ping-red';
    if (latency.value >= 60) return 'ping-yellow';
    return 'ping-green';
  });
  
  // Local references to systems and managers
  let engine: Engine | null = null;
  let scene: Scene | null = null;
  let networkClient: NetworkClient | null = null;
  let transformSync: ReturnType<typeof useTransformSync> | null = null;
  let inputManager: InputManager | null = null;
  let cameraController: CameraController | null = null;
  const myTransform = ref<any>(null);
  let projectileManager: ProjectileManager | null = null;
  let levelMesh: LevelMesh | null = null;
  let voxelGrid: VoxelGrid | null = null;
  let treeManager: LevelTreeManager | null = null;
  let rockManager: LevelRockManager | null = null;
  let cloudPostProcess: CloudPostProcess | null = null;
  let cloudManager: LevelCloudManager | null = null;
  let finalPostProcess: FinalPostProcess | null = null;
  let skyPickSphere: SkyPickSphere | null = null;
  let shadowManager: any = null;
  let inputSequence = 0;
  let buildingCollisionManager: BuildingCollisionManager | null = null;
  let buildSystem: BuildSystem | null = null;
  let ladderPlacementSystem: LadderPlacementSystem | null = null;
  
  // Systems
  const weaponSystem = new WeaponSystem();
  const itemSystem = new ItemSystem();
  const gameLoop = new GameLoop();

  // Build system state
  const hasHammer = ref(false);
  const buildMode = ref<string>('select');
  const buildSelectedGridId = ref<number | null>(null);
  
  // Kill feed state
  const killFeedEntries = ref<KillFeedEntry[]>([]);
  let killFeedIdCounter = 0;
  const buildColorIndex = ref<number>(0);
  const buildDemolishProgress = ref<number>(0);
  const playerMaterials = ref(500);
  
  // Ladder system state
  const hasLadder = ref(false);
  const ladderMeshes = new Map<number, any>(); // entityId -> TransformNode
  const ladderTriggers = new Map<number, any>(); // entityId -> Mesh
  
  // Window resize handler
  const handleResize = () => engine?.resize();
  
  const init = async (canvas: HTMLCanvasElement, config: GameSessionConfig) => {
    // 1. Create Babylon engine + scene (WebGPU with WebGL fallback)
    engine = await createEngine(canvas);
    const sunConfig = config.levelSeed ? generateSunConfig(config.levelSeed) : undefined;
    const sceneResult = createGameScene(engine, sunConfig);
    scene = sceneResult.scene;
    shadowManager = sceneResult.shadowManager;
    cameraController = new CameraController(scene);
    
    // Create invisible sky pick sphere for catching sky shots
    skyPickSphere = new SkyPickSphere(scene);
    
    // Initialize audio system
    console.log('[GameSession] Initializing audio system...');
    try {
      const audioManager = AudioManager.Initialize();
      await audioManager.loadSounds(SOUND_MANIFEST);
      audioManager.setMasterVolume(0.8);
    } catch (error) {
      console.error('[GameSession] Failed to initialize audio:', error);
    }
    
    // 2. Generate level if seed is provided, otherwise create flat ground
    if (config.levelSeed && scene) {
      console.log(`[GameSession] Generating level with seed: ${config.levelSeed}`);
      voxelGrid = new VoxelGrid();
      voxelGrid.generateFromNoise(config.levelSeed);
      console.log(`[GameSession] Generated ${voxelGrid.getSolidCount()} solid voxels`);
      
      // Run greedy meshing
      const mesher = new GreedyMesher(voxelGrid);
      const quads = mesher.generateMesh();
      console.log(`[GameSession] Optimized to ${quads.length} quads`);
      
      // Create Babylon.js mesh
      levelMesh = new LevelMesh(scene);
      levelMesh.createFromQuads(quads);
      console.log('[GameSession] Level mesh created');
      
      // Initialize tree manager for this level
      try {
        treeManager = new LevelTreeManager(scene, config.levelSeed);
        await treeManager.initialize();
        console.log('[GameSession] Tree manager initialized');
      } catch (error) {
        console.error('[GameSession] Failed to initialize tree manager:', error);
      }
      
      // Initialize rock manager for this level
      try {
        rockManager = new LevelRockManager(scene, config.levelSeed);
        await rockManager.initialize();
        console.log('[GameSession] Rock manager initialized');
      } catch (error) {
        console.error('[GameSession] Failed to initialize rock manager:', error);
      }
      
      // Initialize cloud post-processing and cloud manager
      try {
        cloudPostProcess = new CloudPostProcess(scene, cameraController.getCamera());
        cloudManager = new LevelCloudManager(scene, config.levelSeed, cloudPostProcess);
        await cloudManager.initialize();
        console.log('[GameSession] Cloud manager initialized');
      } catch (error) {
        console.error('[GameSession] Failed to initialize cloud manager:', error);
      }
      
      // Initialize final post-processing (FXAA + vignette)
      finalPostProcess = new FinalPostProcess(scene, cameraController.getCamera());
    } else if (scene) {
      // Flat ground for shooting range / builder rooms
      console.log('[GameSession] Creating flat ground');
      const groundSize = 200;
      const ground = MeshBuilder.CreateGround('rangeGround', { width: groundSize, height: groundSize }, scene);
      ground.position.y = -0.5; // Move down to prevent clipping with player
      const terrainMaterial = new StandardMaterial('terrainMat', scene);
      terrainMaterial.diffuseColor = new Color3(0.3, 0.5, 0.3);
      terrainMaterial.specularColor = new Color3(0, 0, 0);
      ground.material = terrainMaterial;
      ground.receiveShadows = true;

      // Initialize tree and rock managers using roomId as seed (for builder rooms, etc.)
      try {
        const treeSeed = config.roomId + '_tree';
        treeManager = new LevelTreeManager(scene, treeSeed);
        await treeManager.initialize();
        console.log('[GameSession] Tree manager initialized for flat ground room with seed:', treeSeed);
      } catch (error) {
        console.error('[GameSession] Failed to initialize tree manager:', error);
      }

      try {
        const rockSeed = config.roomId + '_rock';
        rockManager = new LevelRockManager(scene, rockSeed);
        await rockManager.initialize();
        console.log('[GameSession] Rock manager initialized for flat ground room with seed:', rockSeed);
      } catch (error) {
        console.error('[GameSession] Failed to initialize rock manager:', error);
      }
    }
    
    window.addEventListener('resize', handleResize);
    
    // 3. Connect to server
    const wsUrl = `ws://${window.location.hostname}:3000/ws`;
    
    networkClient = new NetworkClient(wsUrl);
    const room = useRoom(networkClient);
    buildingCollisionManager = new BuildingCollisionManager();
    transformSync = useTransformSync(networkClient, scene, buildingCollisionManager, {
      getTreeColliders: () => treeManager?.getColliderMeshes() ?? [],
      getRockColliders: () => rockManager?.getColliderMeshes() ?? []
    });
    projectileManager = new ProjectileManager(scene);
    
    // Track latency
    networkClient.onHighFrequency(Opcode.TransformUpdate, (data: any) => {
      if (data.entityId === myEntityId.value && lastInputSendTime > 0) {
        const now = performance.now();
        const measuredLatency = now - lastInputSendTime;
        latencySamples.push(measuredLatency);
        if (latencySamples.length > MAX_LATENCY_SAMPLES) {
          latencySamples.shift();
        }
        const sum = latencySamples.reduce((acc, val) => acc + val, 0);
        latency.value = sum / latencySamples.length;
      }
    });
    
    // Handle server projectile events
    networkClient.onProjectileSpawn((data) => {
      projectileManager?.spawnFromServer(data);
    });
    
    networkClient.onProjectileSpawnBatch((dataArray) => {
      projectileManager?.spawnBatchFromServer(dataArray);
    });
    
    networkClient.onProjectileDestroy((data) => {
      const position = projectileManager?.destroy(data.entityId);
      if (position) {
        playSFX3D('bullet_impact', position.x, position.y, position.z, 0.6);
      }
    });
    
    // Handle health/damage events
    networkClient.onLowFrequency(Opcode.EntityDamage, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        playerHealth.value = payload.newHealth;
        if (myTransform.value) {
          const state = myTransform.value.getState();
          playSFX3D('player_hurt', state.posX, state.posY, state.posZ, 0.9);
        }
      }
    });
    
    // Handle stamina updates
    networkClient.onLowFrequency(Opcode.StaminaUpdate, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        playerStamina.value = payload.stamina;
        playerIsExhausted.value = payload.isExhausted;
      }
    });
    
    // Handle buff applied
    networkClient.onLowFrequency(Opcode.BuffApplied, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        console.log(`[Buff] Applied: ${payload.buffType} for ${payload.duration}s`);
        if (payload.buffType === 'infinite_stamina') {
          playerHasInfiniteStamina.value = true;
        }
      }
    });
    
    // Handle buff expired
    networkClient.onLowFrequency(Opcode.BuffExpired, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        console.log(`[Buff] Expired: ${payload.buffType}`);
        if (payload.buffType === 'infinite_stamina') {
          playerHasInfiniteStamina.value = false;
        }
      }
    });

    networkClient.onLowFrequency(Opcode.ArmorUpdate, (payload: any) => {
      const hasArmor = payload.armor > 0;
      const transform = transformSync.getTransform(payload.entityId);
      if (transform) {
        transform.setArmor(hasArmor);
      }
      
      if (payload.entityId === myEntityId.value) {
        playerArmor.value = payload.armor;
      }
    });

    networkClient.onLowFrequency(Opcode.HelmetUpdate, (payload: any) => {
      const transform = transformSync.getTransform(payload.entityId);
      if (transform) {
        transform.setHelmet(payload.hasHelmet);
      }
      
      if (payload.entityId === myEntityId.value) {
        playerHelmetHealth.value = payload.helmetHealth;
      }
    });

    networkClient.onLowFrequency(Opcode.MaterialsUpdate, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        playerMaterials.value = payload.materials;
      }
    });
    
    // Handle building network messages for collision
    // Building system network handlers
    networkClient.onLowFrequency(Opcode.BuildingInitialState, (payload: BuildingInitialStateMessage) => {
      buildingCollisionManager?.initialize(payload);
      buildSystem?.handleBuildingInitialState(payload);
      console.log(`[GameSession] Building ${payload.buildingEntityId} initialized`);
    });

    networkClient.onLowFrequency(Opcode.BuildingCreated, (payload: BuildingCreatedMessage) => {
      buildingCollisionManager?.initialize({
        ...payload,
        blocks: [] // New building starts empty
      });
      buildSystem?.handleBuildingCreated(payload);
      console.log(`[GameSession] Building ${payload.buildingEntityId} created`);
    });
    
    networkClient.onLowFrequency(Opcode.BlockPlaced, (payload: BlockPlacedMessage) => {
      buildingCollisionManager?.addBlock(payload);
      buildSystem?.handleBlockPlaced(payload);
    });
    
    networkClient.onLowFrequency(Opcode.BlockRemoved, (payload: BlockRemovedMessage) => {
      buildingCollisionManager?.removeBlock(payload);
      buildSystem?.handleBlockRemoved(payload);
    });

    networkClient.onLowFrequency(Opcode.BuildingTransformed, (payload: BuildingTransformedMessage) => {
      buildingCollisionManager?.updateTransform({
        buildingEntityId: payload.buildingEntityId,
        posX: payload.posX,
        posY: payload.posY,
        posZ: payload.posZ,
        rotY: payload.rotY
      });
      buildSystem?.handleBuildingTransformed(payload);
      console.log(`[GameSession] Building ${payload.buildingEntityId} transformed`);
    });

    networkClient.onLowFrequency(Opcode.BuildingDestroyed, (payload: BuildingDestroyedMessage) => {
      buildingCollisionManager?.removeBuilding(payload.buildingEntityId);
      buildSystem?.handleBuildingDestroyed(payload);
      console.log(`[GameSession] Building ${payload.buildingEntityId} destroyed`);
    });

    // Ladder system network handlers
    networkClient.onLowFrequency(Opcode.LadderSpawned, (payload: LadderSpawnedMessage) => {
      if (!scene) return;

      // Calculate rotation from normal
      const rotY = Math.atan2(-payload.normalX, -payload.normalZ);

      // Create visual ladder mesh
      const ladderMesh = createLadderSegmentMesh(`ladder_${payload.entityId}`, scene, payload.segmentCount);
      ladderMesh.position.set(payload.posX, payload.posY, payload.posZ);
      ladderMesh.rotation.y = rotY;
      ladderMeshes.set(payload.entityId, ladderMesh);

      // Create trigger collider (invisible box)
      const triggerHeight = payload.segmentCount * 0.5;
      const triggerBox = MeshBuilder.CreateBox(`ladderTrigger_${payload.entityId}`, {
        width: 1.2,
        height: triggerHeight,
        depth: 0.4
      }, scene);
      triggerBox.position.set(payload.posX, payload.posY + triggerHeight * 0.5, payload.posZ);
      triggerBox.rotation.y = rotY;
      triggerBox.isVisible = false;
      triggerBox.isPickable = false;
      ladderTriggers.set(payload.entityId, triggerBox);

      console.log(`[GameSession] Ladder ${payload.entityId} spawned with ${payload.segmentCount} segments`);
    });

    networkClient.onLowFrequency(Opcode.LadderDestroyed, (payload: LadderDestroyedMessage) => {
      if (!scene) return;

      // Remove ladder mesh
      const ladderMesh = ladderMeshes.get(payload.entityId);
      if (ladderMesh) {
        disposeLadderMesh(`ladder_${payload.entityId}`, scene);
        ladderMeshes.delete(payload.entityId);
      }

      // Remove trigger collider
      const triggerBox = ladderTriggers.get(payload.entityId);
      if (triggerBox) {
        triggerBox.dispose();
        ladderTriggers.delete(payload.entityId);
      }

      console.log(`[GameSession] Ladder ${payload.entityId} destroyed`);
    });
    
    networkClient.onLowFrequency(Opcode.EntityDeath, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        playerHealth.value = PLAYER_MAX_HEALTH;
        weaponSystem.clearWeapon();
      }
      
      // Add to kill feed
      const killerName = roundState.getPlayerName(payload.killerId);
      const victimName = roundState.getPlayerName(payload.entityId);
      roundState.addKill(payload.killerId, killerName, payload.entityId, victimName);
    });
    
    networkClient.onLowFrequency(Opcode.KillFeed, (payload: KillFeedMessage) => {
      const entry: KillFeedEntry = {
        id: killFeedIdCounter++,
        killerEntityId: payload.killerEntityId,
        killerColor: payload.killerColor,
        victimEntityId: payload.victimEntityId,
        victimColor: payload.victimColor,
        weaponType: payload.weaponType,
        timestamp: payload.timestamp
      };
      
      // Add to feed (max 5 entries)
      killFeedEntries.value.push(entry);
      if (killFeedEntries.value.length > 5) {
        killFeedEntries.value.shift();
      }
      
      // Auto-remove after 7 seconds
      setTimeout(() => {
        const index = killFeedEntries.value.findIndex(e => e.id === entry.id);
        if (index !== -1) {
          killFeedEntries.value.splice(index, 1);
        }
      }, 7000);
    });
    
    // Round system network listeners
    networkClient.onLowFrequency(Opcode.RoundState, (payload: any) => {
      roundState.handleRoundState(payload);
    });
    
    networkClient.onLowFrequency(Opcode.ScoreUpdate, (payload: any) => {
      roundState.handleScoreUpdate(payload);
    });
    
    // Sync room state to template refs
    watch(() => room.roomId.value, (val) => { roomId.value = val; });
    watch(() => room.myEntityId.value, (val) => { myEntityId.value = val; });
    watch(() => room.players.value, (val) => { players.value = new Map(val); }, { deep: true });
    watch(() => room.isInRoom.value, (val) => { isInRoom.value = val; });
    
    // Handle item spawns from server
    networkClient.onLowFrequency(Opcode.ItemSpawn, (payload) => {
      if (scene) {
        itemSystem.handleSpawn(payload, scene);
      }
    });

    // Handle explosion spawns from server (visual effects)
    networkClient.onLowFrequency(Opcode.ExplosionSpawn, (payload: { posX: number; posY: number; posZ: number; radius: number }) => {
      console.log('[GameSession] Explosion received:', payload);
      if (scene) {
        // Create explosion sphere visual
        const sphere = MeshBuilder.CreateSphere(`explosion_${Date.now()}`, {
          diameter: payload.radius * 2,
          segments: 16
        }, scene);
        
        sphere.position.set(payload.posX, payload.posY, payload.posZ);
        
        console.log('[GameSession] Created explosion sphere at', sphere.position, 'with diameter', payload.radius * 2);
        
        // Create glowing material
        const material = new StandardMaterial(`explosion_mat_${Date.now()}`, scene);
        material.diffuseColor = new Color3(1, 0.5, 0); // Orange
        material.emissiveColor = new Color3(1, 0.8, 0); // Bright yellow-orange glow
        material.alpha = 0.6;
        sphere.material = material;
        
        // Animate and remove after a short time
        const startTime = performance.now();
        const duration = 2000; // 2 seconds (increased for debugging)
        
        const observer = scene.onBeforeRenderObservable.add(() => {
          const elapsed = performance.now() - startTime;
          const t = elapsed / duration;
          
          if (t >= 1) {
            scene.onBeforeRenderObservable.remove(observer);
            sphere.dispose();
            console.log('[GameSession] Explosion sphere disposed');
            return;
          }
          
          // Fade out and scale up slightly
          material.alpha = 0.6 * (1 - t);
          const scale = 1 + t * 0.3;
          sphere.scaling.set(scale, scale, scale);
        });
      }
    });
    
    // Handle item position updates
    networkClient.onLowFrequency(Opcode.ItemUpdate, (payload) => {
      itemSystem.handleUpdate(payload);
    });
    
    // Handle item pickup events from server
    networkClient.onLowFrequency(Opcode.ItemPickup, (payload) => {
      console.log(`[GameSession] ItemPickup received: type=${payload.itemType}, playerId=${payload.playerId}, myEntityId=${myEntityId.value}`);
      if (scene) {
        itemSystem.handlePickup(payload, myEntityId.value, weaponSystem, scene, hasHammer, hasLadder);
      }
      console.log(`[GameSession] After pickup: hasLadder=${hasLadder.value}, hasHammer=${hasHammer.value}`);
    });
    
    // Handle tree spawns from server (level rooms only)
    networkClient.onLowFrequency(Opcode.TreeSpawn, (payload) => {
      if (!treeManager) return;
      const instances = payload.trees.map(t => ({
        variationId: t.variationId,
        worldX: t.posX,
        worldY: t.posY,
        worldZ: t.posZ,
        rotationY: t.rotationY
      }));
      treeManager.spawnTreeInstances(instances);
    });
    
    // Handle rock spawns from server (level rooms only)
    networkClient.onLowFrequency(Opcode.RockSpawn, (payload) => {
      if (!rockManager) return;
      const instances = payload.rocks.map(r => ({
        variationId: r.variationId,
        worldX: r.posX,
        worldY: r.posY,
        worldZ: r.posZ,
        rotationY: r.rotationY,
        scale: r.scale
      }));
      rockManager.spawnRockInstances(instances);
    });
    
    // Handle other players joining
    room.onPlayerJoined((playerInfo) => {
      if (!scene || !transformSync) return;
      const transform = transformSync.createTransform(playerInfo.entityId, false);
      const playerColor = hexToColor3(playerInfo.color);
      const cube = createPlayerInstance(`cube_${playerInfo.entityId}`, scene, playerColor);
      cube.parent = transform.getNode();
      cube.position.y = 0;
    });
    
    // Handle players leaving
    room.onPlayerLeft((entityId) => {
      if (!transformSync) return;
      transformSync.removeTransform(entityId);
    });
    
    // Try to connect
    try {
      await networkClient.connect();
      isConnected.value = true;
      room.joinRoom(config.roomId, config.levelConfig);
    } catch (err) {
      console.error('[GameSession] Failed to connect:', err);
    }
    
    // 4. When we get our entity ID, set up our local player
    watch(() => room.myEntityId.value, (entityId) => {
      if (entityId === null || entityId === undefined || !scene || !transformSync) return;
      
      // Create our local transform (isLocal = true for client prediction)
      myTransform.value = transformSync.createTransform(entityId, true, voxelGrid || undefined);
      
      // Find our player color from the players map
      const myPlayerInfo = Array.from(room.players.value.values()).find(p => p.entityId === entityId);
      const playerColor = myPlayerInfo ? hexToColor3(myPlayerInfo.color) : hexToColor3('#00ff88');
      const cube = createPlayerInstance(`cube_${entityId}`, scene, playerColor);
      cube.parent = myTransform.value.getNode();
      cube.position.y = 0;
      
      console.log(`[GameSession] Spawned local player cube for entity ${entityId}`);
      
      // Set up input manager
      inputManager = new InputManager(scene, config.isMobile || false);
      
      // Wire projectile manager
      if (projectileManager && transformSync) {
        projectileManager.setTransformSync(transformSync, entityId);
      }

      // Initialize build system (after cameraController is created)
      if (cameraController) {
        const camera = cameraController.getCamera();
        buildSystem = new BuildSystem(scene, camera, networkClient, () => myTransform.value);
        buildSystem.setMyEntityId(entityId);
        
        // Sync refs bidirectionally
        buildSystem.hasHammer = hasHammer;
        buildSystem.currentModeRef = buildMode;
        buildSystem.selectedGridIdRef = buildSelectedGridId;
        buildSystem.currentColorIndexRef = buildColorIndex;
        buildSystem.demolishProgressRef = buildDemolishProgress;

        // Tell InputManager to skip right-click when in build/select modes with hammer
        inputManager.setSkipRightClickCheck(() => {
          return hasHammer.value && (buildMode.value === 'select' || buildMode.value === 'build');
        });

        // Update build system every frame
        scene.onBeforeRenderObservable.add(() => {
          if (buildSystem) {
            buildSystem.update();
          }
        });
      }

      // Initialize ladder placement system
      if (cameraController) {
        const camera = cameraController.getCamera();
        ladderPlacementSystem = new LadderPlacementSystem(scene, camera, networkClient);
        
        // Update ladder placement system every frame
        scene.onBeforeRenderObservable.add(() => {
          if (ladderPlacementSystem) {
            ladderPlacementSystem.update();
          }
        });
      }

      // Build system keyboard handlers
      scene.onKeyboardObservable.add((kbInfo) => {
        if (!buildSystem) return;
        if (!hasHammer.value) return;

        const key = kbInfo.event.key.toLowerCase();
        
        if (kbInfo.type === 1) { // KEYDOWN
          if (key === '1') {
            console.log('[GameSession] Key 1 pressed - switching to select mode');
            buildSystem.setMode('select');
          } else if (key === '2') {
            console.log('[GameSession] Key 2 pressed - switching to build mode');
            buildSystem.setMode('build');
          } else if (key === '3') {
            console.log('[GameSession] Key 3 pressed - switching to transform mode');
            buildSystem.setMode('transform');
          } else if (key === '4') {
            console.log('[GameSession] Key 4 pressed - switching to demolish mode');
            buildSystem.setMode('demolish');
          } else if (key === '[') {
            buildSystem.prevColor();
          } else if (key === ']') {
            buildSystem.nextColor();
          }
        }
      });

      // Ladder placement system keyboard handlers
      scene.onKeyboardObservable.add((kbInfo) => {
        if (!ladderPlacementSystem) return;
        
        const key = kbInfo.event.key.toLowerCase();
        
        if (kbInfo.type === 1) { // KEYDOWN
          if (key === 'escape' && ladderPlacementSystem.isActive()) {
            console.log('[GameSession] ESC pressed - canceling ladder placement');
            ladderPlacementSystem.cancel();
          }
        }
      });

      // Build system mouse handlers
      scene.onPointerObservable.add((pointerInfo) => {
        if (!buildSystem) return;
        if (!hasHammer.value) return;

        if (pointerInfo.type === 1) { // POINTERDOWN
          const evt = pointerInfo.event as PointerEvent;
          console.log(`[GameSession] Mouse down - button ${evt.button}, mode: ${buildMode.value}`);
          buildSystem.handleMouseDown(evt.button);
        } else if (pointerInfo.type === 2) { // POINTERUP
          const evt = pointerInfo.event as PointerEvent;
          console.log(`[GameSession] Mouse up - button ${evt.button}, mode: ${buildMode.value}`);
          buildSystem.handleMouseUp(evt.button);
        }
      });

      // Ladder placement system mouse handlers
      scene.onPointerObservable.add((pointerInfo) => {
        if (!ladderPlacementSystem) return;
        if (!hasLadder.value) return;

        if (pointerInfo.type === 2) { // POINTERUP (right-click to place/finalize)
          const evt = pointerInfo.event as PointerEvent;
          if (evt.button === 2) { // Right mouse button
            console.log('[GameSession] Right-click - ladder placement');
            ladderPlacementSystem.handleRightClick();
          }
        }
      });
      
      // Input handler
      const sendInputToServer = (forward: number, right: number, jump: boolean, sprint: boolean = false) => {
        if (!myTransform.value || !networkClient || !cameraController) return;
        
        const camYaw = cameraController.getYaw();
        const camPitch = cameraController.getPitch();
        
        myTransform.value.setInput(forward, right, camYaw, jump);
        
        inputSequence++;
        myTransform.value.setCurrentSequence(inputSequence);
        
        const input: InputData = {
          sequence: inputSequence,
          deltaTime: FIXED_TIMESTEP,
          forward,
          right,
          cameraYaw: camYaw,
          cameraPitch: camPitch,
          jump,
          sprint,
          timestamp: performance.now()
        };
        
        lastInputSendTime = performance.now();
        networkClient.sendInput(input);
      };
      
      inputManager.onStateChange((forward, right, jump, sprint) => {
        sendInputToServer(forward, right, jump, sprint);
      });
      
      // Shoot handler
      inputManager.onShoot(() => {
        if (myTransform.value && cameraController && scene && projectileManager && networkClient) {
          weaponSystem.shoot(myTransform.value, cameraController, scene, projectileManager, networkClient);
        }
      });
      
      // Auto-fire is handled in GameLoop.ts by checking isMouseHeld() each frame
      
      // Drop item handler
      inputManager.onDrop(() => {
        if (!weaponSystem.hasWeapon.value || itemSystem.isTossing() || !myTransform.value || !scene || !networkClient) return;
        
        weaponSystem.clearWeapon();
        
        if (cameraController) {
          itemSystem.handleDrop(
            myTransform.value,
            cameraController.getYaw(),
            weaponSystem.getWeaponType(),
            scene,
            networkClient,
            voxelGrid || undefined
          );
        }
      });
      
      // Reload handler
      inputManager.onReload(() => {
        if (myTransform.value && networkClient) {
          weaponSystem.reload(myTransform.value, networkClient);
        }
      });
      
      // Zoom handler (right-click) - only zoom if not in build mode or select mode
      inputManager.onZoom((isZooming) => {
        if (!cameraController) return;
        
        // Don't zoom when hammer is equipped and in build/select mode
        if (hasHammer.value && buildSystem) {
          const mode = buildMode.value;
          if (mode === 'build' || mode === 'select') {
            return; // Right-click is for removing blocks or deselecting
          }
        }
        
        if (isZooming && weaponSystem.hasZoom()) {
          // Zoom in by the weapon's zoom factor
          cameraController.setZoom(weaponSystem.getZoomFactor());
        } else {
          // Zoom out to normal
          cameraController.resetZoom();
        }
      });
      
      // Point camera at player
      if (cameraController) {
        cameraController.setTarget(myTransform.value.getPosition());
      }
      
      // Start game loop
      if (engine && scene && transformSync && cameraController) {
        gameLoop.start(engine, scene, {
          transformSync,
          projectileManager,
          cameraController,
          myTransformRef: myTransform,
          weaponSystem,
          inputManager,
          networkClient,
          scene,
          skyPickSphere,
          onPositionUpdate: (x, y, z) => {
            playerX.value = x;
            playerY.value = y;
            playerZ.value = z;
          }
        });
      }
    }, { immediate: true });
  };
  
  const dispose = () => {
    window.removeEventListener('resize', handleResize);
    gameLoop.stop();
    inputManager?.dispose();
    projectileManager?.dispose();
    transformSync?.cleanup();
    if (scene) itemSystem.dispose(scene);
    treeManager?.dispose();
    rockManager?.dispose();
    cloudManager?.dispose();
    cloudPostProcess?.dispose();
    finalPostProcess?.dispose();
    skyPickSphere?.dispose();
    shadowManager?.dispose();
    buildingCollisionManager?.clear();
    buildSystem?.dispose();
    ladderPlacementSystem?.dispose();
    // Dispose ladder meshes and triggers
    ladderMeshes.forEach((mesh, id) => {
      if (scene) disposeLadderMesh(`ladder_${id}`, scene);
    });
    ladderMeshes.clear();
    ladderTriggers.forEach(trigger => trigger.dispose());
    ladderTriggers.clear();
    networkClient?.disconnect();
    scene?.dispose();
    engine?.dispose();
  };
  
  return {
    init,
    dispose,
    isConnected,
    isInRoom,
    roomId,
    myEntityId,
    players,
    playerHealth,
    playerArmor,
    playerHelmetHealth,
    playerStamina,
    playerIsExhausted,
    playerHasInfiniteStamina,
    playerX,
    playerY,
    playerZ,
    hasWeapon: weaponSystem.hasWeapon,
    weaponType: weaponSystem.weaponType,
    currentAmmo: weaponSystem.currentAmmo,
    maxCapacity: weaponSystem.maxCapacity,
    isReloading: weaponSystem.isReloading,
    reloadProgress: weaponSystem.reloadProgress,
    latency,
    pingColorClass,
    // Build system
    hasHammer,
    buildMode,
    buildSelectedGridId,
    buildColorIndex,
    buildDemolishProgress,
    playerMaterials,
    // Ladder system
    hasLadder,
    // Kill feed
    killFeedEntries,
    // Round system
    roundState,
    getScene: () => scene,
    getCamera: () => cameraController?.getCamera() || null,
    getPlayerTransform: () => myTransform.value,
    getNetworkClient: () => networkClient
  };
}
