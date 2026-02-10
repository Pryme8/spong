/**
 * Final post-process pass for FXAA anti-aliasing and vignette effect.
 */

import { Scene, Camera, PostProcess, Effect, Vector2 } from '@babylonjs/core';

export class FinalPostProcess {
  private fxaaPass: PostProcess;
  private vignettePass: PostProcess;

  constructor(scene: Scene, camera: Camera) {
    const engine = scene.getEngine();

    // ── FXAA Pass (Anti-aliasing) ──────────────────────────
    Effect.ShadersStore['fxaaFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform vec2 screenSize;

      void main() {
        vec2 rcpFrame = 1.0 / screenSize;
        vec4 center = texture2D(textureSampler, vUV);
        
        // Sample neighbors
        vec4 rgbNW = texture2D(textureSampler, vUV + vec2(-1.0, -1.0) * rcpFrame);
        vec4 rgbNE = texture2D(textureSampler, vUV + vec2(1.0, -1.0) * rcpFrame);
        vec4 rgbSW = texture2D(textureSampler, vUV + vec2(-1.0, 1.0) * rcpFrame);
        vec4 rgbSE = texture2D(textureSampler, vUV + vec2(1.0, 1.0) * rcpFrame);
        
        // Simple FXAA-like blur on edges
        vec4 avgDiag = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
        vec4 result = mix(center, avgDiag, 0.25);
        
        gl_FragColor = result;
      }
    `;

    this.fxaaPass = new PostProcess(
      'fxaa',
      'fxaa',
      ['screenSize'],
      null,
      1.0,
      camera
    );

    this.fxaaPass.onApply = (effect) => {
      effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
    };

    // ── Vignette Pass ───────────────────────────────────────
    Effect.ShadersStore['vignetteFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float vignetteStrength;

      void main() {
        vec4 color = texture2D(textureSampler, vUV);
        
        // Calculate distance from center
        vec2 centered = vUV - 0.5;
        float dist = length(centered);
        
        // Vignette factor (0 at edges, 1 at center)
        // Pushed towards edges (0.5 start) and slightly darker
        float vignette = 1.0 - smoothstep(0.5, 1.1, dist * vignetteStrength);
        vignette = pow(vignette, 0.85); // Make edges darker
        
        // Apply vignette
        gl_FragColor = vec4(color.rgb * vignette, color.a);
      }
    `;

    this.vignettePass = new PostProcess(
      'vignette',
      'vignette',
      ['vignetteStrength'],
      null,
      1.0,
      camera
    );

    this.vignettePass.onApply = (effect) => {
      effect.setFloat('vignetteStrength', 1.3);
    };

    console.log('[FinalPostProcess] Initialized (FXAA + Vignette)');
  }

  dispose(): void {
    this.fxaaPass.dispose();
    this.vignettePass.dispose();
    console.log('[FinalPostProcess] Disposed');
  }
}
