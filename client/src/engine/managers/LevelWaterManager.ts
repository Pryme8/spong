/**
 * Level water manager - creates a water plane with dynamic height texture.
 * The texture represents terrain heights as grayscale values.
 */

import { Scene, Mesh, MeshBuilder, DynamicTexture, Color3, MirrorTexture, Plane, AbstractMesh, TransformNode } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom';
import { VoxelGrid, GRID_WIDTH, GRID_DEPTH, VOXEL_WIDTH, VOXEL_HEIGHT, VOXEL_DEPTH, LEVEL_OFFSET_X, LEVEL_OFFSET_Y, LEVEL_OFFSET_Z } from '@spong/shared';
import { World } from '../core/World';

const WATER_LEVEL_Y = -14;

// Tweakable params (persisted every frame)
export interface WaterParams {
  pFreq1: number;
  pSpeed1: number;
  pFreq2: number;
  pSpeed2: number;
  pMix: number;
  shoreFade: number;
  pStr: number;
  flowSpeed: number;
  noiseScale: number;
  cellScale: number;
  cellStrength: number;
}

const DEFAULT_PARAMS: WaterParams = {
  pFreq1: 1.1,
  pSpeed1: 1.6,
  pFreq2: 3.5,
  pSpeed2: 1.8,
  pMix: 0.6,
  shoreFade: 6.0,
  pStr: 0.85,
  flowSpeed: 0.5,
  noiseScale: 0.1,
  cellScale: 0.5,
  cellStrength: 0.5
};

export class LevelWaterManager {
  private static instance: LevelWaterManager | null = null;

  private scene: Scene;
  private voxelGrid: VoxelGrid | null = null;
  private waterPlane: Mesh | null = null;
  private heightTexture: DynamicTexture | null = null;
  private flowTexture: DynamicTexture | null = null;
  private waterMaterial: CustomMaterial | null = null;
  private mirrorTexture: MirrorTexture | null = null;
  params: WaterParams = { ...DEFAULT_PARAMS };

  constructor(scene: Scene) {
    this.scene = scene;
    LevelWaterManager.instance = this;
  }

  static getInstance(): LevelWaterManager | null {
    return LevelWaterManager.instance;
  }

  getHeightTexture(): DynamicTexture | null {
    return this.heightTexture;
  }

  getMaterial(): CustomMaterial | null {
    return this.waterMaterial;
  }

  getMesh(): Mesh | null {
    return this.waterPlane;
  }

  setSamplingMode(mode: number): void {
    if (this.heightTexture) {
      this.heightTexture.updateSamplingMode(mode);
      console.log(`[WaterManager] Sampling mode set to ${mode}`);
    }
  }

  async initialize(voxelGrid: VoxelGrid): Promise<void> {
    this.voxelGrid = voxelGrid;

    // Create textures
    this.createHeightTexture();
    this.createFlowTexture();

    // Update textures with terrain data
    this.updateHeightTexture();

    // Create the water material (uses the textures)
    this.createWaterMaterial();

    // Create the water plane and apply the material
    this.createWaterPlane();
    if (this.waterPlane && this.waterMaterial) {
      this.waterPlane.material = this.waterMaterial;
    }

    // Create mirror reflection
    this.createMirrorReflection();

    console.log('[WaterManager] Initialized water plane at Y =', WATER_LEVEL_Y);
  }

  /** Return true if mesh (or its root ancestor) is an item pickup - exclude from reflection. */
  private static isItemMesh(mesh: AbstractMesh): boolean {
    let n: TransformNode | null = mesh as TransformNode;
    while (n) {
      const name = n.name || '';
      if (name.startsWith('item_') || name === 'tossingItem') return true;
      n = n.parent;
    }
    return false;
  }

  /** Collect all meshes that should be reflected: sky, terrain, trees, bushes, rocks, players. Excludes water plane and item pickups. */
  private getReflectionMeshes(): AbstractMesh[] {
    const list: AbstractMesh[] = [];
    const waterPlane = this.waterPlane;

    const add = (mesh: AbstractMesh) => {
      if (mesh === waterPlane || !mesh.isEnabled() || !mesh.isVisible) return;
      if (LevelWaterManager.isItemMesh(mesh)) return;
      list.push(mesh);
    };

    for (const mesh of this.scene.meshes) {
      add(mesh);
    }
    for (const root of this.scene.rootNodes) {
      for (const child of root.getChildMeshes(false)) {
        add(child);
      }
    }
    return list;
  }

  private createMirrorReflection(): void {
    if (!this.scene || !this.waterMaterial) return;

    // Create mirror texture (512x512 resolution for softer, blurred look)
    this.mirrorTexture = new MirrorTexture('waterMirror', 512, this.scene, true);

    // Set mirror plane at visual water plane position (offset down by 0.1)
    // Plane equation: normal.dot(point) + d = 0
    // For Y = WATER_LEVEL_Y - 0.1 with upward normal (0,-1,0): -y + d = 0
    // d = y = WATER_LEVEL_Y - 0.1
    const visualWaterY = WATER_LEVEL_Y - 0.1;
    this.mirrorTexture.mirrorPlane = new Plane(0, -1.0, 0, visualWaterY);

    this.mirrorTexture.renderList = this.getReflectionMeshes();

    // Set reflection level (lower = less strong) and bind to material
    this.mirrorTexture.level = 0.15;
    this.waterMaterial.reflectionTexture = this.mirrorTexture;

    console.log(`[WaterManager] Mirror reflection created with ${this.mirrorTexture.renderList.length} meshes`);
    
    // Update render list after a frame to catch late-loaded meshes
    setTimeout(() => {
      this.refreshMirrorRenderList();
    }, 100);
  }

  private createWaterPlane(): void {
    if (!this.voxelGrid) return;

    // Calculate plane size based on grid dimensions
    const planeWidth = GRID_WIDTH * VOXEL_WIDTH;
    const planeDepth = GRID_DEPTH * VOXEL_DEPTH;

    // Create a plane facing up (normal = +Y)
    this.waterPlane = MeshBuilder.CreatePlane('waterPlane', {
      width: planeWidth,
      height: planeDepth,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);

    // Rotate to face up and position at water level (visual offset down by 0.1)
    this.waterPlane.rotation.x = Math.PI * 0.5;
    this.waterPlane.position.set(
      LEVEL_OFFSET_X + planeWidth * 0.5,
      WATER_LEVEL_Y - 0.1,
      LEVEL_OFFSET_Z + planeDepth * 0.5
    );

    // Don't block collisions or picking
    this.waterPlane.checkCollisions = false;
    this.waterPlane.isPickable = false;
  }

  private createWaterMaterial(): void {
    this.waterMaterial = new CustomMaterial('waterMaterial', this.scene);

    // Base water material (blue, transparent)
    this.waterMaterial.diffuseColor = new Color3(0.1, 0.3, 0.6);
    this.waterMaterial.specularColor = new Color3(0.5, 0.5, 0.5);
    this.waterMaterial.emissiveColor = new Color3(0, 0, 0);
    this.waterMaterial.alpha = 0.7;
    this.waterMaterial.backFaceCulling = false;
    this.waterMaterial.needDepthPrePass = true;

    // Add custom uniforms
    if (this.heightTexture && this.flowTexture) {
      this.waterMaterial.AddUniform('heightMap', 'sampler2D', this.heightTexture);
      this.waterMaterial.AddUniform('flowMap', 'sampler2D', this.flowTexture);
      this.waterMaterial.AddUniform('wLevel', 'float', WATER_LEVEL_Y);
      this.waterMaterial.AddUniform('gWidth', 'float', GRID_WIDTH);
      this.waterMaterial.AddUniform('gDepth', 'float', GRID_DEPTH);
      this.waterMaterial.AddUniform('vHeight', 'float', VOXEL_HEIGHT);
      this.waterMaterial.AddUniform('oY', 'float', LEVEL_OFFSET_Y);
      this.waterMaterial.AddUniform('vW', 'float', VOXEL_WIDTH);
      this.waterMaterial.AddUniform('vD', 'float', VOXEL_DEPTH);
      this.waterMaterial.AddUniform('oX', 'float', LEVEL_OFFSET_X);
      this.waterMaterial.AddUniform('oZ', 'float', LEVEL_OFFSET_Z);
      this.waterMaterial.AddUniform('wTime', 'float', 0);

      // Tweakable wave uniforms
      this.waterMaterial.AddUniform('pFreq1', 'float', 1.1);
      this.waterMaterial.AddUniform('pSpeed1', 'float', 1.6);
      this.waterMaterial.AddUniform('pFreq2', 'float', 3.5);
      this.waterMaterial.AddUniform('pSpeed2', 'float', 1.8);
      this.waterMaterial.AddUniform('pMix', 'float', 0.6);
      const world = World.getInstance();
      this.waterMaterial.AddUniform('pStr', 'float', 0.85);
      this.waterMaterial.AddUniform('flowSpeed', 'float', 0.5);
      this.waterMaterial.AddUniform('noiseScale', 'float', 0.1);
      this.waterMaterial.AddUniform('windDir', 'vec2', [world.wind.directionX, world.wind.directionZ]);
      this.waterMaterial.AddUniform('windSpeed', 'float', world.wind.speed);
      this.waterMaterial.AddUniform('cellScale', 'float', 0.5);
      this.waterMaterial.AddUniform('cellStrength', 'float', 0.5);
    }

    // Vertex shader: pass world position to fragment via custom varying
    this.waterMaterial.Vertex_Definitions(`
      varying vec3 vWorldPosWater;
    `);

    this.waterMaterial.Vertex_After_WorldPosComputed(`
      vWorldPosWater = worldPos.xyz;
    `);

    // Fragment shader definitions
    this.waterMaterial.Fragment_Definitions(`
      varying vec3 vWorldPosWater;

      // Convert world XZ to UV in height texture
      vec2 toHeightUV(vec3 wp) {
        float pw = gWidth * vW;
        float pd = gDepth * vD;
        return vec2((wp.x - oX) / pw, 1.0 - (wp.z - oZ) / pd);
      }

      // Rotate 2D vector by angle (radians)
      vec2 rotate2D(vec2 v, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
      }

      // Hash functions
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      float hash1(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // 2D noise
      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash1(i);
        float b = hash1(i + vec2(1.0, 0.0));
        float c = hash1(i + vec2(0.0, 1.0));
        float d = hash1(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Voronoi cellular noise (returns distance to nearest cell point)
      float voronoi(vec2 p) {
        vec2 cell = floor(p);
        vec2 frac = fract(p);
        
        float minDist = 2.0;
        
        // Check 3x3 neighborhood
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(cell + neighbor);
            vec2 diff = neighbor + point - frac;
            float dist = length(diff);
            minDist = min(minDist, dist);
          }
        }
        
        return minDist;
      }
    `);


    // Add white waves on top of base diffuse
    this.waterMaterial.Fragment_Before_FragColor(`
      vec3 wp = vWorldPosWater;

      // === Sample water mask for separation ===
      vec2 huv = toHeightUV(wp);
      float waterMask = texture2D(heightMap, huv).r;
      float distToShore = 1.0 - waterMask;

      // Normalize wind direction (needed for both wave types)
      vec2 windNorm = normalize(windDir);

      // === Shore waves: radiate from shoreline with wind influence ===
      
      // Sample noise for organic variation
      vec2 noiseOffset = -windDir * wTime * windSpeed * 0.25;
      vec2 noiseUV = wp.xz * cellScale * 0.5 + noiseOffset;
      float n = noise2D(noiseUV);
      
      // Add wind influence to shore distance
      // Offset position slightly in wind direction before computing distance
      float windInfluence = dot(wp.xz, windNorm) * windSpeed * 0.15;
      float distorted = distToShore + n * 0.05 + windInfluence;
      
      // Create ring waves radiating from shore
      float sw1 = sin(distorted * pFreq1 * 30.0 - wTime * pSpeed1) * 0.5 + 0.5;
      float sw2 = sin(distorted * pFreq2 * 20.0 - wTime * pSpeed2 + 1.5) * 0.5 + 0.5;
      float sw3 = sin(distorted * 40.0 + wTime * 1.5 + n * 3.0) * 0.5 + 0.5;
      
      float shoreWaves = sw1 * 0.5 + sw2 * 0.3 + sw3 * 0.2;
      shoreWaves = floor(shoreWaves * 8.0) / 8.0;
      
      shoreWaves *= step(0.01, distToShore);
      shoreWaves *= smoothstep(0.0, 0.3, distToShore);

      // === Open water waves: cellular Voronoi driven by wind ===
      
      // Scale up by 2x for larger cells
      float outerScale = cellScale * 2.0;
      
      // Stretch UV parallel to wind by 2.35
      vec2 baseUV = wp.xz;
      vec2 stretchedUV = baseUV + windNorm * dot(baseUV, windNorm) * 1.35;
      
      // Distortion noise (counter-moving)
      float n1 = noise2D(noiseUV) * 2.0 - 1.0;
      float n2 = noise2D(noiseUV + vec2(100.0, 50.0)) * 2.0 - 1.0;
      vec2 noiseDistortion = vec2(n1, n2) * 1.5;

      // Triple Voronoi sampling with wind variations
      vec2 offsetBase = windDir * wTime * windSpeed;
      
      // Quantize UV before sampling for blocky cells
      float cellSize = 1.0 / outerScale;
      vec2 quantizedBase = floor((stretchedUV * outerScale + offsetBase + noiseDistortion) * cellSize) / cellSize;
      float vBase = voronoi(quantizedBase);

      vec2 windPlus = rotate2D(windDir, 12.0 * 3.14159265 / 180.0);
      vec2 windMinus = rotate2D(windDir, -12.0 * 3.14159265 / 180.0);
      
      float halfScale = outerScale * 0.5;
      float halfCellSize = 1.0 / halfScale;
      
      vec2 quantizedPlus = floor((wp.xz * halfScale + windPlus * wTime * windSpeed * 0.5) * halfCellSize) / halfCellSize;
      vec2 quantizedMinus = floor((wp.xz * halfScale + windMinus * wTime * windSpeed * 0.5) * halfCellSize) / halfCellSize;
      
      float vPlus = voronoi(quantizedPlus);
      float vMinus = voronoi(quantizedMinus);

      // Sharpen for peaks at cell edges (midpoint between 1.5 and 2.0)
      vBase = pow(vBase, 1.75);
      vPlus = pow(vPlus, 1.75);
      vMinus = pow(vMinus, 1.75);

      // Blend to create complex cellular pattern
      float openWaterWaves = max(vPlus, vMinus) * vBase;
      
      // Adjust contrast (midpoint between 0.8 and 1.2)
      openWaterWaves = pow(openWaterWaves, 1.0);
      
      openWaterWaves = floor(openWaterWaves * 8.0) / 8.0;

      // Open water mask: fade out cellular waves near shore
      float openWaterMask = smoothstep(0.3, 0.8, 1.0 - distToShore);
      openWaterWaves *= openWaterMask * cellStrength;

      // Combine both wave types
      // Shore waves lighter (0.6x), cellular waves normal strength
      float totalWaves = shoreWaves * 0.6 + openWaterWaves;

      // Blend white waves on top of base water color with reduced strength
      vec3 waveColor = vec3(1.0, 1.0, 1.0);
      color.rgb = mix(color.rgb, waveColor, totalWaves * pStr * 0.5);
    `);

    // Bind uniforms when material is used (effect is ready here)
    this.waterMaterial.onBindObservable.add(() => {
      const effect = this.waterMaterial?.getEffect();
      if (!effect) return;

      const world = World.getInstance();
      effect.setFloat('wTime', world.gameTime);

      const p = this.params;
      effect.setFloat('pFreq1', p.pFreq1);
      effect.setFloat('pSpeed1', p.pSpeed1);
      effect.setFloat('pFreq2', p.pFreq2);
      effect.setFloat('pSpeed2', p.pSpeed2);
      effect.setFloat('pMix', p.pMix);
      effect.setFloat('pStr', p.pStr);
      effect.setFloat('flowSpeed', p.flowSpeed);
      effect.setFloat('noiseScale', p.noiseScale);
      effect.setFloat2('windDir', world.wind.directionX, world.wind.directionZ);
      effect.setFloat('windSpeed', world.wind.speed);
      effect.setFloat('cellScale', p.cellScale);
      effect.setFloat('cellStrength', p.cellStrength);
    });
  }

  private createHeightTexture(): void {
    if (!this.voxelGrid) return;

    const texWidth = GRID_WIDTH * 8;
    const texHeight = GRID_DEPTH * 8;

    this.heightTexture = new DynamicTexture(
      'heightTexture',
      { width: texWidth, height: texHeight },
      this.scene,
      false
    );

    this.heightTexture.updateSamplingMode(1); // NEAREST
  }

  private createFlowTexture(): void {
    if (!this.voxelGrid) return;

    const texWidth = GRID_WIDTH * 8;
    const texHeight = GRID_DEPTH * 8;

    this.flowTexture = new DynamicTexture(
      'flowTexture',
      { width: texWidth, height: texHeight },
      this.scene,
      false
    );

    this.flowTexture.updateSamplingMode(2); // BILINEAR for smooth flow sampling
  }

  private updateHeightTexture(): void {
    if (!this.heightTexture || !this.voxelGrid) return;

    const gridW = GRID_WIDTH;
    const gridD = GRID_DEPTH;
    const scale = 8; // 8x upscale
    const texW = gridW * scale;
    const texD = gridD * scale;

    // Step 1: Build binary water mask at 4x resolution
    const waterMask = new Float32Array(texW * texD);
    const waterLevelVoxels = (WATER_LEVEL_Y - LEVEL_OFFSET_Y) / VOXEL_HEIGHT;

    for (let tz = 0; tz < texD; tz++) {
      for (let tx = 0; tx < texW; tx++) {
        // Map texture pixel back to grid cell
        const gx = Math.floor(tx / scale);
        const gz = Math.floor(tz / scale);
        const columnHeight = this.voxelGrid.getColumnHeight(gx, gz);
        const idx = tz * texW + tx;
        waterMask[idx] = columnHeight < waterLevelVoxels ? 1.0 : 0.0;
      }
    }

    // Step 2: First cross-blur pass (cardinal directions)
    const blurRadius = Math.min(10, Math.ceil(this.params.shoreFade));
    const blurred1 = new Float32Array(texW * texD);

    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        let sum = waterMask[z * texW + x];
        let count = 1;

        for (let i = 1; i <= blurRadius; i++) {
          if (x + i < texW) { sum += waterMask[z * texW + (x + i)]; count++; }
          if (x - i >= 0) { sum += waterMask[z * texW + (x - i)]; count++; }
          if (z + i < texD) { sum += waterMask[(z + i) * texW + x]; count++; }
          if (z - i >= 0) { sum += waterMask[(z - i) * texW + x]; count++; }
        }

        blurred1[z * texW + x] = sum / count;
      }
    }

    // Step 3: Aggressive second cross-blur pass (wider radius)
    const aggressiveRadius = blurRadius * 2;
    const blurred2 = new Float32Array(texW * texD);

    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        let sum = blurred1[z * texW + x];
        let count = 1;

        for (let i = 1; i <= aggressiveRadius; i++) {
          if (x + i < texW) { sum += blurred1[z * texW + (x + i)]; count++; }
          if (x - i >= 0) { sum += blurred1[z * texW + (x - i)]; count++; }
          if (z + i < texD) { sum += blurred1[(z + i) * texW + x]; count++; }
          if (z - i >= 0) { sum += blurred1[(z - i) * texW + x]; count++; }
        }

        blurred2[z * texW + x] = sum / count;
      }
    }

    // Step 4: Gaussian blur pass (separable: horizontal then vertical)
    const gaussRadius = 5;
    const sigma = 2.0;
    
    // Build Gaussian kernel
    const kernelSize = gaussRadius * 2 + 1;
    const kernel = new Float32Array(kernelSize);
    let kernelSum = 0;
    for (let i = 0; i < kernelSize; i++) {
      const x = i - gaussRadius;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      kernelSum += kernel[i];
    }
    for (let i = 0; i < kernelSize; i++) {
      kernel[i] /= kernelSum;
    }

    // Horizontal Gaussian pass
    const blurredH = new Float32Array(texW * texD);
    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        let sum = 0;
        for (let i = 0; i < kernelSize; i++) {
          const sx = x + i - gaussRadius;
          if (sx >= 0 && sx < texW) {
            sum += blurred2[z * texW + sx] * kernel[i];
          }
        }
        blurredH[z * texW + x] = sum;
      }
    }

    // Vertical Gaussian pass
    const blurredV = new Float32Array(texW * texD);
    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        let sum = 0;
        for (let i = 0; i < kernelSize; i++) {
          const sz = z + i - gaussRadius;
          if (sz >= 0 && sz < texD) {
            sum += blurredH[sz * texW + x] * kernel[i];
          }
        }
        blurredV[z * texW + x] = sum;
      }
    }

    // Step 5: Compute distance-to-shore map for radial waves
    const distanceMap = new Float32Array(texW * texD);

    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        const idx = z * texW + x;
        
        // Inverted mask: 1 = shore/land edge, 0 = deep water
        const invMask = 1.0 - blurredV[idx];
        
        // Store inverted mask as distance proxy
        // High values = near shore, low values = far from shore
        distanceMap[idx] = invMask;
      }
    }

    // Gradient of distance map gives outward flow direction
    const flowX = new Float32Array(texW * texD);
    const flowZ = new Float32Array(texW * texD);

    for (let z = 0; z < texD; z++) {
      for (let x = 0; x < texW; x++) {
        const idx = z * texW + x;
        
        // Central differences for gradient
        const xR = x + 1 < texW ? distanceMap[z * texW + (x + 1)] : distanceMap[idx];
        const xL = x - 1 >= 0 ? distanceMap[z * texW + (x - 1)] : distanceMap[idx];
        const zD = z + 1 < texD ? distanceMap[(z + 1) * texW + x] : distanceMap[idx];
        const zU = z - 1 >= 0 ? distanceMap[(z - 1) * texW + x] : distanceMap[idx];

        // Gradient points toward higher values (toward shore)
        let gx = (xR - xL) * 0.5;
        let gz = (zD - zU) * 0.5;

        // Invert: flow away from shore
        gx = -gx;
        gz = -gz;

        // Normalize
        const mag = Math.sqrt(gx * gx + gz * gz);
        if (mag > 0.001) {
          gx /= mag;
          gz /= mag;
        }

        flowX[idx] = gx;
        flowZ[idx] = gz;
      }
    }

    // Step 6: Write mask to height texture
    const context = this.heightTexture.getContext() as CanvasRenderingContext2D;
    const imageData = context.createImageData(texW, texD);
    const data = imageData.data;

    for (let i = 0; i < texW * texD; i++) {
      const brightness = Math.floor(blurredV[i] * 255);
      const idx = i * 4;
      data[idx + 0] = brightness;
      data[idx + 1] = brightness;
      data[idx + 2] = brightness;
      data[idx + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
    this.heightTexture.update();

    // Step 7: Write flow vectors to flow texture (RG = XZ, normalized -1 to 1 -> 0 to 255)
    const flowContext = this.flowTexture!.getContext() as CanvasRenderingContext2D;
    const flowImageData = flowContext.createImageData(texW, texD);
    const flowData = flowImageData.data;

    for (let i = 0; i < texW * texD; i++) {
      const idx = i * 4;
      flowData[idx + 0] = Math.floor((flowX[i] * 0.5 + 0.5) * 255); // X: -1..1 -> 0..255
      flowData[idx + 1] = Math.floor((flowZ[i] * 0.5 + 0.5) * 255); // Z: -1..1 -> 0..255
      flowData[idx + 2] = 0;
      flowData[idx + 3] = 255;
    }

    flowContext.putImageData(flowImageData, 0, 0);
    this.flowTexture!.update();

    console.log(`[WaterManager] Generated ${texW}x${texD} water mask + flow vectors: cross-blur ${blurRadius}, aggressive ${aggressiveRadius}, gaussian ${gaussRadius}`);
  }

  /**
   * Regenerate water mask texture (call when terrain or blur params change).
   */
  refreshHeightTexture(): void {
    this.updateHeightTexture();
  }

  /**
   * Update mirror reflection render list (call after adding trees, rocks, bushes, players).
   * Includes: sky, terrain, trees, bushes, rocks, players. Excludes: water plane, item pickups.
   */
  refreshMirrorRenderList(): void {
    if (!this.mirrorTexture || !this.scene) return;

    this.mirrorTexture.renderList = this.getReflectionMeshes();
  }

  /**
   * Get the water level Y coordinate (constant for entire level).
   */
  getWaterLevel(): number {
    return WATER_LEVEL_Y;
  }

  /**
   * Check if water exists at the given XZ position by sampling the height texture.
   * @returns Water surface Y coordinate, or -Infinity if no water at this position
   */
  getWaterLevelAt(x: number, z: number): number {
    if (!this.heightTexture || !this.voxelGrid) {
      return -Infinity;
    }

    // Convert world XZ to UV coordinates
    const planeWidth = GRID_WIDTH * VOXEL_WIDTH;
    const planeDepth = GRID_DEPTH * VOXEL_DEPTH;
    const u = (x - LEVEL_OFFSET_X) / planeWidth;
    const v = 1.0 - (z - LEVEL_OFFSET_Z) / planeDepth;

    // Check bounds
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return -Infinity;
    }

    // Sample height texture to check if water exists here
    // The texture stores a grayscale mask: 1.0 = water, 0.0 = land
    const texWidth = GRID_WIDTH * 8;
    const texHeight = GRID_DEPTH * 8;
    const px = Math.floor(u * texWidth);
    const py = Math.floor(v * texHeight);

    // Read pixel from texture
    const context = this.heightTexture.getContext() as CanvasRenderingContext2D;
    const imageData = context.getImageData(px, py, 1, 1);
    const waterMask = imageData.data[0] / 255.0; // R channel contains water mask

    // If water mask > 0.5, there's water here
    if (waterMask > 0.5) {
      return WATER_LEVEL_Y;
    }

    return -Infinity;
  }

  /**
   * Check if a position is underwater (below water surface).
   */
  isUnderwater(x: number, y: number, z: number): boolean {
    const waterY = this.getWaterLevelAt(x, z);
    return waterY !== -Infinity && y < waterY;
  }

  /**
   * Update water (uniforms are set in onBindObservable using TimeManager).
   */
  update(): void {
    // Nothing needed here - time comes from TimeManager, uniforms bound in onBindObservable
  }

  dispose(): void {
    if (this.mirrorTexture) {
      this.mirrorTexture.dispose();
      this.mirrorTexture = null;
    }

    if (this.waterPlane) {
      this.waterPlane.dispose();
      this.waterPlane = null;
    }

    if (this.heightTexture) {
      this.heightTexture.dispose();
      this.heightTexture = null;
    }

    if (this.flowTexture) {
      this.flowTexture.dispose();
      this.flowTexture = null;
    }

    if (this.waterMaterial) {
      this.waterMaterial.dispose();
      this.waterMaterial = null;
    }

    LevelWaterManager.instance = null;
    console.log('[WaterManager] Disposed');
  }
}
