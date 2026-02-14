/**
 * Server-level system for deterministic level generation using shared generators.
 * Owns tree/rock/bush instances, collider meshes, and octree. Does not own voxelGrid
 * (Room creates it). Level items (weapons, pickups) are spawned via ItemSystem to avoid
 * duplicating entity creation logic.
 */

import type { TerrainCollisionGrid } from '@spong/shared';
import {
  createRNG,
  generateTreeVariations,
  placeTreeInstances,
  generateRockVariations,
  placeRockInstances,
  generateBushVariations,
  placeBushInstances,
  Octree,
  type OctreeEntry,
  type TreeInstance,
  type RockInstance,
  type BushInstance,
  type TreeColliderMesh,
  type TreeTransform,
  type RockColliderMesh,
  type RockTransform,
} from '@spong/shared';
import type { ItemSystem, ItemType } from './ItemSystem.js';

const CELL_SIZE = 2.0;
const HALF_EXTENT = 270; // 9-tile world: -270 to 270 in X/Z
const TREE_SCALE = 0.4;
const ROCK_SCALE = 0.5;

export interface LevelSystemOptions {
  itemSystem: ItemSystem;
}

export interface GenerateLevelOptions {
  seed: string;
  voxelGrid: TerrainCollisionGrid;
  waterLevelProvider?: { isValidSpawnPosition(x: number, y: number, z: number): boolean };
  occupiedCells: Set<string>;
  lobbyConfig?: { pistolCount?: number; disableSpawns?: string[] };
}

export interface TreeSpawnMessagePayload {
  trees: Array<{ variationId: number; posX: number; posY: number; posZ: number; rotationY: number }>;
}
export interface RockSpawnMessagePayload {
  rocks: Array<{ variationId: number; posX: number; posY: number; posZ: number; rotationY: number; scale: number }>;
}
export interface BushSpawnMessagePayload {
  bushes: Array<{ variationId: number; posX: number; posY: number; posZ: number }>;
}

export class LevelSystem {
  private readonly itemSystem: ItemSystem;
  private treeInstances: TreeInstance[] = [];
  private rockInstances: RockInstance[] = [];
  private bushInstances: BushInstance[] = [];
  private treeColliderMeshes: Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> = [];
  private rockColliderMeshes: Array<{ mesh: RockColliderMesh; transform: RockTransform }> = [];
  private octree: Octree | null = null;

  constructor(options: LevelSystemOptions) {
    this.itemSystem = options.itemSystem;
  }

  generateLevel(options: GenerateLevelOptions): void {
    const { seed, voxelGrid, waterLevelProvider, occupiedCells, lobbyConfig } = options;
    const disableSpawns = (lobbyConfig?.disableSpawns || []) as string[];

    if (!disableSpawns.includes('items')) {
      this.spawnLevelItems(seed, voxelGrid, waterLevelProvider, occupiedCells, lobbyConfig);
    }
    if (!disableSpawns.includes('rocks')) {
      this.spawnLevelRocks(seed, voxelGrid, occupiedCells);
    }
    if (!disableSpawns.includes('trees')) {
      this.spawnLevelTrees(seed, voxelGrid, waterLevelProvider, occupiedCells);
    }
    if (!disableSpawns.includes('bushes')) {
      this.spawnLevelBushes(seed, voxelGrid, waterLevelProvider, occupiedCells);
    }
    this.buildOctree();
  }

  addBuilderRoomTreeAndRock(roomId: string): void {
    const rng = createRNG(roomId + '_tree');
    const treeVariations = generateTreeVariations(roomId + '_tree', 32);
    const treeVariationId = Math.floor(rng() * treeVariations.length);
    this.treeInstances.push({
      variationId: treeVariationId,
      worldX: 10,
      worldY: 0,
      worldZ: 10,
      rotationY: 0
    });
    const treeVariation = treeVariations[treeVariationId];
    this.treeColliderMeshes.push({
      mesh: treeVariation.colliderMesh,
      transform: { posX: 10, posY: 0.4, posZ: 10, rotY: 0, scale: TREE_SCALE }
    });

    const rockVariations = generateRockVariations(roomId + '_rock', 3, 9);
    const rockVariationId = Math.floor(rng() * rockVariations.length);
    this.rockInstances.push({
      variationId: rockVariationId,
      worldX: -10,
      worldY: 0,
      worldZ: 10,
      rotationY: 0,
      scale: 1.0
    });
    const rockVariation = rockVariations[rockVariationId];
    this.rockColliderMeshes.push({
      mesh: rockVariation.colliderMesh,
      transform: { posX: -10, posY: 0, posZ: 10, rotY: 0, scale: 1.0 * ROCK_SCALE }
    });
    this.buildOctree();
  }

  private spawnLevelItems(
    seed: string,
    voxelGrid: TerrainCollisionGrid,
    waterLevelProvider: { isValidSpawnPosition(x: number, y: number, z: number): boolean } | undefined,
    occupiedCells: Set<string>,
    config?: { pistolCount?: number }
  ): void {
    const rng = createRNG(seed + '_items');
    const opts = { voxelGrid, waterLevelProvider };
    const PISTOL_COUNT = config?.pistolCount ?? 35;

    let spawned = this.itemSystem.spawnOnTerrain('pistol', 3, 0, opts);
    if (spawned) {
      occupiedCells.add(`${Math.floor((3 + HALF_EXTENT) / CELL_SIZE)},${Math.floor((0 + HALF_EXTENT) / CELL_SIZE)}`);
    }
    let pistolsSpawned = spawned ? 1 : 0;
    const maxAttempts = PISTOL_COUNT * 3;
    for (let attempt = 0; attempt < maxAttempts && pistolsSpawned < PISTOL_COUNT; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      if (this.itemSystem.spawnOnTerrain('pistol', wx, wz, opts)) {
        pistolsSpawned++;
        occupiedCells.add(`${Math.floor((wx + HALF_EXTENT) / CELL_SIZE)},${Math.floor((wz + HALF_EXTENT) / CELL_SIZE)}`);
      }
    }
    this.spawnScattered('smg', 24, rng, opts, occupiedCells, 'SMGs');
    this.spawnScattered('lmg', 12, rng, opts, occupiedCells, 'LMGs');
    this.spawnScattered('shotgun', 16, rng, opts, occupiedCells, 'Shotguns');
    this.spawnScattered('assault', 16, rng, opts, occupiedCells, 'Assault Rifles');
    this.spawnScattered('dmr', 8, rng, opts, occupiedCells, 'DMRs');
    this.spawnScattered('sniper', 8, rng, opts, occupiedCells, 'Snipers');
    this.spawnScattered('rocket', 6, rng, opts, occupiedCells, 'Rocket Launchers');
    this.spawnScattered('kevlar', 20, rng, opts, occupiedCells, 'Kevlar');
    this.spawnScattered('helmet', 20, rng, opts, occupiedCells, 'Helmets');

    this.spawnScatteredNoValidate('medic_pack', 30, rng, opts, occupiedCells);
    this.spawnScatteredNoValidate('large_medic_pack', 16, rng, opts, occupiedCells);
    this.spawnScatteredNoValidate('apple', 40, rng, opts, occupiedCells);
    this.spawnScatteredNoValidate('pill_bottle', 10, rng, opts, occupiedCells);
  }

  private spawnScattered(
    itemType: ItemType,
    count: number,
    rng: () => number,
    opts: { voxelGrid: TerrainCollisionGrid; waterLevelProvider?: { isValidSpawnPosition(x: number, y: number, z: number): boolean } },
    occupiedCells: Set<string>,
    _label: string
  ): void {
    let n = 0;
    const maxAttempts = count * 3;
    for (let attempt = 0; attempt < maxAttempts && n < count; attempt++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      if (this.itemSystem.spawnOnTerrain(itemType, wx, wz, opts)) {
        n++;
        occupiedCells.add(`${Math.floor((wx + HALF_EXTENT) / CELL_SIZE)},${Math.floor((wz + HALF_EXTENT) / CELL_SIZE)}`);
      }
    }
  }

  private spawnScatteredNoValidate(
    itemType: ItemType,
    count: number,
    rng: () => number,
    opts: { voxelGrid: TerrainCollisionGrid },
    occupiedCells: Set<string>
  ): void {
    for (let i = 0; i < count; i++) {
      const wx = (rng() * 2 - 1) * HALF_EXTENT;
      const wz = (rng() * 2 - 1) * HALF_EXTENT;
      this.itemSystem.spawnOnTerrain(itemType, wx, wz, opts);
      occupiedCells.add(`${Math.floor((wx + HALF_EXTENT) / CELL_SIZE)},${Math.floor((wz + HALF_EXTENT) / CELL_SIZE)}`);
    }
  }

  private spawnLevelRocks(seed: string, voxelGrid: TerrainCollisionGrid, occupiedCells: Set<string>): void {
    const variations = generateRockVariations(seed, 5, 9);
    this.rockInstances = placeRockInstances(
      seed,
      variations.length,
      900,
      (worldX: number, worldZ: number) => voxelGrid.getWorldSurfaceY(worldX, worldZ),
      occupiedCells,
      { halfExtent: HALF_EXTENT }
    );
    this.rockColliderMeshes = this.rockInstances.map(instance => {
      const variation = variations[instance.variationId];
      return {
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY,
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: instance.scale * ROCK_SCALE
        }
      };
    });
  }

  private spawnLevelTrees(
    seed: string,
    voxelGrid: TerrainCollisionGrid,
    waterLevelProvider: { isValidSpawnPosition(x: number, y: number, z: number): boolean } | undefined,
    occupiedCells: Set<string>
  ): void {
    const variations = generateTreeVariations(seed);
    const allTreeInstances = placeTreeInstances(
      seed,
      variations.length,
      540,
      (worldX: number, worldZ: number) => voxelGrid.getWorldSurfaceY(worldX, worldZ),
      occupiedCells,
      { halfExtent: HALF_EXTENT }
    );
    this.treeInstances = waterLevelProvider
      ? allTreeInstances.filter(inst => waterLevelProvider.isValidSpawnPosition(inst.worldX, inst.worldY, inst.worldZ))
      : allTreeInstances;

    this.treeColliderMeshes = this.treeInstances.map(instance => {
      const variation = variations[instance.variationId];
      return {
        mesh: variation.colliderMesh,
        transform: {
          posX: instance.worldX,
          posY: instance.worldY + 0.4,
          posZ: instance.worldZ,
          rotY: instance.rotationY,
          scale: TREE_SCALE
        }
      };
    });
  }

  private spawnLevelBushes(
    seed: string,
    voxelGrid: TerrainCollisionGrid,
    waterLevelProvider: { isValidSpawnPosition(x: number, y: number, z: number): boolean } | undefined,
    occupiedCells: Set<string>
  ): void {
    const variations = generateBushVariations(seed, 8, 18);
    const allBushInstances = placeBushInstances(
      seed,
      variations.length,
      720,
      (worldX: number, worldZ: number) => voxelGrid.getWorldSurfaceY(worldX, worldZ),
      occupiedCells
    );
    this.bushInstances = waterLevelProvider
      ? allBushInstances.filter(inst => waterLevelProvider.isValidSpawnPosition(inst.worldX, inst.worldY, inst.worldZ))
      : allBushInstances;
  }

  private buildOctree(): void {
    this.octree = new Octree(0, 10, 0, 310, 6, 8);
    let nextId = 0;
    for (let i = 0; i < this.treeColliderMeshes.length; i++) {
      const instance = this.treeInstances[i];
      const entry: OctreeEntry = {
        id: nextId++,
        type: 'tree',
        data: this.treeColliderMeshes[i],
        minX: instance.worldX - 5,
        minY: instance.worldY - 1,
        minZ: instance.worldZ - 5,
        maxX: instance.worldX + 5,
        maxY: instance.worldY + 20,
        maxZ: instance.worldZ + 5
      };
      this.octree.insert(entry);
    }
    for (let i = 0; i < this.rockColliderMeshes.length; i++) {
      const instance = this.rockInstances[i];
      const radius = 3 * instance.scale;
      const entry: OctreeEntry = {
        id: nextId++,
        type: 'rock',
        data: this.rockColliderMeshes[i],
        minX: instance.worldX - radius,
        minY: instance.worldY - radius,
        minZ: instance.worldZ - radius,
        maxX: instance.worldX + radius,
        maxY: instance.worldY + radius,
        maxZ: instance.worldZ + radius
      };
      this.octree.insert(entry);
    }
  }

  getTreeColliderMeshes(): Array<{ mesh: TreeColliderMesh; transform: TreeTransform }> {
    return this.treeColliderMeshes;
  }

  getRockColliderMeshes(): Array<{ mesh: RockColliderMesh; transform: RockTransform }> {
    return this.rockColliderMeshes;
  }

  getOctree(): Octree | null {
    return this.octree;
  }

  getTreeSpawnMessage(): TreeSpawnMessagePayload | null {
    if (this.treeInstances.length === 0) return null;
    return {
      trees: this.treeInstances.map(t => ({
        variationId: t.variationId,
        posX: t.worldX,
        posY: t.worldY,
        posZ: t.worldZ,
        rotationY: t.rotationY
      }))
    };
  }

  getRockSpawnMessage(): RockSpawnMessagePayload | null {
    if (this.rockInstances.length === 0) return null;
    return {
      rocks: this.rockInstances.map(r => ({
        variationId: r.variationId,
        posX: r.worldX,
        posY: r.worldY,
        posZ: r.worldZ,
        rotationY: r.rotationY,
        scale: r.scale
      }))
    };
  }

  getBushSpawnMessage(): BushSpawnMessagePayload | null {
    if (this.bushInstances.length === 0) return null;
    return {
      bushes: this.bushInstances.map(b => ({
        variationId: b.variationId,
        posX: b.worldX,
        posY: b.worldY,
        posZ: b.worldZ
      }))
    };
  }

  getTreeCount(): number {
    return this.treeInstances.length;
  }

  getRockCount(): number {
    return this.rockInstances.length;
  }

  getBushCount(): number {
    return this.bushInstances.length;
  }
}
