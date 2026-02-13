import { ref } from 'vue';
import { Scene } from '@babylonjs/core';
import { NetworkClient } from '../network/NetworkClient';
import { LocalTransform } from '../engine/core/LocalTransform';
import { Opcode, TransformData, VoxelGrid, type RockColliderMesh, type RockTransform, type WaterLevelProvider } from '@spong/shared';
import type { BuildingCollisionManager } from '../engine/building/BuildingCollisionManager';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';

export interface ColliderGetters {
  getTreeColliders?: () => Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  getRockColliders?: () => Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
}

export function useTransformSync(
  networkClient: NetworkClient, 
  scene: Scene, 
  buildingCollisionManager?: BuildingCollisionManager, 
  colliderGetters?: ColliderGetters, 
  octreeGetter?: () => any,
  waterLevelProviderGetter?: () => WaterLevelProvider | undefined
) {
  const transforms = ref<Map<number, LocalTransform>>(new Map());

  // Handle transform updates from server
  networkClient.onHighFrequency(Opcode.TransformUpdate, (data: TransformData) => {
    const transform = transforms.value.get(data.entityId);
    if (transform) {
      transform.applyServerState(data);
    }
  });

  const createTransform = (entityId: number, isLocal: boolean, voxelGrid?: VoxelGrid): LocalTransform => {
    const transform = new LocalTransform(
      entityId, scene, isLocal, voxelGrid, buildingCollisionManager,
      colliderGetters?.getTreeColliders,
      colliderGetters?.getRockColliders,
      octreeGetter,
      waterLevelProviderGetter
    );
    transforms.value.set(entityId, transform);
    console.log(`Created LocalTransform for entity ${entityId} (local=${isLocal})`);
    return transform;
  };

  const getTransform = (entityId: number): LocalTransform | undefined => {
    return transforms.value.get(entityId);
  };

  const removeTransform = (entityId: number) => {
    const transform = transforms.value.get(entityId);
    if (transform) {
      transform.dispose();
      transforms.value.delete(entityId);
      console.log(`Removed LocalTransform for entity ${entityId}`);
    }
  };
  
  const updateAll = (deltaTime: number, physicsAlpha: number = 0) => {
    transforms.value.forEach(transform => {
      transform.update(deltaTime, physicsAlpha);
    });
  };
  
  const fixedUpdateAll = (fixedDt: number) => {
    // Step all transforms (only local player actually steps physics)
    transforms.value.forEach(transform => {
      transform.fixedUpdate(fixedDt);
    });
    // NOTE: Player-vs-player collision is handled server-side only.
    // Client-side PvP prediction used stale interpolated positions,
    // causing constant desync and rubber-banding. The server resolves
    // PvP overlap authoritatively and corrections are absorbed via
    // the error offset in LocalTransform.
  };

  const getAllTransforms = (): Map<number, LocalTransform> => {
    return transforms.value;
  };

  const cleanup = () => {
    transforms.value.forEach(transform => transform.dispose());
    transforms.value.clear();
  };

  return {
    transforms,
    createTransform,
    getTransform,
    removeTransform,
    getAllTransforms,
    updateAll,
    fixedUpdateAll,
    cleanup
  };
}
