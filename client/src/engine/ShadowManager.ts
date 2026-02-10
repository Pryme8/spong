/**
 * Shadow management for the game scene (Singleton).
 * Wraps Babylon.js CascadedShadowGenerator and provides convenient methods
 * to register shadow casters and receivers.
 */

import { CascadedShadowGenerator, DirectionalLight, AbstractMesh } from '@babylonjs/core';

export class ShadowManager {
  private static instance: ShadowManager | null = null;

  private shadowGenerator: CascadedShadowGenerator;
  private light: DirectionalLight;

  private constructor(light: DirectionalLight) {
    this.light = light;

    // Create cascaded shadow generator for better shadow quality over large distances
    this.shadowGenerator = new CascadedShadowGenerator(4096, light);

    // Configure shadow quality (optimized via shadowDebug panel)
    this.shadowGenerator.numCascades = 4;
    this.shadowGenerator.stabilizeCascades = true;
    this.shadowGenerator.lambda = 0.97;
    this.shadowGenerator.filteringQuality = CascadedShadowGenerator.QUALITY_HIGH;
    this.shadowGenerator.darkness = 0.44;
    this.shadowGenerator.bias = 0.00248;
    this.shadowGenerator.normalBias = 0.0001;
    this.shadowGenerator.cascadeBlendPercentage = 0.1;
    this.shadowGenerator.depthClamp = true;
    this.shadowGenerator.filter = CascadedShadowGenerator.FILTER_PCF;
    this.shadowGenerator.contactHardeningLightSizeUVRatio = 0.1;
    this.shadowGenerator.penumbraRatio = 0.5;
    this.shadowGenerator.freezeShadowCastersBoundingInfo = false;
    this.shadowGenerator.debug = false;

    console.log('[ShadowManager] Initialized with Cascaded Shadows (4 cascades, 4096x4096)');
  }

  /**
   * Initialize the singleton instance.
   * Call this once when creating the game scene.
   */
  static initialize(light: DirectionalLight): ShadowManager {
    if (ShadowManager.instance) {
      console.warn('[ShadowManager] Already initialized, disposing previous instance');
      ShadowManager.instance.dispose();
    }
    ShadowManager.instance = new ShadowManager(light);
    return ShadowManager.instance;
  }

  /**
   * Get the singleton instance.
   * Returns null if not yet initialized.
   */
  static getInstance(): ShadowManager | null {
    return ShadowManager.instance;
  }

  /**
   * Register a mesh as a shadow caster.
   * Optionally enable self-shadowing (mesh receives its own shadows).
   */
  addShadowCaster(mesh: AbstractMesh, enableSelfShadows: boolean = true): void {
    this.shadowGenerator.addShadowCaster(mesh);
    if (enableSelfShadows) {
      // Only set receiveShadows if this is NOT an instance mesh
      // InstancedMesh inherits receiveShadows from source mesh
      if (!(mesh as any).sourceMesh) {
        mesh.receiveShadows = true;
      }
    }
  }

  /**
   * Enable shadow receiving on a mesh.
   */
  setShadowReceiver(mesh: AbstractMesh): void {
    mesh.receiveShadows = true;
  }

  /**
   * Get the shadow generator instance (for advanced configuration).
   */
  getGenerator(): CascadedShadowGenerator {
    return this.shadowGenerator;
  }

  /**
   * Cleanup shadow resources and clear singleton.
   */
  dispose(): void {
    this.shadowGenerator.dispose();
    ShadowManager.instance = null;
    console.log('[ShadowManager] Disposed');
  }
}
