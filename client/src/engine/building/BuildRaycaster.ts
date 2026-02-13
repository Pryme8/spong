/**
 * Handle raycasting for build mode.
 * Casts ray from camera center to find placement positions.
 */

import { Scene, Camera, Ray, Vector3, Mesh, PickingInfo } from '@babylonjs/core';

export interface RaycastHit {
  position: Vector3;
  normal: Vector3;
  mesh: Mesh;
}

export class BuildRaycaster {
  private scene: Scene;
  private camera: Camera;

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Cast ray from camera center, checking build-related meshes.
   * Only hits: placed blocks, grid raycast plane, and finalized buildings (NOT empty space)
   */
  raycastFromCamera(): RaycastHit | null {
    // Get ray from camera forward direction
    const ray = this.camera.getForwardRay();
    
    // Pick with ray, filtering for build-related meshes (no boundary cube)
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      const isValid = mesh.name.startsWith('buildBlock_') ||
                      mesh.name === 'gridRaycastPlane' ||
                      mesh.name === 'finalBuilding';
      
      // Debug logging
      if (mesh.name === 'gridRaycastPlane' && !mesh.metadata?.logged) {
        console.log('[BuildRaycaster] gridRaycastPlane found - isPickable:', mesh.isPickable, 'isVisible:', mesh.isVisible);
        mesh.metadata = { logged: true };
      }
      
      return isValid;
    });

    if (pickInfo && pickInfo.hit && pickInfo.pickedMesh && pickInfo.pickedPoint) {
      const normal = pickInfo.getNormal();
      if (!normal) {
        // If no normal, default to up
        console.warn('[BuildRaycaster] No normal found, using default up');
        return {
          position: pickInfo.pickedPoint,
          normal: new Vector3(0, 1, 0),
          mesh: pickInfo.pickedMesh as Mesh
        };
      }

      return {
        position: pickInfo.pickedPoint,
        normal: normal,
        mesh: pickInfo.pickedMesh as Mesh
      };
    }

    return null;
  }

  /**
   * Multi-pick for checking all potential targets.
   */
  multiRaycastFromCamera(): RaycastHit[] {
    const ray = this.camera.getForwardRay();
    
    const picks = this.scene.multiPickWithRay(ray, (mesh) => {
      return mesh.name.startsWith('buildBlock_') ||
             mesh.name === 'gridPlane' ||
             mesh.name === 'buildBoundary' ||
             mesh.name === 'finalBuilding';
    });

    if (!picks) return [];

    const hits: RaycastHit[] = [];
    for (const pick of picks) {
      if (pick.hit && pick.pickedMesh && pick.pickedPoint) {
        const normal = pick.getNormal();
        if (normal) {
          hits.push({
            position: pick.pickedPoint,
            normal: normal,
            mesh: pick.pickedMesh as Mesh
          });
        }
      }
    }

    return hits;
  }
}
