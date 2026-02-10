import { ref } from 'vue';
import { Scene } from '@babylonjs/core';
import { NetworkClient } from '../network/NetworkClient';
import { LocalTransform } from '../engine/LocalTransform';
import { Opcode, TransformData, VoxelGrid, capsuleVsCapsule, PLAYER_CAPSULE_RADIUS, type RockColliderMesh, type RockTransform } from '@spong/shared';
import type { BuildingCollisionManager } from '../engine/BuildingCollisionManager';
import type { TreeColliderMesh } from '@spong/shared/dist/src/treegen/TreeMesh';
import type { TreeTransform } from '@spong/shared/dist/src/treegen/TreeMeshTransform';

export interface ColliderGetters {
  getTreeColliders?: () => Array<{ mesh: TreeColliderMesh; transform: TreeTransform }>;
  getRockColliders?: () => Array<{ mesh: RockColliderMesh; transform: RockTransform }>;
}

export function useTransformSync(networkClient: NetworkClient, scene: Scene, buildingCollisionManager?: BuildingCollisionManager, colliderGetters?: ColliderGetters) {
  const transforms = ref<Map<number, LocalTransform>>(new Map());
  let myEntityId: number | null = null;

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
      colliderGetters?.getRockColliders
    );
    transforms.value.set(entityId, transform);
    if (isLocal) myEntityId = entityId;
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
    
    // Resolve player-vs-player collisions (client-side prediction)
    // Only apply to local player to match server authority
    if (myEntityId !== null) {
      const localTransform = transforms.value.get(myEntityId);
      if (localTransform) {
        const localState = localTransform.getState();
        
        // Check against all other players
        transforms.value.forEach((otherTransform, otherId) => {
          if (otherId === myEntityId) return; // Skip self
          
          const otherPos = otherTransform.getPosition();
          
          // Check capsule collision in XZ plane
          const result = capsuleVsCapsule(
            localState.posX, localState.posZ,
            otherPos.x, otherPos.z,
            PLAYER_CAPSULE_RADIUS,
            PLAYER_CAPSULE_RADIUS
          );
          
          if (result.colliding) {
            // Push local player away (server will do the same)
            // We apply directly to the state which gets synced
            (localState as any).posX += result.pushX;
            (localState as any).posZ += result.pushZ;
            
            // Zero out velocity in collision direction
            const dx = otherPos.x - localState.posX;
            const dz = otherPos.z - localState.posZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.001) {
              const nx = dx / dist;
              const nz = dz / dist;
              
              const velDot = localState.velX * nx + localState.velZ * nz;
              if (velDot > 0) { // Moving toward other player
                (localState as any).velX -= nx * velDot;
                (localState as any).velZ -= nz * velDot;
              }
            }
          }
        });
      }
    }
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
