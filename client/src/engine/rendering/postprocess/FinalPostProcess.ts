/**
 * Final post-process pass with comprehensive effects:
 * 1. Color Grading + ACES Tonemapping
 * 2. Pencil Outlines + Hatching (depth/normal)
 * 3. Chromatic Aberration + Sharpening
 * 4. FXAA anti-aliasing
 * 5. Vignette (with health effects)
 * 6. Film Grain
 */

import {
  Scene,
  Camera,
  PostProcess,
  Effect,
  Vector2,
  DepthRenderer,
  GeometryBufferRenderer
} from '@babylonjs/core';

export class FinalPostProcess {
  private colorGradingPass: PostProcess;
  private pencilPass: PostProcess;
  private chromaticAberrationPass: PostProcess;
  private fxaaPass: PostProcess;
  private vignettePass: PostProcess;
  private grainPass: PostProcess;
  private depthRenderer: DepthRenderer | null = null;
  private geometryBuffer: GeometryBufferRenderer | null = null;
  private normalTextureIndex: number = -1;
  private healthPercentage: number = 1.0; // 0 to 1
  private time: number = 0;
  
  // Exposed parameters for tweaking
  public exposure: number = 1.05;
  public contrast: number = 1.1;
  public saturation: number = 1.5;
  public chromaticAberrationStrength: number = 3.1;
  public sharpenStrength: number = 0.29;
  public grainIntensity: number = 0.03;
  public pencilEnabled: boolean = false;
  public pencilEdgeStrength: number = 1.2;
  public pencilDepthWeight: number = 0.7;
  public pencilNormalWeight: number = 0.9;
  public pencilEdgeThreshold: number = 0.12;
  public pencilHatchIntensity: number = 0.35;
  public pencilHatchScale: number = 1.4;
  public pencilPaperIntensity: number = 0.08;

  constructor(scene: Scene, camera: Camera) {
    const engine = scene.getEngine();

    this.depthRenderer = scene.enableDepthRenderer(camera);
    this.geometryBuffer = scene.enableGeometryBufferRenderer();
    if (this.geometryBuffer) {
      this.geometryBuffer.enableNormal = true;
      this.normalTextureIndex = this.geometryBuffer.getTextureIndex(GeometryBufferRenderer.NORMAL_TEXTURE_TYPE);
    }

    // ── Pass 1: Color Grading + ACES Tonemapping ───────────
    Effect.ShadersStore['colorGradingFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float exposure;
      uniform float contrast;
      uniform float saturation;

      // ACES Filmic Tonemapping
      vec3 ACESFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      void main() {
        vec4 color = texture2D(textureSampler, vUV);
        
        // Apply exposure (on HDR values before tonemapping)
        color.rgb *= exposure;
        
        // Apply ACES tonemapping (HDR to LDR)
        color.rgb = ACESFilm(color.rgb);
        
        // Apply contrast
        color.rgb = (color.rgb - 0.5) * contrast + 0.5;
        color.rgb = clamp(color.rgb, 0.0, 1.0);
        
        // Apply saturation
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, saturation);
        
        gl_FragColor = color;
      }
    `;

    this.colorGradingPass = new PostProcess(
      'colorGrading',
      'colorGrading',
      ['exposure', 'contrast', 'saturation'],
      null,
      1.0,
      camera
    );

    this.colorGradingPass.onApply = (effect) => {
      effect.setFloat('exposure', this.exposure);
      effect.setFloat('contrast', this.contrast);
      effect.setFloat('saturation', this.saturation);
    };

    // ── Pass 2: Pencil Outlines + Hatching (Depth/Normal) ─
    Effect.ShadersStore['pencilFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D depthSampler;
      uniform sampler2D normalSampler;
      uniform vec2 screenSize;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform float edgeStrength;
      uniform float depthWeight;
      uniform float normalWeight;
      uniform float edgeThreshold;
      uniform float hatchIntensity;
      uniform float hatchScale;
      uniform float paperIntensity;
      uniform float pencilEnabled;

      float linearizeDepth(float depth) {
        return (2.0 * cameraNear) / (cameraFar + cameraNear - depth * (cameraFar - cameraNear));
      }

      float luminance(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      float edgeDepth(vec2 uv, vec2 texel) {
        float center = linearizeDepth(texture2D(depthSampler, uv).r);
        float dx = abs(center - linearizeDepth(texture2D(depthSampler, uv + vec2(texel.x, 0.0)).r))
                 + abs(center - linearizeDepth(texture2D(depthSampler, uv - vec2(texel.x, 0.0)).r));
        float dy = abs(center - linearizeDepth(texture2D(depthSampler, uv + vec2(0.0, texel.y)).r))
                 + abs(center - linearizeDepth(texture2D(depthSampler, uv - vec2(0.0, texel.y)).r));
        return dx + dy;
      }

      float edgeNormal(vec2 uv, vec2 texel) {
        vec3 center = texture2D(normalSampler, uv).xyz * 2.0 - 1.0;
        vec3 nx = texture2D(normalSampler, uv + vec2(texel.x, 0.0)).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(normalSampler, uv + vec2(0.0, texel.y)).xyz * 2.0 - 1.0;
        float dx = length(center - nx);
        float dy = length(center - ny);
        return dx + dy;
      }

      float hatchLine(vec2 uv, float angle, float scale) {
        vec2 dir = vec2(cos(angle), sin(angle));
        float v = sin(dot(uv * scale, dir) * 6.28318);
        return smoothstep(-0.2, 0.2, v);
      }

      float paperNoise(vec2 uv) {
        return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec4 baseColor = texture2D(textureSampler, vUV);
        if (pencilEnabled < 0.5) {
          gl_FragColor = baseColor;
          return;
        }

        vec2 texel = 1.0 / screenSize;
        float depthEdge = edgeDepth(vUV, texel) * depthWeight;
        float normalEdge = edgeNormal(vUV, texel) * normalWeight;
        float edge = depthEdge + normalEdge;
        edge = smoothstep(edgeThreshold, edgeThreshold + 0.2, edge) * edgeStrength;

        float luma = luminance(baseColor.rgb);
        float hatch = 0.0;

        if (luma < 0.75) {
          hatch += hatchLine(vUV, 0.785398, hatchScale * 80.0);
        }
        if (luma < 0.5) {
          hatch += hatchLine(vUV, 2.35619, hatchScale * 80.0);
        }
        if (luma < 0.3) {
          hatch += hatchLine(vUV, 0.0, hatchScale * 60.0);
        }

        hatch = clamp(hatch * 0.5, 0.0, 1.0);
        float shade = 1.0 - hatch * hatchIntensity;

        vec3 color = baseColor.rgb * shade;
        color -= edge;

        float noise = paperNoise(vUV * screenSize) - 0.5;
        color += noise * paperIntensity;

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), baseColor.a);
      }
    `;

    this.pencilPass = new PostProcess(
      'pencil',
      'pencil',
      [
        'screenSize',
        'cameraNear',
        'cameraFar',
        'edgeStrength',
        'depthWeight',
        'normalWeight',
        'edgeThreshold',
        'hatchIntensity',
        'hatchScale',
        'paperIntensity',
        'pencilEnabled'
      ],
      ['depthSampler', 'normalSampler'],
      1.0,
      camera
    );

    this.pencilPass.onApply = (effect) => {
      effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
      effect.setFloat('cameraNear', camera.minZ);
      effect.setFloat('cameraFar', camera.maxZ);
      effect.setFloat('edgeStrength', this.pencilEdgeStrength);
      effect.setFloat('depthWeight', this.pencilDepthWeight);
      effect.setFloat('normalWeight', this.pencilNormalWeight);
      effect.setFloat('edgeThreshold', this.pencilEdgeThreshold);
      effect.setFloat('hatchIntensity', this.pencilHatchIntensity);
      effect.setFloat('hatchScale', this.pencilHatchScale);
      effect.setFloat('paperIntensity', this.pencilPaperIntensity);

      const pencilReady = !!this.depthRenderer && !!this.geometryBuffer && this.normalTextureIndex >= 0;
      effect.setFloat('pencilEnabled', pencilReady && this.pencilEnabled ? 1.0 : 0.0);

      if (pencilReady && this.depthRenderer) {
        effect.setTexture('depthSampler', this.depthRenderer.getDepthMap());
      }

      if (pencilReady && this.geometryBuffer) {
        const textures = this.geometryBuffer.getGBuffer().textures;
        effect.setTexture('normalSampler', textures[this.normalTextureIndex]);
      }
    };

    // ── Pass 3: Chromatic Aberration + Sharpening ──────────
    Effect.ShadersStore['chromaticAberrationFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform vec2 screenSize;
      uniform float aberrationStrength;
      uniform float sharpenStrength;

      void main() {
        vec2 screenCenter = vec2(0.5, 0.5);
        vec2 dir = vUV - screenCenter;
        float dist = length(dir);
        
        // Chromatic aberration - color channel separation
        vec2 offset = normalize(dir) * aberrationStrength * dist * dist * 0.001;
        float r = texture2D(textureSampler, vUV - offset).r;
        float g = texture2D(textureSampler, vUV).g;
        float b = texture2D(textureSampler, vUV + offset).b;
        vec4 color = vec4(r, g, b, 1.0);
        
        // Sharpening - enhance edges
        vec2 step = 1.0 / screenSize;
        vec4 center = texture2D(textureSampler, vUV);
        vec4 top = texture2D(textureSampler, vUV + vec2(0.0, -step.y));
        vec4 bottom = texture2D(textureSampler, vUV + vec2(0.0, step.y));
        vec4 left = texture2D(textureSampler, vUV + vec2(-step.x, 0.0));
        vec4 right = texture2D(textureSampler, vUV + vec2(step.x, 0.0));
        
        vec4 edges = (4.0 * center - top - bottom - left - right);
        color = color + edges * sharpenStrength;
        
        gl_FragColor = clamp(color, 0.0, 1.0);
      }
    `;

    this.chromaticAberrationPass = new PostProcess(
      'chromaticAberration',
      'chromaticAberration',
      ['screenSize', 'aberrationStrength', 'sharpenStrength'],
      null,
      1.0,
      camera
    );

    this.chromaticAberrationPass.onApply = (effect) => {
      effect.setFloat2('screenSize', engine.getRenderWidth(), engine.getRenderHeight());
      effect.setFloat('aberrationStrength', this.chromaticAberrationStrength);
      effect.setFloat('sharpenStrength', this.sharpenStrength);
    };

    // ── Pass 4: FXAA (Anti-aliasing) ───────────────────────
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

    // ── Pass 5: Vignette with Low Health Effects ───────────
    Effect.ShadersStore['vignetteFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float vignetteStrength;
      uniform float healthPercentage;

      void main() {
        vec4 color = texture2D(textureSampler, vUV);
        
        // Calculate distance from center
        vec2 centered = vUV - 0.5;
        float dist = length(centered);
        
        // Base vignette factor (0 at edges, 1 at center)
        float vignette = 1.0 - smoothstep(0.5, 1.1, dist * vignetteStrength);
        vignette = pow(vignette, 0.85); // Make edges darker
        
        // Low health effects (under 50% health)
        if (healthPercentage < 0.5) {
          // Calculate low health intensity (0 at 50%, 1 at 0%)
          float lowHealthIntensity = 1.0 - (healthPercentage * 2.0);
          
          // Red tint increases as health decreases
          float redTint = lowHealthIntensity * 0.5;
          color.rgb += vec3(redTint, 0.0, 0.0);
          
          // Create aggressive low health vignette
          // At 0% health this should make edges nearly black
          float edgeDarkness = smoothstep(0.15, 0.65, dist) * lowHealthIntensity;
          vignette = vignette * (1.0 - edgeDarkness * 0.95);
        }
        
        // Apply vignette
        gl_FragColor = vec4(color.rgb * vignette, color.a);
      }
    `;

    this.vignettePass = new PostProcess(
      'vignette',
      'vignette',
      ['vignetteStrength', 'healthPercentage'],
      null,
      1.0,
      camera
    );

    this.vignettePass.onApply = (effect) => {
      effect.setFloat('vignetteStrength', 1.3);
      effect.setFloat('healthPercentage', this.healthPercentage);
    };

    // ── Pass 6: Film Grain ─────────────────────────────────
    Effect.ShadersStore['grainFragmentShader'] = /* glsl */ `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float time;
      uniform float grainIntensity;

      // Pseudo-random noise function
      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec4 color = texture2D(textureSampler, vUV);
        
        // Animated grain based on UV and time
        float grain = rand(vUV * time) * 2.0 - 1.0;
        
        // Apply grain (subtle overlay)
        color.rgb += grain * grainIntensity;
        
        gl_FragColor = clamp(color, 0.0, 1.0);
      }
    `;

    this.grainPass = new PostProcess(
      'grain',
      'grain',
      ['time', 'grainIntensity'],
      null,
      1.0,
      camera
    );

    this.grainPass.onApply = (effect) => {
      effect.setFloat('time', this.time);
      effect.setFloat('grainIntensity', this.grainIntensity);
    };

    console.log('[FinalPostProcess] Initialized (Color Grading + Tonemapping + Pencil + Chromatic Aberration + Sharpening + FXAA + Vignette + Grain)');
    
    // Animate grain over time
    scene.onBeforeRenderObservable.add(() => {
      this.time += 0.01;
    });
  }

  /**
   * Update health percentage for low health visual effects.
   * @param healthPercentage - 0 to 1 (0 = dead, 1 = full health)
   */
  setHealthPercentage(healthPercentage: number): void {
    this.healthPercentage = Math.max(0, Math.min(1, healthPercentage));
  }

  /**
   * Set exposure value (brightness adjustment before tonemapping).
   * @param value - Typical range: 0.5 to 2.0, default 1.0
   */
  setExposure(value: number): void {
    this.exposure = Math.max(0.1, Math.min(3.0, value));
  }

  /**
   * Set contrast value.
   * @param value - Typical range: 0.8 to 1.5, default 1.05
   */
  setContrast(value: number): void {
    this.contrast = Math.max(0.5, Math.min(2.0, value));
  }

  /**
   * Set saturation value.
   * @param value - Typical range: 0.5 to 1.5, default 1.0 (1.0 = normal, 0.0 = grayscale)
   */
  setSaturation(value: number): void {
    this.saturation = Math.max(0.0, Math.min(2.0, value));
  }

  /**
   * Set chromatic aberration strength.
   * @param value - Typical range: 0.5 to 3.0, default 1.5
   */
  setChromaticAberration(value: number): void {
    this.chromaticAberrationStrength = Math.max(0.0, Math.min(10.0, value));
  }

  /**
   * Set sharpening strength.
   * @param value - Typical range: 0.0 to 0.5, default 0.2
   */
  setSharpening(value: number): void {
    this.sharpenStrength = Math.max(0.0, Math.min(1.0, value));
  }

  /**
   * Set grain intensity.
   * @param value - Typical range: 0.01 to 0.05, default 0.025
   */
  setGrainIntensity(value: number): void {
    this.grainIntensity = Math.max(0.0, Math.min(0.2, value));
  }

  /**
   * Enable or disable pencil effect.
   */
  setPencilEnabled(value: boolean): void {
    this.pencilEnabled = value;
  }

  /**
   * Set pencil edge strength.
   */
  setPencilEdgeStrength(value: number): void {
    this.pencilEdgeStrength = Math.max(0.0, Math.min(5.0, value));
  }

  /**
   * Set pencil depth edge weight.
   */
  setPencilDepthWeight(value: number): void {
    this.pencilDepthWeight = Math.max(0.0, Math.min(2.0, value));
  }

  /**
   * Set pencil normal edge weight.
   */
  setPencilNormalWeight(value: number): void {
    this.pencilNormalWeight = Math.max(0.0, Math.min(2.0, value));
  }

  /**
   * Set pencil edge threshold.
   */
  setPencilEdgeThreshold(value: number): void {
    this.pencilEdgeThreshold = Math.max(0.0, Math.min(1.0, value));
  }

  /**
   * Set pencil hatch intensity.
   */
  setPencilHatchIntensity(value: number): void {
    this.pencilHatchIntensity = Math.max(0.0, Math.min(1.0, value));
  }

  /**
   * Set pencil hatch scale.
   */
  setPencilHatchScale(value: number): void {
    this.pencilHatchScale = Math.max(0.1, Math.min(5.0, value));
  }

  /**
   * Set pencil paper intensity.
   */
  setPencilPaperIntensity(value: number): void {
    this.pencilPaperIntensity = Math.max(0.0, Math.min(0.5, value));
  }

  dispose(): void {
    this.colorGradingPass.dispose();
    this.pencilPass.dispose();
    this.chromaticAberrationPass.dispose();
    this.fxaaPass.dispose();
    this.vignettePass.dispose();
    this.grainPass.dispose();
    console.log('[FinalPostProcess] Disposed');
  }
}
