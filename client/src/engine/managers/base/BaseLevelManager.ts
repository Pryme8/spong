/**
 * Abstract base class for level managers that spawn procedural world objects.
 * Provides common initialization and disposal patterns.
 */

import { Scene, Mesh, TransformNode } from '@babylonjs/core';

export abstract class BaseLevelManager<TVariation, TInstance> {
  protected scene: Scene;
  protected levelSeed: string;
  readonly hasShadows = true;
  protected variations: TVariation[] = [];
  protected variationMeshes: Mesh[] = [];
  protected instanceRoots: (Mesh | TransformNode)[] = [];

  constructor(scene: Scene, levelSeed: string) {
    this.scene = scene;
    this.levelSeed = levelSeed;
  }

  /**
   * Initialize the manager by generating variations and creating base meshes.
   * Yields to browser between variations to prevent UI blocking.
   */
  async initialize(): Promise<void> {
    this.variations = this.generateVariations();
    
    for (let i = 0; i < this.variations.length; i++) {
      // Yield to browser between variations
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const mesh = this.createMeshFromVariation(this.variations[i]);
      mesh.setEnabled(false); // Base mesh is not visible
      mesh.position.y = -1000000; // Keep out of raycast range
      this.variationMeshes.push(mesh);
    }
  }

  /**
   * Generate variations based on the level seed.
   * Must be implemented by subclasses.
   */
  protected abstract generateVariations(): TVariation[];

  /**
   * Create a mesh from a variation specification.
   * Must be implemented by subclasses.
   */
  protected abstract createMeshFromVariation(variation: TVariation): Mesh;

  /**
   * Spawn instances of this object type in the world.
   * Must be implemented by subclasses.
   */
  abstract spawnInstances(instances: TInstance[]): void;

  /**
   * Dispose of all instances, variation meshes, and materials.
   */
  dispose(): void {
    for (const instance of this.instanceRoots) {
      instance.dispose();
    }
    for (const mesh of this.variationMeshes) {
      mesh.dispose();
    }
    this.instanceRoots = [];
    this.variationMeshes = [];
    this.variations = [];
  }
}
