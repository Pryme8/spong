import { Scene, MeshBuilder, PhysicsAggregate, PhysicsShapeType } from '@babylonjs/core';
import type { World, Entity } from '@spong/shared';
import {
  COMP_BUILDING,
  COMP_MATERIALS,
  type BuildingComponent,
  type MaterialsComponent,
  Opcode,
  type BlockPlaceMessage,
  type BlockRemoveMessage,
  type BlockPlacedMessage,
  type BuildingCreateMessage,
  type BuildingCreatedMessage,
  type BuildingTransformMessage,
  type BuildingDestroyMessage,
  type BuildingInitialStateMessage,
  type MaterialsUpdateMessage,
} from '@spong/shared';

const CELL_SIZE = 0.5;
const GRID_SIZE = 12;

type BlockColliderEntry = {
  gridX: number;
  gridY: number;
  gridZ: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export type BoxCollider = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

export interface BuildingSystemOptions {
  world: World;
  scene: Scene;
  broadcast: (opcode: number, msg: unknown) => void;
}

/**
 * Server-side building system. Owns building entities, block physics/colliders,
 * and block placement/removal/transform/finalize. Room delegates opcode handling
 * and uses collectBlockColliders() for physics, getInitialStateMessages() for new players.
 */
export class BuildingSystem {
  private readonly world: World;
  private readonly scene: Scene;
  private readonly broadcast: (opcode: number, msg: unknown) => void;
  private readonly buildingEntities = new Map<number, Entity>();
  private readonly blockPhysics = new Map<string, { mesh: { position: { set: (x: number, y: number, z: number) => void }; dispose: () => void }; aggregate: { dispose: () => void } }>();
  private readonly blockColliderCache = new Map<number, Map<string, BlockColliderEntry>>();

  constructor(options: BuildingSystemOptions) {
    this.world = options.world;
    this.scene = options.scene;
    this.broadcast = options.broadcast;
  }

  handleBuildingCreate(playerEntityId: number, data: BuildingCreateMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    const buildingEntity = this.world.createEntity();
    const buildingEntityId = buildingEntity.id;
    const buildingComp: BuildingComponent = {
      ownerEntityId: playerEntityId,
      gridPositionX: data.posX,
      gridPositionY: data.posY,
      gridPositionZ: data.posZ,
      gridRotationY: data.rotY,
      voxelData: new Uint8Array(GRID_SIZE * GRID_SIZE * GRID_SIZE),
      gridSize: GRID_SIZE,
    };
    buildingEntity.add(COMP_BUILDING, buildingComp);
    this.buildingEntities.set(buildingEntityId, buildingEntity);
    this.blockColliderCache.set(buildingEntityId, new Map());

    const createdMsg: BuildingCreatedMessage = {
      buildingEntityId,
      ownerEntityId: playerEntityId,
      gridPositionX: data.posX,
      gridPositionY: data.posY,
      gridPositionZ: data.posZ,
      gridRotationY: data.rotY,
      gridSize: GRID_SIZE,
    };
    this.broadcast(Opcode.BuildingCreated, createdMsg);
  }

  handleBlockPlace(playerEntityId: number, data: BlockPlaceMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) {
      console.error('[Building] Player entity not found:', playerEntityId);
      return;
    }

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) {
      console.error('[Building] Building entity not found:', data.buildingEntityId);
      return;
    }

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;
    if (building.ownerEntityId !== playerEntityId) return;

    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (!materials || materials.current < 1) return;

    const { gridX, gridY, gridZ, colorIndex } = data;
    if (gridX < 0 || gridX >= building.gridSize || gridY < 0 || gridY >= building.gridSize || gridZ < 0 || gridZ >= building.gridSize) return;

    const index = gridX + gridY * building.gridSize + gridZ * building.gridSize * building.gridSize;
    if (building.voxelData[index] !== 0) return;

    materials.current -= 1;
    const materialsMsg: MaterialsUpdateMessage = { entityId: playerEntityId, materials: materials.current };
    this.broadcast(Opcode.MaterialsUpdate, materialsMsg);

    building.voxelData[index] = colorIndex + 1;
    this.createBlockPhysics(data.buildingEntityId, building, gridX, gridY, gridZ);
    this.upsertBlockCollider(data.buildingEntityId, building, gridX, gridY, gridZ);

    const msg: BlockPlacedMessage = { buildingEntityId: data.buildingEntityId, gridX, gridY, gridZ, colorIndex };
    this.broadcast(Opcode.BlockPlaced, msg);
  }

  handleBlockRemove(playerEntityId: number, data: BlockRemoveMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) return;

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) return;

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;
    if (building.ownerEntityId !== playerEntityId) return;

    const { gridX, gridY, gridZ } = data;
    if (gridX < 0 || gridX >= building.gridSize || gridY < 0 || gridY >= building.gridSize || gridZ < 0 || gridZ >= building.gridSize) return;

    const index = gridX + gridY * building.gridSize + gridZ * building.gridSize * building.gridSize;
    if (building.voxelData[index] === 0) return;

    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (materials) {
      materials.current = Math.min(materials.max, materials.current + 1);
      this.broadcast(Opcode.MaterialsUpdate, { entityId: playerEntityId, materials: materials.current });
    }

    building.voxelData[index] = 0;
    this.removeBlockPhysics(data.buildingEntityId, gridX, gridY, gridZ);
    this.removeBlockCollider(data.buildingEntityId, gridX, gridY, gridZ);

    this.broadcast(Opcode.BlockRemoved, { buildingEntityId: data.buildingEntityId, gridX, gridY, gridZ });
  }

  handleBuildingTransform(playerEntityId: number, data: BuildingTransformMessage): void {
    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) return;

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;
    if (building.ownerEntityId !== playerEntityId) return;

    building.gridPositionX = data.posX;
    building.gridPositionY = data.posY;
    building.gridPositionZ = data.posZ;
    building.gridRotationY = data.rotY;

    const halfSize = (building.gridSize * CELL_SIZE) * 0.5;
    const halfCell = CELL_SIZE * 0.5;

    for (let x = 0; x < building.gridSize; x++) {
      for (let y = 0; y < building.gridSize; y++) {
        for (let z = 0; z < building.gridSize; z++) {
          const idx = x + y * building.gridSize + z * building.gridSize * building.gridSize;
          if (building.voxelData[idx] !== 0) {
            const key = `${data.buildingEntityId}_${x}_${y}_${z}`;
            const physics = this.blockPhysics.get(key);
            if (physics) {
              const localX = (x * CELL_SIZE) - halfSize + halfCell;
              const localY = (y * CELL_SIZE) - halfSize + halfCell;
              const localZ = (z * CELL_SIZE) - halfSize + halfCell;
              const cosY = Math.cos(building.gridRotationY);
              const sinY = Math.sin(building.gridRotationY);
              const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
              const worldY = building.gridPositionY + localY;
              const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);
              physics.mesh.position.set(worldX, worldY, worldZ);
            }
          }
        }
      }
    }

    this.rebuildBlockCollidersForBuilding(data.buildingEntityId, building);
    this.broadcast(Opcode.BuildingTransformed, {
      buildingEntityId: data.buildingEntityId,
      posX: data.posX,
      posY: data.posY,
      posZ: data.posZ,
      rotY: data.rotY,
    });
  }

  handleBuildingDestroy(playerEntityId: number, data: BuildingDestroyMessage): void {
    const playerEntity = this.world.getEntity(playerEntityId);
    if (!playerEntity) return;

    const buildingEntity = this.buildingEntities.get(data.buildingEntityId);
    if (!buildingEntity) return;

    const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
    if (!building) return;
    if (building.ownerEntityId !== playerEntityId) return;

    let blockCount = 0;
    for (let x = 0; x < building.gridSize; x++) {
      for (let y = 0; y < building.gridSize; y++) {
        for (let z = 0; z < building.gridSize; z++) {
          const index = x + y * building.gridSize + z * building.gridSize * building.gridSize;
          if (building.voxelData[index] !== 0) {
            blockCount++;
            this.removeBlockPhysics(data.buildingEntityId, x, y, z);
          }
        }
      }
    }

    const materials = playerEntity.get<MaterialsComponent>(COMP_MATERIALS);
    if (materials && blockCount > 0) {
      materials.current = Math.min(materials.max, materials.current + blockCount);
      this.broadcast(Opcode.MaterialsUpdate, { entityId: playerEntityId, materials: materials.current });
    }

    this.world.destroyEntity(buildingEntity.id);
    this.buildingEntities.delete(data.buildingEntityId);
    this.blockColliderCache.delete(data.buildingEntityId);

    this.broadcast(Opcode.BuildingDestroyed, { buildingEntityId: data.buildingEntityId });
  }

  collectBlockColliders(): BoxCollider[] | undefined {
    if (this.blockColliderCache.size === 0) return undefined;
    const colliders: BoxCollider[] = [];
    for (const cache of this.blockColliderCache.values()) {
      for (const entry of cache.values()) {
        colliders.push({
          minX: entry.minX,
          minY: entry.minY,
          minZ: entry.minZ,
          maxX: entry.maxX,
          maxY: entry.maxY,
          maxZ: entry.maxZ,
        });
      }
    }
    return colliders.length > 0 ? colliders : undefined;
  }

  getInitialStateMessages(): BuildingInitialStateMessage[] {
    const messages: BuildingInitialStateMessage[] = [];
    for (const [buildingEntityId, buildingEntity] of this.buildingEntities) {
      const building = buildingEntity.get<BuildingComponent>(COMP_BUILDING);
      if (!building) continue;
      const blocks: Array<{ gridX: number; gridY: number; gridZ: number; colorIndex: number }> = [];
      for (let x = 0; x < building.gridSize; x++) {
        for (let y = 0; y < building.gridSize; y++) {
          for (let z = 0; z < building.gridSize; z++) {
            const index = x + y * building.gridSize + z * building.gridSize * building.gridSize;
            const voxelValue = building.voxelData[index];
            if (voxelValue !== 0) {
              blocks.push({ gridX: x, gridY: y, gridZ: z, colorIndex: voxelValue - 1 });
            }
          }
        }
      }
      messages.push({
        buildingEntityId,
        ownerEntityId: building.ownerEntityId,
        gridPositionX: building.gridPositionX,
        gridPositionY: building.gridPositionY,
        gridPositionZ: building.gridPositionZ,
        gridRotationY: building.gridRotationY,
        gridSize: building.gridSize,
        blocks,
      });
    }
    return messages;
  }

  private createBlockPhysics(buildingEntityId: number, building: BuildingComponent, gridX: number, gridY: number, gridZ: number): void {
    const key = `${buildingEntityId}_${gridX}_${gridY}_${gridZ}`;
    if (this.blockPhysics.has(key)) return;

    const halfSize = (building.gridSize * CELL_SIZE) * 0.5;
    const localX = (gridX * CELL_SIZE) - halfSize + (CELL_SIZE * 0.5);
    const localY = (gridY * CELL_SIZE) - halfSize + (CELL_SIZE * 0.5);
    const localZ = (gridZ * CELL_SIZE) - halfSize + (CELL_SIZE * 0.5);
    const cosY = Math.cos(building.gridRotationY);
    const sinY = Math.sin(building.gridRotationY);
    const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
    const worldY = building.gridPositionY + localY;
    const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);

    const colliderMesh = MeshBuilder.CreateBox(`blockCollider_${key}`, { size: CELL_SIZE }, this.scene);
    colliderMesh.position.set(worldX, worldY, worldZ);
    colliderMesh.isVisible = false;
    const aggregate = new PhysicsAggregate(colliderMesh, PhysicsShapeType.BOX, { mass: 0, restitution: 0, friction: 0.5 }, this.scene);
    this.blockPhysics.set(key, { mesh: colliderMesh, aggregate });
  }

  private removeBlockPhysics(buildingEntityId: number, gridX: number, gridY: number, gridZ: number): void {
    const key = `${buildingEntityId}_${gridX}_${gridY}_${gridZ}`;
    const physics = this.blockPhysics.get(key);
    if (physics) {
      physics.aggregate.dispose();
      physics.mesh.dispose();
      this.blockPhysics.delete(key);
    }
  }

  private getBlockColliderKey(gridX: number, gridY: number, gridZ: number): string {
    return `${gridX}_${gridY}_${gridZ}`;
  }

  private buildBlockColliderEntry(building: BuildingComponent, gridX: number, gridY: number, gridZ: number): BlockColliderEntry {
    const halfCell = CELL_SIZE * 0.5;
    const halfSize = (building.gridSize * CELL_SIZE) * 0.5;
    const localX = (gridX * CELL_SIZE) - halfSize + halfCell;
    const localY = (gridY * CELL_SIZE) - halfSize + halfCell;
    const localZ = (gridZ * CELL_SIZE) - halfSize + halfCell;
    const cosY = Math.cos(building.gridRotationY);
    const sinY = Math.sin(building.gridRotationY);
    const worldX = building.gridPositionX + (localX * cosY + localZ * sinY);
    const worldY = building.gridPositionY + localY;
    const worldZ = building.gridPositionZ + (-localX * sinY + localZ * cosY);
    return {
      gridX, gridY, gridZ,
      minX: worldX - halfCell, minY: worldY - halfCell, minZ: worldZ - halfCell,
      maxX: worldX + halfCell, maxY: worldY + halfCell, maxZ: worldZ + halfCell,
    };
  }

  private upsertBlockCollider(buildingEntityId: number, building: BuildingComponent, gridX: number, gridY: number, gridZ: number): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache) return;
    const key = this.getBlockColliderKey(gridX, gridY, gridZ);
    cache.set(key, this.buildBlockColliderEntry(building, gridX, gridY, gridZ));
  }

  private removeBlockCollider(buildingEntityId: number, gridX: number, gridY: number, gridZ: number): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache) return;
    cache.delete(this.getBlockColliderKey(gridX, gridY, gridZ));
  }

  private rebuildBlockCollidersForBuilding(buildingEntityId: number, building: BuildingComponent): void {
    const cache = this.blockColliderCache.get(buildingEntityId);
    if (!cache || cache.size === 0) return;
    for (const entry of cache.values()) {
      const updated = this.buildBlockColliderEntry(building, entry.gridX, entry.gridY, entry.gridZ);
      entry.minX = updated.minX;
      entry.minY = updated.minY;
      entry.minZ = updated.minZ;
      entry.maxX = updated.maxX;
      entry.maxY = updated.maxY;
      entry.maxZ = updated.maxZ;
    }
  }
}
