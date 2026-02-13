// Opcode definitions for network protocol
//
// Network-Synced Spatial Audio Pattern:
// - For actions that produce sound (reload, drop, etc.), the local player plays a non-spatial version
// - Server broadcasts the event to all clients with excludeSender=true
// - Remote clients play a spatial version at the entity's position
// - Client checks: if excludeSender && entityId === myEntityId, skip playing
//
export enum Opcode {
  // High-frequency binary messages (0x01-0x0F)
  TransformUpdate = 0x01,
  PlayerInput = 0x02,
  ShootRequest = 0x03,
  ProjectileSpawn = 0x04,
  ProjectileDestroy = 0x05,
  ProjectileSpawnBatch = 0x06,
  
  // Low-frequency JSON messages (0x10+)
  RoomJoin = 0x10,
  RoomLeave = 0x11,
  RoomState = 0x12,
  PlayerJoined = 0x20,
  PlayerLeft = 0x21,
  EntityDamage = 0x22,
  EntityDeath = 0x23,
  ItemSpawn = 0x30,
  ItemUpdate = 0x31,
  ItemPickup = 0x32,
  ItemDrop = 0x33,
  ItemTossLand = 0x34,
  ReloadRequest = 0x35,
  ReloadStarted = 0x3E,
  FootstepEvent = 0x3F,
  ItemDropSound = 0x3D,
  ExplosionSpawn = 0x36,
  StaminaUpdate = 0x37,
  BuffApplied = 0x38,
  BuffExpired = 0x39,
  ArmorUpdate = 0x3A,
  HelmetUpdate = 0x3B,
  MaterialsUpdate = 0x3C,
  TreeSpawn = 0x40,
  RockSpawn = 0x41,
  BushSpawn = 0x42,
  FootstepSound = 0x43,
  DummySpawn = 0x80,
  BlockPlace = 0x50,
  BlockRemove = 0x51,
  BlockPlaced = 0x52,
  BlockRemoved = 0x53,
  BuildingInitialState = 0x54,
  BuildingCreate = 0x55,
  BuildingCreated = 0x56,
  BuildingTransform = 0x57,
  BuildingTransformed = 0x58,
  BuildingDestroy = 0x59,
  BuildingDestroyed = 0x5A,
  LadderPlace = 0x60,
  LadderSpawned = 0x61,
  LadderDestroy = 0x62,
  LadderDestroyed = 0x63,
  ChatMessage = 0x70,
  ChatBroadcast = 0x71,
  LobbyConfig = 0x72,
  LobbyConfigUpdate = 0x73,
  LobbyStart = 0x74,
  LobbyStarting = 0x75,
  LobbyStartCountdown = 0x79,
  LobbyStartCancel = 0x7A,
  GameLoading = 0x7B,
  ClientReady = 0x7C,
  PlayersReadyUpdate = 0x7D,
  GameBegin = 0x7E,
  KillFeed = 0x76,
  RoundState = 0x77,
  ScoreUpdate = 0x78,
  Error = 0xFF
}

// Message type definitions
export interface RoomJoinMessage {
  roomId: string;
  config?: LobbyConfigPayload;
}

export interface RoomLeaveMessage {
  roomId: string;
}

export interface PlayerInfo {
  id: string;
  entityId: number;
  color: string;
  kills: number;
  deaths: number;
}

export interface RoomStateMessage {
  roomId: string;
  players: PlayerInfo[];
  myEntityId: number;
  ownerId: string;
}

export interface PlayerJoinedMessage {
  player: PlayerInfo;
}

export interface PlayerLeftMessage {
  playerId: string;
  entityId: number;
}

export interface ErrorMessage {
  code: string;
  message: string;
}

export interface TransformData {
  entityId: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  headPitch: number; // Head pitch angle in radians for head rotation visualization
  lastProcessedInput?: number; // Sequence number of last processed input
  // Water state (only for players)
  isInWater?: boolean;
  isHeadUnderwater?: boolean;
  breathRemaining?: number;
  waterDepth?: number;
  isExhausted?: boolean; // Stamina depleted (causes sinking)
}

export interface InputData {
  sequence: number;
  deltaTime: number;
  forward: number;  // -1, 0, 1
  right: number;    // -1, 0, 1
  cameraYaw: number;   // Camera yaw angle in radians (movement is relative to this)
  cameraPitch: number; // Camera pitch angle in radians (for shooting direction)
  jump: boolean;       // Jump button pressed
  sprint: boolean;     // Sprint button pressed (shift)
  timestamp: number;
}

// ── Projectile messages ──────────────────────────────────────

/** Client -> Server: request to shoot with aim direction. */
export interface ShootData {
  timestamp: number;
  dirX: number;   // Normalized aim direction from player toward aim point
  dirY: number;
  dirZ: number;
  spawnX: number;  // Projectile spawn position (barrel tip)
  spawnY: number;
  spawnZ: number;
}

/** Server -> Clients: a new projectile was spawned. */
export interface ProjectileSpawnData {
  entityId: number;
  ownerId: number;
  posX: number;
  posY: number;
  posZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  speed: number;
}

/** Server -> Clients: a projectile was destroyed. */
export interface ProjectileDestroyData {
  entityId: number;
}

/** Server -> Clients: an entity took damage (JSON, low-freq). */
export interface EntityDamageMessage {
  entityId: number;
  damage: number;
  newHealth: number;
  attackerId: number;
}

/** Server -> Clients: an entity died (JSON, low-freq). */
export interface EntityDeathMessage {
  entityId: number;
  killerId: number;
}

/** Server -> Clients: kill feed notification for UI. */
export interface KillFeedMessage {
  killerEntityId: number;
  killerColor: string;
  victimEntityId: number;
  victimColor: string;
  weaponType: string | null;  // null for suicide/environment
  isHeadshot: boolean;        // true if kill was via headshot
  timestamp: number;
}

/** Server -> Clients: an item was spawned in the world. */
export interface ItemSpawnMessage {
  entityId: number;
  itemType: string; // 'pistol', etc.
  posX: number;
  posY: number;
  posZ: number;
}

/** Server -> Clients: a dummy target was spawned. */
export interface DummySpawnMessage {
  entityId: number;
  posX: number;
  posY: number;
  posZ: number;
  color?: string;
}

/** Server -> Clients: an item position update. */
export interface ItemUpdateMessage {
  entityId: number;
  posX: number;
  posY: number;
  posZ: number;
  settled: boolean; // true = on ground, no more updates
}

/** Server -> Clients: a player picked up an item. */
export interface ItemPickupMessage {
  entityId: number;      // item entity ID (being removed)
  playerId: number;      // player entity ID who picked it up
  itemType: string;      // 'pistol', etc.
  ammoCurrent?: number;  // current magazine ammo (weapons only)
  ammoCapacity?: number; // magazine capacity (weapons only)
}

/** Client -> Server: player wants to drop held item. */
export interface ItemDropMessage {
  // No payload needed - server knows which player from connection
}

/** Client -> Server: toss animation finished, spawn item at position. */
export interface ItemTossLandMessage {
  posX: number;
  posY: number;
  posZ: number;
}

/** Client -> Server: player wants to reload weapon. */
export interface ReloadRequestMessage {
  // No payload needed - server knows which player from connection
}

/** Server -> Clients: a player started reloading (for remote audio). */
export interface ReloadStartedMessage {
  entityId: number;
  weaponType: string;
  excludeSender?: boolean; // If true, sender should not play spatial version (they play local)
}

/** Server -> Clients: a player dropped an item (for remote spatial audio). */
export interface ItemDropSoundMessage {
  entityId: number;  // player entity ID who dropped the item
  posX: number;      // drop position X
  posY: number;      // drop position Y
  posZ: number;      // drop position Z
  excludeSender?: boolean; // If true, sender should not play spatial version (they play local)
}

/** Client -> Server: local player played a footstep (relay to others for spatial audio). */
export interface FootstepEventMessage {
  variant: number;   // 0-3 for footstep_a .. footstep_d
  posX: number;
  posY: number;
  posZ: number;
  volume: number;    // 0-1
}

/** Server -> Clients: a player stepped (for remote spatial audio). */
export interface FootstepSoundMessage {
  entityId: number;
  variant: number;
  posX: number;
  posY: number;
  posZ: number;
  volume: number;
  excludeSender?: boolean;
}

/** Server -> Clients: all trees in the level (sent once on join). */
export interface TreeSpawnMessage {
  trees: Array<{
    variationId: number;  // Which tree variation (0-17)
    posX: number;         // World position X
    posY: number;         // World position Y
    posZ: number;         // World position Z
    rotationY: number;    // Rotation around Y axis (radians)
  }>;
}

/** Server -> Clients: all rocks in the level (sent once on join). */
export interface RockSpawnMessage {
  rocks: Array<{
    variationId: number;  // Which rock variation
    posX: number;         // World position X
    posY: number;         // World position Y
    posZ: number;         // World position Z
    rotationY: number;    // Rotation around Y axis (radians)
    scale: number;        // Scale multiplier
  }>;
}

/** Server -> Clients: an explosion occurred (for visual effects). */
export interface ExplosionSpawnMessage {
  posX: number;
  posY: number;
  posZ: number;
  radius: number;
}

export interface StaminaUpdateMessage {
  entityId: number;
  stamina: number;         // Current stamina (0-100)
  isExhausted: boolean;    // True when exhausted
}

export interface BuffAppliedMessage {
  entityId: number;
  buffType: string;        // Type of buff applied
  duration: number;        // Duration in seconds
}

export interface BuffExpiredMessage {
  entityId: number;
  buffType: string;        // Type of buff that expired
}

export interface ArmorUpdateMessage {
  entityId: number;
  armor: number;           // Current armor (0-50)
}

export interface HelmetUpdateMessage {
  entityId: number;
  hasHelmet: boolean;      // Whether player has helmet
  helmetHealth: number;    // Current helmet health (0-20)
}

export interface MaterialsUpdateMessage {
  entityId: number;
  materials: number;       // Current materials
}

export interface BlockPlaceMessage {
  buildingEntityId: number;
  gridX: number;
  gridY: number;
  gridZ: number;
  colorIndex: number;
}

export interface BlockRemoveMessage {
  buildingEntityId: number;
  gridX: number;
  gridY: number;
  gridZ: number;
}

export interface BlockPlacedMessage {
  buildingEntityId: number;
  gridX: number;
  gridY: number;
  gridZ: number;
  colorIndex: number;
}

export interface BlockRemovedMessage {
  buildingEntityId: number;
  gridX: number;
  gridY: number;
  gridZ: number;
}

export interface BuildingInitialStateMessage {
  buildingEntityId: number;
  ownerEntityId: number;
  gridPositionX: number;
  gridPositionY: number;
  gridPositionZ: number;
  gridRotationY: number;
  gridSize: number;
  blocks: Array<{
    gridX: number;
    gridY: number;
    gridZ: number;
    colorIndex: number;
  }>;
}

export interface BuildingCreateMessage {
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
}

export interface BuildingCreatedMessage {
  buildingEntityId: number;
  ownerEntityId: number;
  gridPositionX: number;
  gridPositionY: number;
  gridPositionZ: number;
  gridRotationY: number;
  gridSize: number;
}

export interface BuildingTransformMessage {
  buildingEntityId: number;
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
}

export interface BuildingTransformedMessage {
  buildingEntityId: number;
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
}

export interface BuildingDestroyMessage {
  buildingEntityId: number;
}

export interface BuildingDestroyedMessage {
  buildingEntityId: number;
}

// ── Ladder messages ──────────────────────────────────────────

/** Client -> Server: request to place a ladder. */
export interface LadderPlaceMessage {
  posX: number;
  posY: number;
  posZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  segmentCount: number;
}

/** Server -> Clients: a ladder was spawned. */
export interface LadderSpawnedMessage {
  entityId: number;
  posX: number;
  posY: number;
  posZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  segmentCount: number;
}

/** Client -> Server: request to destroy a ladder. */
export interface LadderDestroyMessage {
  entityId: number;
}

/** Server -> Clients: a ladder was destroyed. */
export interface LadderDestroyedMessage {
  entityId: number;
}

// ── Lobby messages ───────────────────────────────────────────

/** Client -> Server: send a chat message. */
export interface ChatMessagePayload {
  text: string;
}

/** Server -> Clients: broadcast a chat message. */
export interface ChatBroadcastPayload {
  senderId: string;
  senderColor: string;
  text: string;
  timestamp: number;
}

/** Client -> Server: owner sends lobby configuration. */
export interface LobbyConfigPayload {
  seed?: string;
  pistolCount?: number;
  headshotDmg?: number;  // Headshot damage multiplier (default: 2.0)
  normalDmg?: number;    // Normal shot damage multiplier (default: 1.0)
}

/** Server -> Clients: broadcast lobby configuration update. */
export interface LobbyConfigUpdatePayload {
  config: LobbyConfigPayload;
}

/** Client -> Server: owner triggers game start. */
export interface LobbyStartMessage {
  // No payload needed - server will compute seed and room
}

/** Server -> Clients: game is starting, navigate to level. */
export interface LobbyStartingPayload {
  seed: string;
  config: LobbyConfigPayload;
}

export interface LobbyStartCountdownPayload {
  secondsRemaining: number;
}

export interface GameLoadingPayload {
  seed: string;
  config: LobbyConfigPayload;
}

export interface ClientReadyPayload {
  // Empty - just a signal
}

export interface PlayersReadyUpdatePayload {
  readyPlayers: string[]; // Array of player IDs who are ready
  totalPlayers: number;
  secondsRemaining: number;
}

export interface GameBeginPayload {
  // Server will send initial game state separately
}

// ── Round system messages ────────────────────────────────────

/** Player score tracking */
export interface PlayerScore {
  entityId: number;
  name: string;
  kills: number;
  deaths: number;
}

/** Server -> Clients: full round state update */
export interface RoundStateMessage {
  phase: 'waiting' | 'countdown' | 'active' | 'ended';
  countdownSeconds?: number;
  scores: PlayerScore[];
  config: {
    scoreLimit: number;
    timeLimit?: number;
    minPlayers: number;
  };
  winner?: { entityId: number; name: string; kills: number } | null;
}

/** Server -> Clients: incremental score update */
export interface ScoreUpdateMessage {
  entityId: number;
  kills: number;
  deaths: number;
}
