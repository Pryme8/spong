/**
 * Cloud post-processing pipeline using RenderTargetTexture multi-pass.
 *
 * Following the Babylon.js RTT multi-pass pattern:
 * https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/renderTargetTextureMultiPass/
 *
 * 1. **Mask RTT** – all scene meshes rendered with a flat black override material,
 *    white clear color.  Result: black = geometry, white = sky.
 *    Uses setMaterialForRendering() per mesh (set once, not per frame).
 *    Scene ambient color is set to black for the pass then restored after.
 *
 * 2. **Cloud RTT** – cloud meshes only, enabled before render, disabled after.
 *    Transparent black clear so we get real alpha.
 *
 * 3. **Composite PostProcess** – final pass that takes textureSampler (main scene),
 *    cloudSampler (cloud RTT), and maskSampler (mask RTT).
 *    Diagonal-blurs the clouds, then blends over the scene modulated by the mask.
 */

import { LAYER_HIDDEN_FROM_MAIN } from '@/engine/camera/CameraController';
import {
  Scene,
  Camera,
  RenderTargetTexture,
  DynamicTexture,
  PostProcess,
  Effect,
  AbstractMesh,
  Color3,
  Color4,
  StandardMaterial,
  Observer
} from '@babylonjs/core';

export class CloudPostProcess {
  private scene: Scene;
  private maskRT: RenderTargetTexture;
  private cloudRT: RenderTargetTexture;
  private compositePass: PostProcess;
  private cloudMeshes: AbstractMesh[] = [];
  private originalClearColor: Color4;
  private originalAmbientColor: Color3;
  private blackMat: StandardMaterial;
  private hoverMaskTexture: RenderTargetTexture | null = null;
  private hoverMaskFallback: DynamicTexture;
  private meshAddedObserver: Observer<AbstractMesh> | null = null;
  private meshRemovedObserver: Observer<AbstractMesh> | null = null;
  private overscan: number;
  private screenWidth: number;
  private screenHeight: number;
  private cloudWidth: number;
  private cloudHeight: number;

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.originalClearColor = scene.clearColor.clone();

    const engine = scene.getEngine();
    this.screenWidth = engine.getRenderWidth();
    this.screenHeight = engine.getRenderHeight();
    const size = { width: this.screenWidth, height: this.screenHeight };

    // Overscan: render cloud RT larger to avoid edge artifacts when blurring
    this.overscan = 128; // 64 pixels on each edge
    this.cloudWidth = this.screenWidth + this.overscan;
    this.cloudHeight = this.screenHeight + this.overscan;
    const cloudSize = { width: this.cloudWidth, height: this.cloudHeight };

    // Flat black unlit material for the mask pass
    this.blackMat = new StandardMaterial('_maskBlack', scene);
    this.blackMat.disableLighting = true;
    this.blackMat.emissiveColor = new Color3(0, 0, 0);
    this.blackMat.freeze();

    this.hoverMaskFallback = new DynamicTexture('hoverMaskFallback', { width: 1, height: 1 }, scene, false);
    const fallbackCtx = this.hoverMaskFallback.getContext();
    fallbackCtx.fillStyle = '#000000';
    fallbackCtx.fillRect(0, 0, 1, 1);
    this.hoverMaskFallback.update();

    // ── 1. Mask RTT ─────────────────────────────────────────
    this.maskRT = new RenderTargetTexture('maskRT', size, scene);
    this.maskRT.activeCamera = camera;
    this.originalAmbientColor = scene.ambientColor.clone();

    for (const mesh of scene.meshes) {
      this.registerMeshForMask(mesh);
    }
    this.meshAddedObserver = scene.onNewMeshAddedObservable.add((mesh) => {
      this.registerMeshForMask(mesh);
    });
    this.meshRemovedObserver = scene.onMeshRemovedObservable.add((mesh) => {
      this.unregisterMeshFromMask(mesh);
    });

    // White clear = sky; black ambient so geometry is solid black in mask
    this.maskRT.onBeforeRenderObservable.add(() => {
      if (this.maskRT.renderList) {
        this.maskRT.renderList = this.maskRT.renderList.filter(mesh => !mesh.isDisposed());
      }
      scene.clearColor = new Color4(1, 1, 1, 1);
      scene.ambientColor = new Color3(0, 0, 0);
    });
    this.maskRT.onAfterRenderObservable.add(() => {
      scene.clearColor = this.originalClearColor;
      scene.ambientColor = this.originalAmbientColor;
    });

    // ── 2. Cloud RTT ────────────────────────────────────────
    // Use larger size with overscan to avoid edge artifacts
    this.cloudRT = new RenderTargetTexture('cloudRT', cloudSize, scene);
    this.cloudRT.activeCamera = camera;

    this.cloudRT.onBeforeRenderObservable.add(() => {
      for (const m of this.cloudMeshes) m.isVisible = true;
      scene.clearColor = new Color4(0, 0, 0, 0);
    });

    this.cloudRT.onAfterRenderObservable.add(() => {
      for (const m of this.cloudMeshes) m.isVisible = false;
      scene.clearColor = this.originalClearColor;
    });

    // Both RTTs render each frame
    scene.customRenderTargets.push(this.maskRT);
    scene.customRenderTargets.push(this.cloudRT);

    // ── 3. Composite PostProcess ────────────────────────────
    Effect.ShadersStore['cloudCompositeFragmentShader'] = /* glsl */ `
      precision highp float;

      varying vec2 vUV;

      uniform sampler2D textureSampler;
      uniform sampler2D cloudSampler;
      uniform sampler2D maskSampler;
      uniform sampler2D hoverMaskSampler;
      uniform vec2 hoverMaskTexel;
      uniform float blurAmount;
      uniform float cloudAlpha;
      uniform float time;
      uniform vec2 windDirection;
      uniform vec2 cloudUVScale;
      uniform vec2 cloudUVOffset;

      // Noise function for turbulence
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Rotate a 2D vector by angle
      vec2 rotate2D(vec2 v, float a) {
        float s = sin(a);
        float c = cos(a);
        return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
      }

      void main(void) {
        vec4 sceneCol = texture2D(textureSampler, vUV);

        // Remap UV for oversized cloud texture (samples from center region)
        vec2 baseCloudUV = vUV * cloudUVScale + cloudUVOffset;

        // Sample turbulence noise with higher frequency and stronger effect
        vec2 windOffset = windDirection * time;
        float turbulence = noise((vUV * 2.0 + windOffset) * 5.0) * 2.0 - 1.0; // -1 to 1
        float turbAngle = turbulence * 2.5; // ±2.5 radians (very strong)
        
        // Add direct UV distortion from turbulence
        vec2 turbOffset = vec2(
          noise((vUV + windOffset) * 4.0) * 0.06,
          noise((vUV + windOffset + vec2(123.4, 567.8)) * 4.0) * 0.06
        );
        vec2 distortedUV = baseCloudUV + turbOffset;

        // Diagonal blur with turbulence-rotated offsets
        vec4 cSum = texture2D(cloudSampler, distortedUV) * 2.0;
        float w = 2.0;
        float o1 = blurAmount;
        float o2 = blurAmount * 2.0;
        float o3 = blurAmount * 3.0;
        float o4 = blurAmount * 4.0;
        float o5 = blurAmount * 5.0;
        float o6 = blurAmount * 6.0;

        // Ring 1 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o1,  o1), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o1,  o1), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o1, -o1), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o1, -o1), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o1,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o1,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o1), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o1), turbAngle));
        w += 8.0;

        // Ring 2 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o2,  o2), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o2,  o2), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o2, -o2), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o2, -o2), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o2,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o2,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o2), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o2), turbAngle));
        w += 8.0;

        // Ring 3 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o3,  o3), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o3,  o3), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o3, -o3), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o3, -o3), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o3,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o3,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o3), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o3), turbAngle));
        w += 8.0;

        // Ring 4 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o4,  o4), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o4,  o4), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o4, -o4), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o4, -o4), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o4,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o4,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o4), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o4), turbAngle));
        w += 8.0;

        // Ring 5 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o5,  o5), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o5,  o5), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o5, -o5), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o5, -o5), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o5,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o5,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o5), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o5), turbAngle));
        w += 8.0;

        // Ring 6 (rotated by turbulence)
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o6,  o6), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o6,  o6), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o6, -o6), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o6, -o6), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( o6,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2(-o6,  0.0), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0, o6), turbAngle));
        cSum += texture2D(cloudSampler, distortedUV + rotate2D(vec2( 0.0,-o6), turbAngle));
        w += 8.0;

        vec4 cloudCol = cSum / w;

        // Mask: white = sky, black = geometry
        float mask = texture2D(maskSampler, vUV).r;

        // Cloud alpha modulated by mask and global alpha
        float alpha = cloudCol.a * mask * cloudAlpha;
        vec3 cloudMix = mix(sceneCol.rgb, cloudCol.rgb, alpha);

        float hoverMask = 0.0;
        if (hoverMaskTexel.x > 0.0 && hoverMaskTexel.y > 0.0) {
          vec2 o = hoverMaskTexel * 1.5;
          hoverMask = texture2D(hoverMaskSampler, vUV).r * 0.4;
          hoverMask += texture2D(hoverMaskSampler, vUV + vec2( o.x, 0.0)).r * 0.15;
          hoverMask += texture2D(hoverMaskSampler, vUV + vec2(-o.x, 0.0)).r * 0.15;
          hoverMask += texture2D(hoverMaskSampler, vUV + vec2(0.0,  o.y)).r * 0.15;
          hoverMask += texture2D(hoverMaskSampler, vUV + vec2(0.0, -o.y)).r * 0.15;
        }

        vec3 hoverColor = vec3(1.0, 0.9, 0.2);
        vec3 finalCol = mix(cloudMix, hoverColor, clamp(hoverMask * 0.2, 0.0, 1.0));
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `;

    this.compositePass = new PostProcess(
      'cloudComposite',
      'cloudComposite',
      ['blurAmount', 'cloudAlpha', 'time', 'windDirection', 'cloudUVScale', 'cloudUVOffset'],
      ['cloudSampler', 'maskSampler', 'hoverMaskSampler'],
      1.0,
      camera
    );

    this.compositePass.onApply = (effect) => {
      effect.setTexture('cloudSampler', this.cloudRT);
      effect.setTexture('maskSampler', this.maskRT);
      effect.setFloat('blurAmount', 0.005);
      effect.setFloat('cloudAlpha', 0.5);
      effect.setFloat('time', performance.now() * 0.00015); // Slower, subtle animation
      effect.setFloat2('windDirection', 0.05, 0.04); // Gentle drift
      
      // UV remapping for oversized cloud texture
      const scaleX = this.screenWidth / this.cloudWidth;
      const scaleY = this.screenHeight / this.cloudHeight;
      const offsetX = (this.overscan / 2) / this.cloudWidth;
      const offsetY = (this.overscan / 2) / this.cloudHeight;
      effect.setFloat2('cloudUVScale', scaleX, scaleY);
      effect.setFloat2('cloudUVOffset', offsetX, offsetY);

      const hoverTex = this.hoverMaskTexture ?? this.hoverMaskFallback;
      effect.setTexture('hoverMaskSampler', hoverTex);
      const size = hoverTex.getSize();
      const texelX = size.width > 0 ? 1 / size.width : 0;
      const texelY = size.height > 0 ? 1 / size.height : 0;
      effect.setFloat2('hoverMaskTexel', texelX, texelY);
    };
  }

  setHoverMaskTexture(texture: RenderTargetTexture | null): void {
    this.hoverMaskTexture = texture;
  }

  /** Add a mesh to the mask RTT with the black override material. */
  private registerMeshForMask(mesh: AbstractMesh): void {
    if (this.cloudMeshes.indexOf(mesh) >= 0) return;
    if(mesh.visibility == 0 || mesh.layerMask == LAYER_HIDDEN_FROM_MAIN) return;
    this.maskRT.renderList!.push(mesh);
    this.maskRT.setMaterialForRendering(mesh, this.blackMat);
  }

  /** Remove a mesh from the mask RTT. */
  private unregisterMeshFromMask(mesh: AbstractMesh): void {
    const list = this.maskRT.renderList;
    if (list) {
      const idx = list.indexOf(mesh);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  /** Register a mesh as a cloud. Hidden immediately. */
  addCloudMesh(mesh: AbstractMesh): void {
    mesh.isVisible = false;
    this.cloudMeshes.push(mesh);

    if (!this.cloudRT.renderList) this.cloudRT.renderList = [];
    this.cloudRT.renderList.push(mesh);

    this.unregisterMeshFromMask(mesh);
  }

  /** Unregister a cloud mesh (restores visibility). */
  removeCloudMesh(mesh: AbstractMesh): void {
    const i = this.cloudMeshes.indexOf(mesh);
    if (i >= 0) this.cloudMeshes.splice(i, 1);

    const list = this.cloudRT.renderList;
    if (list) {
      const j = list.indexOf(mesh);
      if (j >= 0) list.splice(j, 1);
    }

    mesh.isVisible = true;
  }

  dispose(): void {
    for (const m of this.cloudMeshes) m.isVisible = true;
    this.cloudMeshes = [];

    if (this.meshAddedObserver) {
      this.scene.onNewMeshAddedObservable.remove(this.meshAddedObserver);
    }
    if (this.meshRemovedObserver) {
      this.scene.onMeshRemovedObservable.remove(this.meshRemovedObserver);
    }

    const crt = this.scene.customRenderTargets;
    const mi = crt.indexOf(this.maskRT);
    if (mi >= 0) crt.splice(mi, 1);
    const ci = crt.indexOf(this.cloudRT);
    if (ci >= 0) crt.splice(ci, 1);

    this.maskRT.dispose();
    this.cloudRT.dispose();
    this.compositePass.dispose();
    this.blackMat.dispose();
    this.hoverMaskFallback.dispose();
  }
}
