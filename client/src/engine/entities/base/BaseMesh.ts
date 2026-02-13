/**
 * Abstract base class for all mesh creators.
 * Provides common functionality for mesh creation, disposal, and shadow management.
 */

import { Scene, TransformNode, AbstractMesh } from '@babylonjs/core';
import { MeshPrimitives } from '../../rendering/primitives/MeshPrimitives';
import { ShadowManager } from '../../systems/ShadowManager';

export interface MeshOptions {
  hasShadows?: boolean;
}

export abstract class BaseMesh {
  protected root: TransformNode;
  protected primitives: MeshPrimitives;
  protected childMeshes: AbstractMesh[] = [];
  protected scene: Scene;
  
  constructor(
    name: string,
    scene: Scene,
    options?: MeshOptions,
    rootSuffix = '_root'
  ) {
    this.scene = scene;
    this.root = new TransformNode(`${name}${rootSuffix}`, scene);
    this.primitives = MeshPrimitives.getInstance();
  }
  
  /**
   * Build the geometry for this mesh.
   * Must be implemented by subclasses.
   */
  abstract buildGeometry(): void;
  
  /**
   * Register child meshes as shadow casters.
   */
  protected registerShadows(hasShadows: boolean, selfShadowing = true): void {
    if (!hasShadows) return;
    const sm = ShadowManager.getInstance();
    if (sm) {
      this.childMeshes.forEach(m => sm.addShadowCaster(m, selfShadowing));
    }
  }
  
  /**
   * Get the root transform node.
   */
  getRoot(): TransformNode {
    return this.root;
  }
  
  /**
   * Dispose of all child meshes and the root node.
   */
  dispose(): void {
    this.childMeshes.forEach(m => m.dispose());
    this.root.dispose();
  }
}
