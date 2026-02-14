import { AbstractMesh, Camera, Color3, Color4, InstancedMesh, RenderTargetTexture, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials';

export class ItemHoverMask {
  private scene: Scene;
  private maskRT: RenderTargetTexture;
  private whiteMat: CustomMaterial;
  private currentRoot: TransformNode | null = null;

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;

    const engine = scene.getEngine();
    const width = Math.max(1, Math.floor(engine.getRenderWidth() / 4));
    const height = Math.max(1, Math.floor(engine.getRenderHeight() / 4));

    this.whiteMat = new CustomMaterial('_itemHoverWhite', scene);
    this.whiteMat.Fragment_Before_FragColor(`
        color.rgb = vec3(1.0);
        color.a = 1.0;    
    `)
    this.whiteMat.freeze();

    this.maskRT = new RenderTargetTexture('itemHoverMaskRT', { width, height }, scene);
    this.maskRT.activeCamera = camera;
    this.maskRT.clearColor = new Color4(0, 0, 0, 1);
    this.maskRT.renderParticles = false;

    scene.customRenderTargets.push(this.maskRT);
  }

  getTexture(): RenderTargetTexture {
    return this.maskRT;
  }

  setHoveredMesh(mesh: AbstractMesh | null): void {
    const root = (mesh?.parent as TransformNode | null) ?? (mesh as TransformNode | null);
    if (root === this.currentRoot) return;
    this.currentRoot = root;

    if (!mesh || !root) {
      this.maskRT.renderList = [];
      return;
    }

    const meshes = root.getChildMeshes<InstancedMesh>(true);
    this.maskRT.renderList = meshes;
    for (const entry of meshes) {
      const source = entry?.sourceMesh;
      this.maskRT.setMaterialForRendering(source ?? entry, this.whiteMat);
    }
  }

  dispose(): void {
    const targets = this.scene.customRenderTargets;
    const index = targets.indexOf(this.maskRT);
    if (index !== -1) {
      targets.splice(index, 1);
    }
    this.maskRT.dispose();
    this.whiteMat.dispose();
  }
}
