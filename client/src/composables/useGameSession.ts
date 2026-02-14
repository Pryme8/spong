import { ref, computed, Ref, watch } from 'vue';
import type { Engine, Scene } from '@babylonjs/core';
import { MeshBuilder, StandardMaterial, Color3, Vector3, PostProcess, Effect, DirectionalLight, HemisphericLight } from '@babylonjs/core';
import {
  FIXED_TIMESTEP,
  Opcode,
  InputData,
  PLAYER_MAX_HEALTH,
  VoxelGrid,
  GreedyMesher,
  generateMultiTileTerrain,
  Octree,
  WATER,
  type OctreeEntry,
  type DummySpawnMessage,
  type TransformData,
  type WeaponType
} from '@spong/shared';
import { NetworkClient, getSimulatedLatencyMs, getWebSocketUrl } from '../network/NetworkClient';
import { useRoom } from './useRoom';
import { useTransformSync } from './useTransformSync';
import { useRoundState } from './useRoundState';
import { createEngine, createGameScene, createPlayerInstance, hexToColor3 } from '../engine/setup/setupScene';
import { generateSunConfig } from '@spong/shared';
import { InputManager } from '../engine/input/InputManager';
import { CameraController } from '../engine/camera/CameraController';
import { ProjectileManager } from '../engine/systems/ProjectileManager';
import { LevelMesh } from '../engine/setup/LevelMesh';
import { LevelTreeManager } from '../engine/managers/LevelTreeManager';
import { LevelRockManager } from '../engine/managers/LevelRockManager';
import { LevelBushManager } from '../engine/managers/LevelBushManager';
import { LevelWaterManager } from '../engine/managers/LevelWaterManager';
import { TimeManager } from '../engine/core/TimeManager';
import { CloudPostProcess } from '../engine/rendering/postprocess/CloudPostProcess';
import { LevelCloudManager } from '../engine/managers/LevelCloudManager';
import { FinalPostProcess } from '../engine/rendering/postprocess/FinalPostProcess';
import { SkyPickSphere } from '../engine/setup/SkyPickSphere';
import { AudioManager } from '../engine/audio/AudioManager';
import { SOUND_MANIFEST } from '../engine/audio/soundManifest';
import { playSFX, playSFX3D } from '../engine/audio/audioHelpers';
import { WeaponSystem } from '../engine/systems/WeaponSystem';
import { ItemSystem } from '../engine/systems/ItemSystem';
import { GameLoop } from '../engine/core/GameLoop';
import { BushLeafEffect } from '../engine/rendering/effects/BushLeafEffect';
import { BloodSplatterEffect } from '../engine/rendering/effects/BloodSplatterEffect';
import { DamagePopupSystem } from '../engine/rendering/effects/DamagePopupSystem';
import { BuildingCollisionManager } from '../engine/building/BuildingCollisionManager';
import { BuildSystem } from '../engine/building/BuildSystem';
import { LadderPlacementSystem } from '../engine/building/LadderPlacementSystem';
import { createLadderSegmentMesh, disposeLadderMesh } from '../engine/entities/props/LadderMesh';
import { FootstepManager } from '../engine/audio/FootstepManager';
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
  isHeadshot: boolean;
  timestamp: number;
}

export interface GameSessionConfig {
  roomId: string;
  levelSeed?: string;
  isMobile?: boolean;
  levelConfig?: any;
  isLoadingPhase?: boolean;
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
  const playerBreathRemaining = ref(10.0);
  const playerMaxBreath = ref(10.0);
  const playerIsUnderwater = ref(false);
  const playerIsInWater = ref(false);
  const playerX = ref(0);
  const playerY = ref(0);
  const playerZ = ref(0);
  
  // Blood splatter damage notification state
  const bloodSplatterTimer = ref(0); // 0 to 3.0
  const bloodSplatterAlpha = computed(() => bloodSplatterTimer.value / 3.0);
  
  // Hit marker feedback when we hit someone
  const hitMarkerTimer = ref(0); // 0 to 0.25 seconds
  const hitMarkerVisible = computed(() => hitMarkerTimer.value > 0);
  
  // Drowning hurt sound cooldown to prevent spam (server sends ~60/sec when drowning)
  let lastDrowningHurtSoundTime = 0;
  const lastRemoteDrowningHurtTime = new Map<number, number>();
  const DROWNING_HURT_SOUND_COOLDOWN = 2.5; // seconds
  
  // Low health heartbeat sound tracking
  let heartbeatSoundId: string | null = null;
  let isHeartbeatPlaying = false;
  
  // Round state (needs to be at top level to be returned)
  const roundState = useRoundState();
  
  // Latency tracking
  const latency = ref(0);
  const latencySamples: number[] = [];
  const simulatedLatencyMs = ref(0);
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
  let voxelGrid: VoxelGrid | import('@spong/shared').MultiTileVoxelGrid | null = null;
  let treeManager: LevelTreeManager | null = null;
  let rockManager: LevelRockManager | null = null;
  let bushManager: LevelBushManager | null = null;
  let waterManager: LevelWaterManager | null = null;
  let octree: any = null; // Octree for broad-phase collision culling
  let cloudPostProcess: CloudPostProcess | null = null;
  let cloudManager: LevelCloudManager | null = null;
  let finalPostProcess: FinalPostProcess | null = null;
  let skyPickSphere: SkyPickSphere | null = null;
  let shadowManager: any = null;
  let leafEffect: BushLeafEffect | null = null;
  let leafTriggerPost: PostProcess | null = null;
  let bloodSplatterEffect: BloodSplatterEffect | null = null;
  let bloodSplatterPost: PostProcess | null = null;
  let damagePopupSystem: DamagePopupSystem | null = null;
  let currentTreeIndex = -1;
  let currentBushIndex = -1;
  let wasInLeavesLastFrame = false;
  let leafEntryX = 0;
  let leafEntryY = 0;
  let leafEntryZ = 0;
  let bloodEntryX = 0;
  let bloodEntryY = 0;
  let bloodEntryZ = 0;
  let selectedTextureIndex1 = 0;
  let selectedTextureIndex2 = 1;
  let inputSequence = 0;
  let isInLoadingPhase = false;
  let pendingEntityId: number | null = null;
  let spawnPlayerFn: ((entityId: number) => void) | null = null;
  let pendingEquippedWeapon: { itemType: string; ammoCurrent?: number; ammoCapacity?: number } | null = null;
  const loadingSecondsRemaining = ref(0);
  const loadingReadyPlayers = ref<string[]>([]);
  const loadingTotalPlayers = ref(0);
  const gameBegun = ref(false);
  const gameBeginCallbacks: (() => void)[] = [];
  let buildingCollisionManager: BuildingCollisionManager | null = null;
  let buildSystem: BuildSystem | null = null;
  let ladderPlacementSystem: LadderPlacementSystem | null = null;
  
  // Systems
  const weaponSystem = new WeaponSystem();
  const itemSystem = new ItemSystem();
  let footstepManager: FootstepManager | null = null;

  // Track remote players' weapon types for spatial audio
  const remotePlayerWeapons = new Map<number, string>();

  /** Map weapon type to its fire sound name + volume. */
  function getWeaponFireSound(weaponType: string): { sound: string; volume: number } {
    switch (weaponType) {
      case 'shotgun': return { sound: 'shotgun_shoot', volume: 0.8 };
      case 'doublebarrel': return { sound: 'shotgun_shoot', volume: 0.8 };
      case 'lmg': return { sound: 'LMG_shoot', volume: 0.4 };
      default: return { sound: 'pistol_shot', volume: 0.8 };
    }
  }

  /** Map weapon type to its reload sound name. */
  function getWeaponReloadSound(weaponType: string): string {
    switch (weaponType) {
      case 'shotgun': return 'shotgun_reload';
      case 'doublebarrel': return 'shotgun_reload';
      case 'lmg': return 'LMG_reload';
      default: return 'pistol_reload';
    }
  }
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
    // Track if we're in loading phase
    isInLoadingPhase = config.isLoadingPhase || false;
    
    // 1. Create Babylon engine + scene (WebGPU with WebGL fallback)
    engine = await createEngine(canvas);
    const sunConfig = config.levelSeed ? generateSunConfig(config.levelSeed) : undefined;
    const sceneResult = createGameScene(engine, sunConfig);
    scene = sceneResult.scene;
    shadowManager = sceneResult.shadowManager;
    
    // Initialize global time manager (must be first)
    TimeManager.Initialize(scene);
    
    cameraController = new CameraController(scene);
    // Damage popup notifications disabled (Particle Master); splatter effect still active
    // damagePopupSystem = new DamagePopupSystem(scene);

    // Create invisible sky pick sphere for catching sky shots
    skyPickSphere = new SkyPickSphere(scene);
    
    // Initialize audio system
    try {
      const audioManager = AudioManager.Initialize();
      await audioManager.loadSounds(SOUND_MANIFEST);
      audioManager.setMasterVolume(0.8);
      footstepManager = new FootstepManager();
    } catch (error) {
    }
    
    // 2. Generate level if seed is provided, otherwise create flat ground
    if (config.levelSeed && scene) {
      const multiTile = generateMultiTileTerrain(config.levelSeed);
      voxelGrid = multiTile;
      const allQuads: import('@spong/shared').Quad[] = [];
      const tiles = multiTile.getTiles();
      const TILE_VOXELS = 100;
      for (let tx = 0; tx < 3; tx++) {
        for (let tz = 0; tz < 3; tz++) {
          const mesher = new GreedyMesher(tiles[tx][tz]);
          const quads = mesher.generateMesh();
          const offsetX = tx * TILE_VOXELS;
          const offsetZ = tz * TILE_VOXELS;
          for (const q of quads) {
            allQuads.push({ ...q, x: q.x + offsetX, z: q.z + offsetZ });
          }
        }
      }
      levelMesh = new LevelMesh(scene);
      levelMesh.createFromQuads(allQuads, { x: -300, y: -25, z: -300 });
      try {
        waterManager = new LevelWaterManager(scene);
        await waterManager.initialize(multiTile);
        // Update water ripples every frame (time comes from TimeManager)
        scene.onBeforeRenderObservable.add(() => {
          waterManager?.update();
        });
      } catch (error) {
      }
      
      // Get disable flags from level config
      const disableSpawns = (config.levelConfig?.disableSpawns || []) as string[];
      
      // Initialize tree manager for this level
      if (!disableSpawns.includes('trees')) {
        try {
          treeManager = new LevelTreeManager(scene, config.levelSeed);
          await treeManager.initialize();
        } catch (error) {
        }
      } else {
      }
      
      // Initialize rock manager for this level
      if (!disableSpawns.includes('rocks')) {
        try {
          rockManager = new LevelRockManager(scene, config.levelSeed);
          await rockManager.initialize();
        } catch (error) {
        }
      } else {
      }
      
      // Initialize bush manager for this level
      if (!disableSpawns.includes('bushes')) {
        try {
          bushManager = new LevelBushManager(scene, config.levelSeed);
          await bushManager.initialize();
        } catch (error) {
        }
      } else {
      }
      
      // Initialize cloud post-processing and cloud manager
      try {
        cloudPostProcess = new CloudPostProcess(scene, cameraController.getCamera());
        cloudManager = new LevelCloudManager(scene, config.levelSeed, cloudPostProcess);
        await cloudManager.initialize();
      } catch (error) {
      }
      
      // Blood splatter + camera-in-leaves check only (no leaf overlay effect; foliage uses backFaceCulling on materials)
      await setupGamePostProcesses(scene, cameraController.getCamera());
      
      // Initialize final post-processing (FXAA + vignette) LAST so it's applied after all other effects
      finalPostProcess = new FinalPostProcess(scene, cameraController.getCamera());
    } else if (scene) {
      // Flat terrain for shooting range / builder / editor rooms
      // Generate flat terrain at y=0 (50 voxels * 0.5 height = 25 units, offset by LEVEL_OFFSET_Y = -25)
      voxelGrid = new VoxelGrid();
      voxelGrid.generateFromNoise(config.roomId, 0.02, 3, 50);
      // Run greedy meshing
      const mesher = new GreedyMesher(voxelGrid);
      const quads = mesher.generateMesh();
      // Create Babylon.js mesh
      levelMesh = new LevelMesh(scene);
      levelMesh.createFromQuads(quads);
      // Initialize tree and rock managers using roomId as seed (for builder rooms, etc.)
      try {
        const treeSeed = config.roomId + '_tree';
        treeManager = new LevelTreeManager(scene, treeSeed);
        await treeManager.initialize();
      } catch (error) {
      }

      try {
        const rockSeed = config.roomId + '_rock';
        rockManager = new LevelRockManager(scene, rockSeed);
        await rockManager.initialize();
      } catch (error) {
      }
    }
    
    // If in loading phase, position camera to look at terrain from an angle
    // and start the render loop immediately so the scene is visible
    if (config.isLoadingPhase && engine && scene) {
      const camera = cameraController!.getCamera();
      
      // Position camera high and to the side for a panoramic terrain view
      camera.position.set(80, 100, 80);
      camera.setTarget(new Vector3(0, 20, 0));
      
      // Slow orbit during loading for visual interest
      let loadingAngle = 0;
      engine.runRenderLoop(() => {
        loadingAngle += 0.002;
        const radius = 100;
        camera.position.x = Math.cos(loadingAngle) * radius;
        camera.position.z = Math.sin(loadingAngle) * radius;
        camera.position.y = 80;
        camera.setTarget(new Vector3(0, 20, 0));
        scene.render();
      });
    }
    
    window.addEventListener('resize', handleResize);
    
    // 3. Connect to server (wss when page is HTTPS; same host in production so reverse proxy works)
    networkClient = new NetworkClient(getWebSocketUrl());
    simulatedLatencyMs.value = getSimulatedLatencyMs();
    const room = useRoom(networkClient);
    buildingCollisionManager = new BuildingCollisionManager();
    transformSync = useTransformSync(
      networkClient, 
      scene, 
      buildingCollisionManager, 
      {
        getTreeColliders: () => treeManager?.getColliderMeshes() ?? [],
        getRockColliders: () => rockManager?.getColliderMeshes() ?? []
      }, 
      () => octree
    );
    projectileManager = new ProjectileManager(scene);
    
    // Expose debug functions to browser console
    (window as any).toggleLeafDebug = (visible: boolean = true) => {
      if (treeManager) {
        treeManager.toggleLeafCollisionDebug(visible);
      }
    };
    (window as any).toggleWoodDebug = (visible: boolean = true) => {
      if (treeManager) {
        treeManager.toggleWoodCollisionDebug(visible);
      }
    };
    (window as any).toggleBushDebug = (visible: boolean = true) => {
      if (bushManager) {
        bushManager.toggleBushCollisionDebug(visible);
      }
    };
    (window as any).debugLeafBounds = (index: number = 0) => {
      if (!treeManager) return 'Tree manager not loaded';
      const colliders = treeManager.getLeafColliders();
      if (colliders.length === 0) return 'No leaf colliders found';
      if (index >= colliders.length) return `Index ${index} out of range (max ${colliders.length - 1})`;
      
      const c = colliders[index];
      
      // Calculate the world-space AABB of the local box after rotation
      const corners = [
        { x: c.localMinX, z: c.localMinZ },
        { x: c.localMaxX, z: c.localMinZ },
        { x: c.localMinX, z: c.localMaxZ },
        { x: c.localMaxX, z: c.localMaxZ }
      ];
      let worldMinX = Infinity, worldMaxX = -Infinity;
      let worldMinZ = Infinity, worldMaxZ = -Infinity;
      for (const corner of corners) {
        // Forward rotation: local → world
        const wx = c.cosRotY * corner.x - c.sinRotY * corner.z + c.posX;
        const wz = c.sinRotY * corner.x + c.cosRotY * corner.z + c.posZ;
        if (wx < worldMinX) worldMinX = wx;
        if (wx > worldMaxX) worldMaxX = wx;
        if (wz < worldMinZ) worldMinZ = wz;
        if (wz > worldMaxZ) worldMaxZ = wz;
      }
      
      return {
        position: { x: c.posX.toFixed(2), y: c.posY.toFixed(2), z: c.posZ.toFixed(2) },
        rotation: { y: c.rotY.toFixed(2), sin: c.sinRotY.toFixed(4), cos: c.cosRotY.toFixed(4) },
        localMin: { x: c.localMinX.toFixed(2), y: c.localMinY.toFixed(2), z: c.localMinZ.toFixed(2) },
        localMax: { x: c.localMaxX.toFixed(2), y: c.localMaxY.toFixed(2), z: c.localMaxZ.toFixed(2) },
        worldApproxMin: { x: worldMinX.toFixed(2), y: (c.posY + c.localMinY).toFixed(2), z: worldMinZ.toFixed(2) },
        worldApproxMax: { x: worldMaxX.toFixed(2), y: (c.posY + c.localMaxY).toFixed(2), z: worldMaxZ.toFixed(2) },
        totalLeafColliders: colliders.length
      };
    };
    (window as any).debugCameraPos = () => {
      if (!scene || !scene.activeCamera) return 'No camera';
      const cam = scene.activeCamera;
      return {
        x: cam.position.x.toFixed(2),
        y: cam.position.y.toFixed(2),
        z: cam.position.z.toFixed(2)
      };
    };
    (window as any).debugLeafCheck = () => {
      if (!scene || !scene.activeCamera || !treeManager) return 'Not ready';
      const cam = scene.activeCamera;
      const result = treeManager.checkCameraInLeaves(cam.position.x, cam.position.y, cam.position.z);
      return {
        cameraPos: { x: cam.position.x.toFixed(2), y: cam.position.y.toFixed(2), z: cam.position.z.toFixed(2) },
        inLeaves: result >= 0,
        treeIndex: result
      };
    };
    (window as any).showDebugCommands = () => {
      return `
🌲 Tree & Bush Debug Commands:
  toggleLeafDebug(true)   - Show leaf trigger volumes (green wireframe)
  toggleLeafDebug(false)  - Hide leaf triggers
  toggleWoodDebug(true)   - Show wood collision meshes (red wireframe)
  toggleWoodDebug(false)  - Hide wood collision
  toggleBushDebug(true)   - Show bush trigger volumes (cyan wireframe)
  toggleBushDebug(false)  - Hide bush triggers
  debugLeafBounds()       - Show first leaf trigger bounds info
  debugCameraPos()        - Show current camera position
  debugLeafCheck()        - Check if camera is in leaves right now
  showDebugCommands()     - Show this help message
      `.trim();
    };
    // Track latency and update remote player footsteps
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

    networkClient.onLowFrequency(Opcode.FootstepSound, (payload: any) => {
      const shouldPlay = !payload.excludeSender || payload.entityId !== myEntityId.value;
      if (shouldPlay && payload.entityId !== myEntityId.value) {
        const soundName = FootstepManager.getVariantName(payload.variant);
        playSFX3D(soundName, payload.posX, payload.posY, payload.posZ, payload.volume);
      }
    });

    footstepManager?.setOnStep((variant, posX, posY, posZ, volume) => {
      if (networkClient) networkClient.sendLow(Opcode.FootstepEvent, { variant, posX, posY, posZ, volume });
    });

    // Handle server projectile events
    networkClient.onProjectileSpawn((data) => {
      projectileManager?.spawnFromServer(data);
      // Play remote gunshot sound (skip if it's our own shot - we already play locally)
      if (data.ownerId !== myEntityId.value) {
        const weaponType = remotePlayerWeapons.get(data.ownerId) || 'pistol';
        const { sound, volume } = getWeaponFireSound(weaponType);
        playSFX3D(sound, data.posX, data.posY, data.posZ, volume);
      }
    });
    
    networkClient.onProjectileSpawnBatch((dataArray) => {
      projectileManager?.spawnBatchFromServer(dataArray);
      // Batch = shotgun. Play one shotgun sound at the first pellet's position.
      if (dataArray.length > 0 && dataArray[0].ownerId !== myEntityId.value) {
        const d = dataArray[0];
        playSFX3D('shotgun_shoot', d.posX, d.posY, d.posZ, 0.8);
      }
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
        const previousHealth = playerHealth.value;
        playerHealth.value = payload.newHealth;
        
        const tookHealthDamage = payload.newHealth < previousHealth;
        const isDrowning = payload.attackerId === 0;
        
        // Trigger blood splatter only when actual health drops (not armor-only hits)
        if (tookHealthDamage && !isDrowning && bloodSplatterEffect) {
          // Blur existing splatters before adding new ones
          // This creates a layering effect where old blood is blurred and new blood is sharp
          if (bloodSplatterTimer.value > 0) {
            bloodSplatterEffect.blurExistingSplatters();
          }
          
          bloodSplatterTimer.value = 3.0; // Reset timer to 3 seconds
          const splatCount = Math.floor(Math.random() * 3) + 1; // 1-3 splats
          bloodSplatterEffect.addSplatters(splatCount);
          
          // Store camera position for parallax offset calculation
          if (scene && scene.activeCamera) {
            const camPos = scene.activeCamera.position;
            bloodEntryX = camPos.x;
            bloodEntryY = camPos.y;
            bloodEntryZ = camPos.z;
          }
        }

        // Directional damage indicator: red arc at screen edge pointing toward attacker
        if (tookHealthDamage && !isDrowning && payload.attackerId > 0 && finalPostProcess && cameraController && transformSync) {
          const attackerTransform = transformSync.getTransform(payload.attackerId);
          if (attackerTransform) {
            const camera = cameraController.getCamera();
            const myPos = camera.position;
            const attackerPos = attackerTransform.getPosition();
            const toAttacker = attackerPos.subtract(myPos).normalize();
            const forward = camera.getDirection(Vector3.Forward());
            const right = Vector3.Cross(forward, Vector3.Up()).normalize();
            const up = Vector3.Cross(right, forward).normalize();
            const viewX = Vector3.Dot(toAttacker, right);
            const viewY = Vector3.Dot(toAttacker, up);
            const directionAngle = Math.atan2(viewX, viewY) + Math.PI;
            finalPostProcess.addDamageIndicator(directionAngle);
          }
        }
        
        // Play hurt sound with cooldown for drowning
        if (myTransform.value && tookHealthDamage) {
          const currentTime = performance.now() / 1000;
          const shouldPlaySound = !isDrowning || (currentTime - lastDrowningHurtSoundTime >= DROWNING_HURT_SOUND_COOLDOWN);
          
          if (shouldPlaySound) {
            const state = myTransform.value.getState();
            playSFX3D('player_hurt', state.posX, state.posY, state.posZ, 0.9);
            
            if (isDrowning) {
              lastDrowningHurtSoundTime = currentTime;
            }
          }
        }
      } else if (transformSync && payload.damage > 0) {
        // Remote player took damage - play hurt sound at their position
        const isDrowning = payload.attackerId === 0;
        const currentTime = performance.now() * 0.001;
        const lastRemote = lastRemoteDrowningHurtTime.get(payload.entityId) ?? 0;
        const cooldownOk = !isDrowning || (currentTime - lastRemote >= DROWNING_HURT_SOUND_COOLDOWN);
        if (cooldownOk) {
          const remoteTransform = transformSync.getTransform(payload.entityId);
          if (remoteTransform) {
            const state = remoteTransform.getState();
            playSFX3D('player_hurt', state.posX, state.posY, state.posZ, 0.7);
            if (isDrowning) lastRemoteDrowningHurtTime.set(payload.entityId, currentTime);
          }
        }
      }
      
      // Hit marker feedback: if we hit another player, show the hit marker and play sound
      if (payload.attackerId === myEntityId.value && payload.entityId !== myEntityId.value) {
        hitMarkerTimer.value = 0.25; // Show for 0.25 seconds
        playSFX('bullet_impact', 0.5); // Play 2D sound locally

        const targetTransform = transformSync?.getTransform(payload.entityId);
        if (targetTransform && damagePopupSystem && payload.damage > 0) {
          damagePopupSystem.spawn(payload.damage, targetTransform.getPosition());
        }
      }
    });

    // Handle remote reload sounds
    networkClient.onLowFrequency(Opcode.ReloadStarted, (payload: any) => {
      // Check if we should play: either no excludeSender flag, or we're not the sender
      const shouldPlay = !payload.excludeSender || payload.entityId !== myEntityId.value;
      
      if (shouldPlay && payload.entityId !== myEntityId.value && transformSync) {
        const remoteTransform = transformSync.getTransform(payload.entityId);
        if (remoteTransform) {
          const state = remoteTransform.getState();
          const reloadSound = getWeaponReloadSound(payload.weaponType);
          playSFX3D(reloadSound, state.posX, state.posY, state.posZ, 0.6);
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
        if (payload.buffType === 'infinite_stamina') {
          playerHasInfiniteStamina.value = true;
        }
      }
    });
    
    // Handle buff expired
    networkClient.onLowFrequency(Opcode.BuffExpired, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
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

    networkClient.onLowFrequency(Opcode.EquippedWeaponSync, (payload: { entityId: number; itemType: string; ammoCurrent?: number; ammoCapacity?: number }) => {
      if (scene && transformSync) {
        const transform = transformSync.getTransform(payload.entityId);
        if (transform) {
          transform.equipWeapon(payload.itemType as WeaponType);
        }
        if (payload.entityId === myEntityId.value) {
          weaponSystem.equipWeaponWithAmmo(
            payload.itemType as WeaponType,
            payload.ammoCurrent,
            payload.ammoCapacity
          );
          if (myTransform.value) {
            myTransform.value.equipWeapon(payload.itemType as WeaponType);
          } else {
            pendingEquippedWeapon = { itemType: payload.itemType, ammoCurrent: payload.ammoCurrent, ammoCapacity: payload.ammoCapacity };
          }
        } else {
          remotePlayerWeapons.set(payload.entityId, payload.itemType);
        }
      }
    });

    // Handle building network messages for collision
    // Building system network handlers
    networkClient.onLowFrequency(Opcode.BuildingInitialState, (payload: BuildingInitialStateMessage) => {
      buildingCollisionManager?.initialize(payload);
      buildSystem?.handleBuildingInitialState(payload);
    });

    networkClient.onLowFrequency(Opcode.BuildingCreated, (payload: BuildingCreatedMessage) => {
      buildingCollisionManager?.initialize({
        ...payload,
        blocks: [] // New building starts empty
      });
      buildSystem?.handleBuildingCreated(payload);
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
    });

    networkClient.onLowFrequency(Opcode.BuildingDestroyed, (payload: BuildingDestroyedMessage) => {
      buildingCollisionManager?.removeBuilding(payload.buildingEntityId);
      buildSystem?.handleBuildingDestroyed(payload);
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
    });
    
    networkClient.onLowFrequency(Opcode.EntityDeath, (payload: any) => {
      if (payload.entityId === myEntityId.value) {
        playerHealth.value = PLAYER_MAX_HEALTH;
        weaponSystem.clearWeapon();
      }
      // Clear weapon tracking on death (player drops weapon)
      remotePlayerWeapons.delete(payload.entityId);
      
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
        isHeadshot: payload.isHeadshot,
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
    watch(() => room.myEntityId.value, (val) => {
      // Clean up old entity's footsteps before switching
      if (myEntityId.value !== null && myEntityId.value !== val && footstepManager) {
        footstepManager.removePlayer(myEntityId.value);
      }
      myEntityId.value = val;
    });
    watch(() => room.players.value, (val) => { players.value = new Map(val); }, { deep: true });
    watch(() => room.isInRoom.value, (val) => { isInRoom.value = val; });
    
    // Handle item spawns from server
    networkClient.onLowFrequency(Opcode.ItemSpawn, (payload) => {
      if (scene) {
        itemSystem.handleSpawn(payload, scene);
      }
    });

    // Handle dummy target spawns
    networkClient.onLowFrequency(Opcode.DummySpawn, (payload: DummySpawnMessage) => {
      if (!scene || !transformSync) return;
      if (transformSync.getTransform(payload.entityId)) return;

      const transform = transformSync.createTransform(payload.entityId, false);
      waterManager?.addNodeToMirrorRenderList(transform.getNode());
      const initialState: TransformData = {
        entityId: payload.entityId,
        position: { x: payload.posX, y: payload.posY, z: payload.posZ },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        headPitch: 0
      };
      transform.applyServerState(initialState);
    });

    // Handle explosion spawns from server (visual effects)
    networkClient.onLowFrequency(Opcode.ExplosionSpawn, (payload: { posX: number; posY: number; posZ: number; radius: number }) => {
      if (scene) {
        // Create explosion sphere visual
        const sphere = MeshBuilder.CreateSphere(`explosion_${Date.now()}`, {
          diameter: payload.radius * 2,
          segments: 16
        }, scene);
        
        sphere.position.set(payload.posX, payload.posY, payload.posZ);
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
            material.dispose();
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
      if (scene && transformSync) {
        // Get player's transform to equip visual weapon
        const playerTransform = transformSync.getTransform(payload.playerId);
        itemSystem.handlePickup(payload, myEntityId.value, weaponSystem, scene, hasHammer, hasLadder, playerTransform);
      }
      
      // Play pickup sound
      if (payload.playerId === myEntityId.value) {
        // Local player: play globally (non-spatial)
        playSFX('item_pickup', 0.8);
      } else if (transformSync) {
        // Remote player: play spatially at their position
        const remoteTransform = transformSync.getTransform(payload.playerId);
        if (remoteTransform) {
          const state = remoteTransform.getState();
          playSFX3D('item_pickup', state.posX, state.posY, state.posZ, 0.8);
        }
      }
      
      // Track weapon type for remote audio
      const weaponTypes = ['pistol', 'smg', 'lmg', 'shotgun', 'sniper', 'assault', 'rocket'];
      if (weaponTypes.includes(payload.itemType)) {
        remotePlayerWeapons.set(payload.playerId, payload.itemType);
      }
    });
    
    // Handle item drop sound events from server (for remote players)
    networkClient.onLowFrequency(Opcode.ItemDropSound, (payload: any) => {
      // Check if we should play: either no excludeSender flag, or we're not the sender
      const shouldPlay = !payload.excludeSender || payload.entityId !== myEntityId.value;
      if (shouldPlay && payload.entityId !== myEntityId.value) {
        playSFX3D('item_pickup', payload.posX, payload.posY, payload.posZ, 0.8);
      }
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
      const added = treeManager.spawnTreeInstances(instances);
      added.forEach(m => waterManager?.addMeshToMirrorRenderList(m));
      buildOctreeFromManagers();
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
      const added = rockManager.spawnRockInstances(instances);
      added.forEach(m => waterManager?.addMeshToMirrorRenderList(m));
      buildOctreeFromManagers();
    });
    
    // Handle bush spawns from server (level rooms only)
    networkClient.onLowFrequency(Opcode.BushSpawn, (payload) => {
      if (!bushManager) return;
      const instances = payload.bushes.map((b: any) => ({
        variationId: b.variationId,
        worldX: b.posX,
        worldY: b.posY,
        worldZ: b.posZ
      }));
      const added = bushManager.spawnBushInstances(instances);
      added.forEach(m => waterManager?.addMeshToMirrorRenderList(m));
      buildOctreeFromManagers();
    });
    
    // Helper: Build octree from manager collision data
    function buildOctreeFromManagers() {
      const treeColliders = treeManager?.getColliderMeshes() ?? [];
      const rockColliders = rockManager?.getColliderMeshes() ?? [];
      
      if (treeColliders.length === 0 && rockColliders.length === 0) {
        return; // Nothing to build yet
      }
      // Create octree covering play area
      octree = new Octree(0, 10, 0, 110, 6, 8);
      
      let nextId = 0;
      
      // Insert trees
      for (const treeData of treeColliders) {
        const entry: OctreeEntry = {
          id: nextId++,
          type: 'tree',
          data: treeData,
          minX: treeData.transform.posX - 5,
          minY: treeData.transform.posY - 1,
          minZ: treeData.transform.posZ - 5,
          maxX: treeData.transform.posX + 5,
          maxY: treeData.transform.posY + 20,
          maxZ: treeData.transform.posZ + 5
        };
        octree.insert(entry);
      }
      
      // Insert rocks
      for (const rockData of rockColliders) {
        const radius = 3 * rockData.transform.scale;
        const entry: OctreeEntry = {
          id: nextId++,
          type: 'rock',
          data: rockData,
          minX: rockData.transform.posX - radius,
          minY: rockData.transform.posY - radius,
          minZ: rockData.transform.posZ - radius,
          maxX: rockData.transform.posX + radius,
          maxY: rockData.transform.posY + radius,
          maxZ: rockData.transform.posZ + radius
        };
        octree.insert(entry);
      }
    }
    
    // Handle other players joining
    room.onPlayerJoined((playerInfo) => {
      if (!scene || !transformSync) return;
      const transform = transformSync.createTransform(playerInfo.entityId, false);
      const playerColor = hexToColor3(playerInfo.color);
      transform.setPlayerColor(playerColor);
      const cube = createPlayerInstance(`cube_${playerInfo.entityId}`, scene, playerColor);
      cube.parent = transform.getNode();
      cube.position.y = 0;
      transform.registerPlayerCube(cube);
      waterManager?.addNodeToMirrorRenderList(transform.getNode());
    });
    
    // Handle players leaving
    room.onPlayerLeft((entityId) => {
      if (!transformSync) return;
      transformSync.removeTransform(entityId);
      remotePlayerWeapons.delete(entityId);
      footstepManager?.removePlayer(entityId);
    });
    
    // Register loading phase handlers BEFORE connecting so we never miss messages
    if (config.isLoadingPhase) {
      networkClient.onLowFrequency(Opcode.PlayersReadyUpdate, (data: any) => {
        loadingSecondsRemaining.value = data.secondsRemaining;
        loadingReadyPlayers.value = data.readyPlayers;
        loadingTotalPlayers.value = data.totalPlayers;
      });
      
      networkClient.onLowFrequency(Opcode.GameBegin, () => {
        isInLoadingPhase = false;
        gameBegun.value = true;
        
        // Spawn the player if we have a pending entity ID
        if (pendingEntityId !== null && spawnPlayerFn) {
          spawnPlayerFn(pendingEntityId);
          pendingEntityId = null;
        }
        
        // Fire all registered callbacks
        for (const cb of gameBeginCallbacks) {
          cb();
        }
      });
    }
    
    // Try to connect
    try {
      await networkClient.connect();
      isConnected.value = true;
      room.joinRoom(config.roomId, config.levelConfig);

      // Auto-send ClientReady during loading phase once connected
      if (config.isLoadingPhase) {
        // Small delay to ensure room join is processed first
        setTimeout(() => {
          networkClient!.sendLow(Opcode.ClientReady, {});
        }, 500);
      }
    } catch (err) {
    }
    
    // Helper function to spawn player
    const spawnPlayer = (entityId: number) => {
      if (!scene || !transformSync) return;
      myEntityId.value = entityId;
      
      // Camera will be repositioned by CameraController.setTarget below
      // when we set it to the player's position
      
      // Create our local transform (isLocal = true for client prediction)
      myTransform.value = transformSync.createTransform(entityId, true, voxelGrid || undefined);
      
      // Find our player color from the players map
      const myPlayerInfo = Array.from(room.players.value.values()).find(p => p.entityId === entityId);
      const playerColor = myPlayerInfo ? hexToColor3(myPlayerInfo.color) : hexToColor3('#00ff88');
      myTransform.value.setPlayerColor(playerColor);
      const cube = createPlayerInstance(`cube_${entityId}`, scene, playerColor);
      cube.parent = myTransform.value.getNode();
      cube.position.y = 0;
      myTransform.value.registerPlayerCube(cube);
      waterManager?.addNodeToMirrorRenderList(myTransform.value.getNode());
      if (shadowManager) {
        shadowManager.addShadowCaster(cube, true);
      }
      myTransform.value.setArmor(playerArmor.value > 0);
      myTransform.value.setHelmet(playerHelmetHealth.value > 0);
      if (pendingEquippedWeapon) {
        weaponSystem.equipWeaponWithAmmo(
          pendingEquippedWeapon.itemType as WeaponType,
          pendingEquippedWeapon.ammoCurrent,
          pendingEquippedWeapon.ammoCapacity
        );
        myTransform.value.equipWeapon(pendingEquippedWeapon.itemType as WeaponType);
        pendingEquippedWeapon = null;
      }
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
            buildSystem.setMode('select');
          } else if (key === '2') {
            buildSystem.setMode('build');
          } else if (key === '3') {
            buildSystem.setMode('transform');
          } else if (key === '4') {
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
          buildSystem.handleMouseDown(evt.button);
        } else if (pointerInfo.type === 2) { // POINTERUP
          const evt = pointerInfo.event as PointerEvent;
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
            ladderPlacementSystem.handleRightClick();
          }
        }
      });
      
      // Input is now sent once per physics tick via the onFixedTick callback
      // in GameLoop, ensuring 1:1 correspondence between sequence numbers,
      // input buffer entries, and physics steps. This eliminates the desync
      // caused by event-driven sends advancing the sequence counter faster
      // than the physics tick rate.
      
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
        myTransform.value.clearWeapon(); // Clear visual weapon
        
        if (cameraController) {
          const dropSuccess = itemSystem.handleDrop(
            myTransform.value,
            cameraController.getYaw(),
            weaponSystem.getWeaponType(),
            scene,
            networkClient,
            voxelGrid || undefined
          );
          
          // Play drop sound globally for local player
          if (dropSuccess) {
            playSFX('item_pickup', 0.8);
          }
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

      // Debug camera toggle handler (Y key)
      inputManager.onDebugCameraToggle(() => {
        cameraController.toggleDebugThirdPerson(myTransform.value);
      });
      
      // Point camera at player
      if (cameraController) {
        cameraController.setTarget(myTransform.value.getPosition());
      }
      
      // Stop preview render loop (if running from loading phase) and start full game loop
      const nc = networkClient;
      if (engine && scene && transformSync && cameraController && nc) {
        engine.stopRenderLoop(); // Stop any existing render loop (e.g., loading preview)
        nc.setGameLoopDrainBudget(4);
        gameLoop.start(engine, scene, {
          transformSync,
          projectileManager,
          cameraController,
          myTransformRef: myTransform,
          weaponSystem,
          inputManager,
          networkClient: nc,
          scene,
          skyPickSphere,
          drainNetworkQueue: () => nc.drainHighFreqQueue(64),
          onPositionUpdate: (x, y, z) => {
            playerX.value = x;
            playerY.value = y;
            playerZ.value = z;
            
            // Update water and breath state from transform
            if (myTransform.value) {
              const state = myTransform.value.getState();
              playerBreathRemaining.value = state.breathRemaining;
              playerIsUnderwater.value = state.isHeadUnderwater;
              playerIsInWater.value = state.isInWater;
            }
          },
          // Per-frame updates (timers, UI, etc.)
          onVariableTick: (deltaTime) => {
            if (footstepManager && myEntityId.value !== null && myTransform.value) {
              const state = myTransform.value.getState();
              footstepManager.updateLocal(
                myEntityId.value,
                state.posX, state.posY, state.posZ,
                state.velX, state.velY, state.velZ,
                state.isGrounded,
                state.isInWater,
                deltaTime
              );
            }
            damagePopupSystem?.update(deltaTime);
            // Update blood splatter timer
            if (bloodSplatterTimer.value > 0) {
              bloodSplatterTimer.value = Math.max(0, bloodSplatterTimer.value - deltaTime);
              
              // Clear textures when timer hits 0
              if (bloodSplatterTimer.value === 0 && bloodSplatterEffect) {
                bloodSplatterEffect.clearTextures();
              }
            }
            
            // Update hit marker timer
            if (hitMarkerTimer.value > 0) {
              hitMarkerTimer.value = Math.max(0, hitMarkerTimer.value - deltaTime);
            }
            
            // Update low health effects
            const healthPercent = playerHealth.value / PLAYER_MAX_HEALTH;
            
            // Update post-process with health and underwater blue tint
            if (finalPostProcess) {
              finalPostProcess.setHealthPercentage(healthPercent);
              // Use global Y (same as physics) - camera/head below water surface = blue tint
              const underwater = cameraController
                ? cameraController.getPosition().y < WATER.LEVEL_Y
                : playerIsUnderwater.value;
              finalPostProcess.setUnderwaterIntensity(underwater ? 1 : 0);
            }
            
            // Manage heartbeat sound based on health
            if (healthPercent < 0.5 && healthPercent > 0) {
              // Calculate intensities
              const lowHealthIntensity = 1.0 - (healthPercent * 2.0); // 0 at 50%, 1 at 0%
              const volume = 0.1 + (lowHealthIntensity * 0.9); // 10% to 100%
              const playbackRate = 1.0 + lowHealthIntensity; // 1x to 2x speed
              
              if (!isHeartbeatPlaying) {
                // Start heartbeat
                const audioManager = AudioManager.getInstance();
                audioManager.play('heartbeat', { loop: true, volume, playbackRate });
                isHeartbeatPlaying = true;
              } else {
                // Update existing heartbeat volume and speed
                const audioManager = AudioManager.getInstance();
                audioManager.updateSoundProperties('heartbeat', { volume, playbackRate });
              }
            } else if (isHeartbeatPlaying) {
              // Stop heartbeat when health is above 50% or at 0
              const audioManager = AudioManager.getInstance();
              audioManager.stop('heartbeat');
              isHeartbeatPlaying = false;
            }
          },
          // Send input exactly once per physics tick — keeps sequence numbers
          // in lock-step with both client and server physics steps
          onFixedTick: () => {
            if (!myTransform.value || !networkClient || !cameraController || !inputManager) return;

            // Read current input state (jump is buffered so short presses aren't missed)
            const state = inputManager.getCurrentState();
            const camYaw = cameraController.getYaw();
            const camPitch = cameraController.getPitch();

            // Set input on the local transform for this physics tick
            myTransform.value.setInput(state.forward, state.right, camYaw, state.jump, state.sprint, camPitch, state.dive);

            // Increment sequence — exactly once per physics tick
            inputSequence++;
            myTransform.value.setCurrentSequence(inputSequence);

            // Consume jump buffer so it only fires for one tick
            inputManager.consumeJump();

            // Send the same input to the server
            const input: InputData = {
              sequence: inputSequence,
              deltaTime: FIXED_TIMESTEP,
              forward: state.forward,
              right: state.right,
              cameraYaw: camYaw,
              cameraPitch: camPitch,
              jump: state.jump,
              sprint: state.sprint,
              dive: state.dive,
              timestamp: performance.now()
            };

            lastInputSendTime = performance.now();
            networkClient.sendInput(input);
          }
        });
      }
    }; // End of spawnPlayer function
    
    // Store reference to spawnPlayer so onGameBegin can call it
    spawnPlayerFn = spawnPlayer;
    
    // 4. When we get our entity ID, set up our local player
    watch(() => room.myEntityId.value, (entityId) => {
      if (entityId === null || entityId === undefined) return;
      
      // If in loading phase, save the entity ID but don't spawn yet
      if (isInLoadingPhase) {
        pendingEntityId = entityId;
        myEntityId.value = entityId;
        return;
      }
      
      // Spawn player immediately if not in loading phase
      spawnPlayer(entityId);
    }, { immediate: true });
  };
  
  const dispose = () => {
    window.removeEventListener('resize', handleResize);
    gameLoop.stop();
    inputManager?.dispose();
    cameraController?.dispose();
    weaponSystem.dispose();
    projectileManager?.dispose();
    transformSync?.cleanup();
    if (scene) itemSystem.dispose(scene);
    treeManager?.dispose();
    rockManager?.dispose();
    bushManager?.dispose();
    waterManager?.dispose();
    cloudManager?.dispose();
    footstepManager?.dispose();
    TimeManager.Dispose();
    cloudPostProcess?.dispose();
    finalPostProcess?.dispose();
    leafTriggerPost?.dispose();
    leafEffect = null;
    bloodSplatterPost?.dispose();
    bloodSplatterEffect?.dispose();
    bloodSplatterEffect = null;
    damagePopupSystem?.dispose();
    damagePopupSystem = null;
    skyPickSphere?.dispose();
    shadowManager?.dispose();
    buildingCollisionManager?.dispose();
    buildSystem?.dispose();
    ladderPlacementSystem?.dispose();
    // Stop heartbeat sound if playing
    if (isHeartbeatPlaying) {
      const audioManager = AudioManager.getInstance();
      audioManager.stop('heartbeat');
      isHeartbeatPlaying = false;
    }
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
  
  /** Game level: blood splatter + checkCameraInLeaves only (no leaf overlay; bush/leaf materials use backFaceCulling). */
  async function setupGamePostProcesses(scene: Scene, camera: any) {
    if (!scene || !camera) return;
    try {
      bloodSplatterEffect = new BloodSplatterEffect(scene);
      setupBloodSplatterPostProcess(scene, camera);
      scene.onBeforeRenderObservable.add(checkCameraInLeaves);
    } catch (error) {
    }
  }

  // Leaf effect functions (used by other views that want the full leaf overlay)
  async function initializeLeafEffect(scene: Scene, camera: any) {
    if (!scene || !camera) return;
    leafEffect = new BushLeafEffect(scene);
    
    try {
      await leafEffect.generate();
      selectedTextureIndex1 = Math.floor(Math.random() * 3);
      selectedTextureIndex2 = Math.floor(Math.random() * 3);
      while (selectedTextureIndex2 === selectedTextureIndex1) {
        selectedTextureIndex2 = Math.floor(Math.random() * 3);
      }
      setupLeafTriggerDetection(scene, camera);
      
      bloodSplatterEffect = new BloodSplatterEffect(scene);
      setupBloodSplatterPostProcess(scene, camera);
    } catch (error) {
    }
  }

  function setupLeafTriggerDetection(scene: Scene, camera: any) {
    if (!scene) return;

    Effect.ShadersStore['leafTriggerFragmentShader'] = `
      precision highp float;
      
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D leafColorTexture1;
      uniform sampler2D leafMaskTexture1;
      uniform sampler2D leafColorTexture2;
      uniform sampler2D leafMaskTexture2;
      uniform float intensity;
      uniform vec2 screenSize;
      uniform vec2 textureSize;
      uniform vec3 cameraOffset;
      
      void main() {
        vec4 sceneColor = texture2D(textureSampler, vUV);
        
        if (intensity < 0.01) {
          gl_FragColor = sceneColor;
          return;
        }
        
        float screenAspect = screenSize.x / screenSize.y;
        float textureAspect = textureSize.x / textureSize.y;
        
        vec2 scale;
        if (screenAspect > textureAspect) {
          scale = vec2(1.0, screenAspect / textureAspect);
        } else {
          scale = vec2(textureAspect / screenAspect, 1.0);
        }
        
        float overdrawScale = 1.032;
        scale *= overdrawScale;
        
        vec2 parallaxOffset1 = vec2(cameraOffset.x * 0.02, cameraOffset.z * 0.02);
        vec2 parallaxOffset2 = vec2(-cameraOffset.x * 0.015, cameraOffset.z * 0.025);
        
        vec2 leafUV1 = (vUV - 0.5) / scale + 0.5 + parallaxOffset1;
        vec4 leafColor1 = texture2D(leafColorTexture1, leafUV1);
        float leafMask1 = texture2D(leafMaskTexture1, leafUV1).r;
        vec3 darkenedLeaf1 = leafColor1.rgb * 0.3;
        float mixAmount1 = leafMask1 * intensity * 0.65;
        
        vec2 leafUV2 = (vUV - 0.5) / scale + 0.5 + parallaxOffset2;
        vec4 leafColor2 = texture2D(leafColorTexture2, leafUV2);
        float leafMask2 = texture2D(leafMaskTexture2, leafUV2).r;
        vec3 darkenedLeaf2 = leafColor2.rgb * 0.3;
        float mixAmount2 = leafMask2 * intensity;
        
        vec3 result = sceneColor.rgb;
        result = mix(result, darkenedLeaf1, mixAmount1);
        result = mix(result, darkenedLeaf2, mixAmount2);
        
        gl_FragColor = vec4(result, sceneColor.a);
      }
    `;

    leafTriggerPost = new PostProcess(
      'leafTrigger',
      'leafTrigger',
      ['intensity', 'screenSize', 'textureSize', 'cameraOffset'],
      ['leafColorTexture1', 'leafMaskTexture1', 'leafColorTexture2', 'leafMaskTexture2'],
      1.0,
      camera
    );

    leafTriggerPost.onApply = (effect) => {
      const isInLeaves = currentTreeIndex >= 0 || currentBushIndex >= 0;
      
      if (leafEffect && leafEffect.ready()) {
        const colorTexture1 = leafEffect.getColorTexture(selectedTextureIndex1);
        const maskTexture1 = leafEffect.getMaskTexture(selectedTextureIndex1);
        const colorTexture2 = leafEffect.getColorTexture(selectedTextureIndex2);
        const maskTexture2 = leafEffect.getMaskTexture(selectedTextureIndex2);
        
        if (colorTexture1 && maskTexture1 && colorTexture2 && maskTexture2 && scene && camera) {
          effect.setTexture('leafColorTexture1', colorTexture1);
          effect.setTexture('leafMaskTexture1', maskTexture1);
          effect.setTexture('leafColorTexture2', colorTexture2);
          effect.setTexture('leafMaskTexture2', maskTexture2);
          
          const engine = scene.getEngine();
          effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
          effect.setFloat2('textureSize', 1024, 1024);
          
          const camPos = camera.position;
          const offsetX = camPos.x - leafEntryX;
          const offsetY = camPos.y - leafEntryY;
          const offsetZ = camPos.z - leafEntryZ;
          effect.setFloat3('cameraOffset', offsetX, offsetY, offsetZ);
          
          effect.setFloat('intensity', isInLeaves ? 1.0 : 0.0);
        } else {
          effect.setFloat('intensity', 0.0);
        }
      } else {
        effect.setFloat('intensity', 0.0);
      }
    };

    scene.onBeforeRenderObservable.add(checkCameraInLeaves);
  }

  function setupBloodSplatterPostProcess(scene: Scene, camera: any) {
    if (!scene) return;

    Effect.ShadersStore['bloodSplatterFragmentShader'] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D bloodColorTexture;
      uniform sampler2D bloodMaskTexture;
      uniform float alpha;
      uniform vec2 screenSize;
      uniform vec2 textureSize;
      uniform vec3 cameraOffset;
      
      void main() {
        vec4 sceneColor = texture2D(textureSampler, vUV);
        
        if (alpha < 0.01) {
          gl_FragColor = sceneColor;
          return;
        }
        
        // Calculate aspect ratios for proper scaling
        float screenAspect = screenSize.x / screenSize.y;
        float textureAspect = textureSize.x / textureSize.y;
        
        vec2 scale;
        if (screenAspect > textureAspect) {
          scale = vec2(1.0, screenAspect / textureAspect);
        } else {
          scale = vec2(textureAspect / screenAspect, 1.0);
        }
        
        // Add slight overdraw scale to ensure full coverage
        float overdrawScale = 1.032;
        scale *= overdrawScale;
        
        // Apply parallax offset based on camera movement
        vec2 parallaxOffset = vec2(cameraOffset.x * 0.012, cameraOffset.z * 0.012);
        
        // Center and scale UV coordinates with parallax
        vec2 bloodUV = (vUV - 0.5) / scale + 0.5 + parallaxOffset;
        
        vec4 bloodColor = texture2D(bloodColorTexture, bloodUV);
        vec4 bloodMask = texture2D(bloodMaskTexture, bloodUV);
        
        // Use mask's red channel as alpha, multiply by timer alpha
        float maskAlpha = bloodMask.r * alpha;
        
        // Blend blood splatter over scene
        vec3 finalColor = mix(sceneColor.rgb, bloodColor.rgb, maskAlpha);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    bloodSplatterPost = new PostProcess(
      'bloodSplatter',
      'bloodSplatter',
      ['alpha', 'screenSize', 'textureSize', 'cameraOffset'],
      ['bloodColorTexture', 'bloodMaskTexture'],
      1.0,
      camera
    );

    bloodSplatterPost.onApply = (effect) => {
      if (bloodSplatterEffect && scene && camera) {
        effect.setTexture('bloodColorTexture', bloodSplatterEffect.getColorTexture());
        effect.setTexture('bloodMaskTexture', bloodSplatterEffect.getMaskTexture());
        effect.setFloat('alpha', bloodSplatterAlpha.value);
        
        const engine = scene.getEngine();
        effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
        effect.setFloat2('textureSize', 1024, 1024);
        
        // Calculate camera offset for parallax movement
        const camPos = camera.position;
        const offsetX = camPos.x - bloodEntryX;
        const offsetY = camPos.y - bloodEntryY;
        const offsetZ = camPos.z - bloodEntryZ;
        effect.setFloat3('cameraOffset', offsetX, offsetY, offsetZ);
      } else {
        effect.setFloat('alpha', 0.0);
      }
    };
  }

  function checkCameraInLeaves() {
    if (!scene || !scene.activeCamera) {
      currentTreeIndex = -1;
      currentBushIndex = -1;
      return;
    }

    const camPos = scene.activeCamera.position;
    
    // Check trees first
    let treeIndex = -1;
    if (treeManager) {
      treeIndex = treeManager.checkCameraInLeaves(camPos.x, camPos.y, camPos.z);
    }
    
    // Check bushes if not in a tree
    let bushIndex = -1;
    if (treeIndex < 0 && bushManager) {
      bushIndex = bushManager.checkCameraInBushes(camPos.x, camPos.y, camPos.z);
    }

    const inFoliage = treeIndex >= 0 || bushIndex >= 0;

    if (inFoliage && !wasInLeavesLastFrame) {
      onLeavesEnter(camPos.x, camPos.y, camPos.z);
    } else if (!inFoliage && wasInLeavesLastFrame) {
      onLeavesLeave();
    }

    wasInLeavesLastFrame = inFoliage;
    currentTreeIndex = treeIndex;
    currentBushIndex = bushIndex;
  }

  function onLeavesEnter(x: number, y: number, z: number) {
    leafEntryX = x;
    leafEntryY = y;
    leafEntryZ = z;
    
    try {
      const audioManager = AudioManager.getInstance();
      audioManager.play('rustle', { volume: 0.5, position: { x, y, z } });
    } catch (e) {
    }
  }

  function onLeavesLeave() {
    selectedTextureIndex1 = Math.floor(Math.random() * 3);
    selectedTextureIndex2 = Math.floor(Math.random() * 3);
    
    while (selectedTextureIndex2 === selectedTextureIndex1) {
      selectedTextureIndex2 = Math.floor(Math.random() * 3);
    }
    try {
      const audioManager = AudioManager.getInstance();
      audioManager.play('rustle', { volume: 0.4, position: { x: leafEntryX, y: leafEntryY, z: leafEntryZ } });
    } catch (e) {
    }
  }
  
  // Loading phase methods
  const sendClientReady = () => {
    if (networkClient) {
      networkClient.sendLow(Opcode.ClientReady, {});
    }
  };
  
  const onPlayersReadyUpdate = (callback: (data: any) => void) => {
    // Just watch the reactive refs instead - this is kept for backwards compat
    watch([loadingSecondsRemaining, loadingReadyPlayers, loadingTotalPlayers], () => {
      callback({
        secondsRemaining: loadingSecondsRemaining.value,
        readyPlayers: loadingReadyPlayers.value,
        totalPlayers: loadingTotalPlayers.value
      });
    });
  };
  
  const onGameBegin = (callback: () => void) => {
    // If game already began (we missed it), call immediately
    if (gameBegun.value) {
      callback();
      return;
    }
    // Otherwise store the callback for when it fires
    gameBeginCallbacks.push(callback);
  };

  const color3ToHex = (color: Color3): string => {
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const toHex = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  };

  const getDirectionalLight = (): DirectionalLight | null => {
    if (!scene) return null;
    const light = scene.getLightByName('dirLight');
    return light instanceof DirectionalLight ? light : null;
  };

  const getHemisphericLight = (): HemisphericLight | null => {
    if (!scene) return null;
    const light = scene.getLightByName('hemiLight');
    return light instanceof HemisphericLight ? light : null;
  };

  // Post-process debug methods
  const setPostProcessExposure = (value: number) => finalPostProcess?.setExposure(value);
  const setPostProcessContrast = (value: number) => finalPostProcess?.setContrast(value);
  const setPostProcessSaturation = (value: number) => finalPostProcess?.setSaturation(value);
  const setPostProcessChromaticAberration = (value: number) => finalPostProcess?.setChromaticAberration(value);
  const setPostProcessSharpening = (value: number) => finalPostProcess?.setSharpening(value);
  const setPostProcessGrainIntensity = (value: number) => finalPostProcess?.setGrainIntensity(value);
  const setPostProcessHealthPercentage = (value: number) => finalPostProcess?.setHealthPercentage(value);
  const setPostProcessPencilEnabled = (value: boolean) => finalPostProcess?.setPencilEnabled(value);
  const setPostProcessPencilEdgeStrength = (value: number) => finalPostProcess?.setPencilEdgeStrength(value);
  const setPostProcessPencilDepthWeight = (value: number) => finalPostProcess?.setPencilDepthWeight(value);
  const setPostProcessPencilNormalWeight = (value: number) => finalPostProcess?.setPencilNormalWeight(value);
  const setPostProcessPencilEdgeThreshold = (value: number) => finalPostProcess?.setPencilEdgeThreshold(value);
  const setPostProcessPencilHatchIntensity = (value: number) => finalPostProcess?.setPencilHatchIntensity(value);
  const setPostProcessPencilHatchScale = (value: number) => finalPostProcess?.setPencilHatchScale(value);
  const setPostProcessPencilPaperIntensity = (value: number) => finalPostProcess?.setPencilPaperIntensity(value);

  // Lighting debug methods
  const setDirectionalLightIntensity = (value: number) => {
    const light = getDirectionalLight();
    if (light) light.intensity = value;
  };

  const setDirectionalLightColor = (value: string) => {
    const light = getDirectionalLight();
    if (light) light.diffuse = hexToColor3(value);
  };

  const MIN_HEMI_INTENSITY = 0.35;
  const setHemisphericLightIntensity = (value: number) => {
    const light = getHemisphericLight();
    if (light) light.intensity = Math.max(MIN_HEMI_INTENSITY, value);
  };

  const setHemisphericLightColor = (value: string) => {
    const light = getHemisphericLight();
    if (light) light.diffuse = hexToColor3(value);
  };

  const setHemisphericGroundColor = (value: string) => {
    const light = getHemisphericLight();
    if (!light) return;
    const baseColor = hexToColor3(value);
    light.metadata = {
      ...light.metadata,
      baseGroundColor: baseColor
    };
    const dirLight = getDirectionalLight();
    if (!dirLight) {
      light.groundColor = baseColor;
      return;
    }

    const dir = dirLight.direction;
    const len = dir.length();
    const normY = len > 0.0001 ? dir.y / len : dir.y;
    const sunUp = Math.max(0, -normY);
    const factor = Math.min(1, Math.max(0, sunUp * dirLight.intensity * 1.45));

    light.groundColor.r = baseColor.r * factor;
    light.groundColor.g = baseColor.g * factor;
    light.groundColor.b = baseColor.b * factor;
  };

  const setAmbientTintStrength = (value: number) => {
    if (!scene) return;
    const current = (scene.metadata as { ambientParams?: { tintStrength: number; minIntensity: number; maxIntensity: number } } | undefined)?.ambientParams;
    scene.metadata = {
      ...scene.metadata,
      ambientParams: {
        tintStrength: Math.max(0, Math.min(1.0, value)),
        minIntensity: current?.minIntensity ?? 0.25,
        maxIntensity: current?.maxIntensity ?? 1.0
      }
    };
  };

  const setAmbientMinIntensity = (value: number) => {
    if (!scene) return;
    const current = (scene.metadata as { ambientParams?: { tintStrength: number; minIntensity: number; maxIntensity: number } } | undefined)?.ambientParams;
    scene.metadata = {
      ...scene.metadata,
      ambientParams: {
        tintStrength: current?.tintStrength ?? 0.35,
        minIntensity: Math.max(0, Math.min(1.0, value)),
        maxIntensity: current?.maxIntensity ?? 1.0
      }
    };
  };

  const setAmbientMaxIntensity = (value: number) => {
    if (!scene) return;
    const current = (scene.metadata as { ambientParams?: { tintStrength: number; minIntensity: number; maxIntensity: number } } | undefined)?.ambientParams;
    scene.metadata = {
      ...scene.metadata,
      ambientParams: {
        tintStrength: current?.tintStrength ?? 0.35,
        minIntensity: current?.minIntensity ?? 0.25,
        maxIntensity: Math.max(0, Math.min(1.0, value))
      }
    };
  };
  
  const getPostProcessValues = () => {
    const dirLight = getDirectionalLight();
    const hemiLight = getHemisphericLight();

    const ambientParams = (scene?.metadata as { ambientParams?: { tintStrength: number; minIntensity: number; maxIntensity: number } } | undefined)?.ambientParams;

    return {
      exposure: finalPostProcess?.exposure ?? 1.05,
      contrast: finalPostProcess?.contrast ?? 1.1,
      saturation: finalPostProcess?.saturation ?? 1.5,
      chromaticAberration: finalPostProcess?.chromaticAberrationStrength ?? 3.1,
      sharpening: finalPostProcess?.sharpenStrength ?? 0.29,
      grainIntensity: finalPostProcess?.grainIntensity ?? 0.03,
      healthPercentage: 1.0,
      pencilEnabled: finalPostProcess?.pencilEnabled ?? false,
      pencilEdgeStrength: finalPostProcess?.pencilEdgeStrength ?? 1.2,
      pencilDepthWeight: finalPostProcess?.pencilDepthWeight ?? 0.7,
      pencilNormalWeight: finalPostProcess?.pencilNormalWeight ?? 0.9,
      pencilEdgeThreshold: finalPostProcess?.pencilEdgeThreshold ?? 0.12,
      pencilHatchIntensity: finalPostProcess?.pencilHatchIntensity ?? 0.35,
      pencilHatchScale: finalPostProcess?.pencilHatchScale ?? 1.4,
      pencilPaperIntensity: finalPostProcess?.pencilPaperIntensity ?? 0.08,
      dirLightIntensity: dirLight?.intensity ?? 0.8,
      dirLightColor: dirLight ? color3ToHex(dirLight.diffuse) : '#fff2d9',
      hemiLightIntensity: Math.max(MIN_HEMI_INTENSITY, hemiLight?.intensity ?? MIN_HEMI_INTENSITY),
      hemiLightColor: hemiLight ? color3ToHex(hemiLight.diffuse) : '#8080b3',
      hemiGroundColor: hemiLight
        ? color3ToHex((hemiLight.metadata as { baseGroundColor?: Color3 } | undefined)?.baseGroundColor ?? hemiLight.groundColor)
        : '#ffffff',
      ambientTintStrength: ambientParams?.tintStrength ?? 0.35,
      ambientMinIntensity: ambientParams?.minIntensity ?? 0.25,
      ambientMaxIntensity: ambientParams?.maxIntensity ?? 1.0
    };
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
    playerBreathRemaining,
    playerMaxBreath,
    playerIsUnderwater,
    playerIsInWater,
    playerX,
    playerY,
    playerZ,
    hasWeapon: weaponSystem.hasWeapon,
    weaponType: weaponSystem.weaponType,
    currentAmmo: weaponSystem.currentAmmo,
    maxCapacity: weaponSystem.maxCapacity,
    isReloading: weaponSystem.isReloading,
    reloadProgress: weaponSystem.reloadProgress,
    bloomPercent: weaponSystem.bloomPercent,
    latency,
    pingColorClass,
    simulatedLatencyMs,
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
    // Hit marker
    hitMarkerVisible,
    // Loading phase
    sendClientReady,
    onPlayersReadyUpdate,
    onGameBegin,
    loadingSecondsRemaining,
    loadingReadyPlayers,
    loadingTotalPlayers,
    gameBegun,
    getScene: () => scene,
    getCamera: () => cameraController?.getCamera() || null,
    getCameraDebugOffset: () => cameraController?.getDebugOffset() ?? { y: 0, forward: 0 },
    setCameraDebugOffset: (y: number, forward: number) => cameraController?.setDebugOffset(y, forward),
    getPlayerTransform: () => myTransform.value,
    myTransform, // Direct ref access for debug panels
    getNetworkClient: () => networkClient,
    // Post-process debug
    setPostProcessExposure,
    setPostProcessContrast,
    setPostProcessSaturation,
    setPostProcessChromaticAberration,
    setPostProcessSharpening,
    setPostProcessGrainIntensity,
    setPostProcessHealthPercentage,
    setPostProcessPencilEnabled,
    setPostProcessPencilEdgeStrength,
    setPostProcessPencilDepthWeight,
    setPostProcessPencilNormalWeight,
    setPostProcessPencilEdgeThreshold,
    setPostProcessPencilHatchIntensity,
    setPostProcessPencilHatchScale,
    setPostProcessPencilPaperIntensity,
    setDirectionalLightIntensity,
    setDirectionalLightColor,
    setHemisphericLightIntensity,
    setHemisphericLightColor,
    setHemisphericGroundColor,
    setAmbientTintStrength,
    setAmbientMinIntensity,
    setAmbientMaxIntensity,
    getPostProcessValues
  };
}
