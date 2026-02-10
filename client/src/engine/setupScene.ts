import { 
  Engine, 
  Scene, 
  Vector3, 
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  WebGPUEngine,
  Mesh,
  VertexBuffer
} from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials/sky';
import { ShadowManager } from './ShadowManager';
import { MeshPrimitives } from './MeshPrimitives';
import type { SunConfig } from '@spong/shared';

export async function createEngine(canvas: HTMLCanvasElement): Promise<Engine> {
  const supportsWebGPU = await WebGPUEngine.IsSupportedAsync;
  
  if (supportsWebGPU) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
        powerPreference: 'high-performance'
      });
      
      await engine.initAsync();
      console.log('✓ Using WebGPU engine');
      return engine;
    } catch (error) {
      console.error('WebGPU initialization failed:', error);
      console.log('Falling back to WebGL...');
    }
  } else {
    console.log('WebGPU not supported, using WebGL');
  }
  
  // WebGL fallback
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });
  console.log('✓ Using WebGL engine');
  return engine;
}

export function createGameScene(engine: Engine, sunConfig?: SunConfig): { scene: Scene; shadowManager: ShadowManager } {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  
  // Initialize mesh primitives for instanced rendering
  MeshPrimitives.getInstance().initialize(scene);
  
  // Nexus-themed background (deep indigo/purple)
  scene.clearColor = new Color4(0.04, 0.04, 0.1, 1); // #0a0a1a

  // ── Lighting from SunConfig or defaults ──
  const hasSun = !!sunConfig;

  // Subtle hemispheric fill light to soften backfaces
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = hasSun ? sunConfig.hemiIntensity : 0.25;
  hemiLight.diffuse = hasSun
    ? new Color3(sunConfig.hemiR, sunConfig.hemiG, sunConfig.hemiB)
    : new Color3(0.5, 0.5, 0.7);
  hemiLight.groundColor = hasSun
    ? new Color3(sunConfig.groundR, sunConfig.groundG, sunConfig.groundB)
    : new Color3(0.1, 0.08, 0.15);

  // Directional light for shadows (main light source)
  const dirDirection = hasSun
    ? new Vector3(sunConfig.dirX, sunConfig.dirY, sunConfig.dirZ)
    : new Vector3(-0.15, -1.0, -0.1);
  const dirLight = new DirectionalLight('dirLight', dirDirection, scene);
  dirLight.intensity = hasSun ? sunConfig.lightIntensity : 0.8;
  dirLight.diffuse = hasSun
    ? new Color3(sunConfig.lightR, sunConfig.lightG, sunConfig.lightB)
    : new Color3(1, 0.95, 0.85);
  
  // Scene ambient
  scene.ambientColor = hasSun
    ? new Color3(sunConfig.ambientR, sunConfig.ambientG, sunConfig.ambientB)
    : new Color3(0.05, 0.05, 0.08);
  
  // Configure shadow frustum for better quality
  dirLight.shadowOrthoScale = 0.2;
  dirLight.autoUpdateExtends = true;
  dirLight.autoCalcShadowZBounds = true;

  // Initialize shadow manager singleton
  const shadowManager = ShadowManager.initialize(dirLight);

  // Create skysphere with SkyMaterial (dynamic sky with sun)
  const skysphere = MeshBuilder.CreateBox('skysphere', { size: 1000 }, scene);
  skysphere.isPickable = false; // Visual only, SkyPickSphere handles raycasts
  
  const skyMat = new SkyMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  
  // Sun position in sky = opposite of light direction, scaled out
  skyMat.useSunPosition = true;
  skyMat.sunPosition = dirLight.direction.scale(-1).normalize().scale(400);
  
  // Atmosphere settings — tuned per sun elevation when SunConfig provided
  skyMat.luminance = hasSun ? sunConfig.luminance : 1.0;
  skyMat.turbidity = hasSun ? sunConfig.turbidity : 10;
  skyMat.rayleigh = hasSun ? sunConfig.rayleigh : 2;
  skyMat.mieCoefficient = hasSun ? sunConfig.mieCoefficient : 0.005;
  skyMat.mieDirectionalG = hasSun ? sunConfig.mieDirectionalG : 0.8;
  
  skysphere.material = skyMat;

  if (hasSun) {
    console.log(`[Scene] Sun config applied — elevation: ${sunConfig.elevation.toFixed(1)}°, azimuth: ${sunConfig.azimuth.toFixed(1)}°`);
  }

  // Create base player cube for instancing
  createBasePlayerCube(scene);

  return { scene, shadowManager };
}

function createNexusGround(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 30,
    height: 30,
    subdivisions: 30
  }, scene);

  const mat = new StandardMaterial('groundMat', scene);
  mat.diffuseColor = new Color3(0.08, 0.08, 0.2); // Deep indigo
  mat.specularColor = new Color3(0, 0.5, 0.5); // Cyan specular
  mat.emissiveColor = new Color3(0, 0.4, 0.3); // Neon green/cyan glow
  mat.wireframe = true;
  
  ground.material = mat;
}

/**
 * Create the base player cube for instancing (hidden).
 * This is the master cube that all player instances are created from.
 */
function createBasePlayerCube(scene: Scene): Mesh {
  const box = MeshBuilder.CreateBox('basePlayerCube', {
    width: 0.8,   // X
    height: 1.0,  // Y
    depth: 0.8    // Z
  }, scene) as Mesh;
  
  // Position template cube
  box.position.y = 0.5;
  
  // Player material
  const mat = new StandardMaterial('playerMat', scene);
  mat.diffuseColor = new Color3(0, 0.8, 0.45);
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  
  box.material = mat;
  
  // Register custom instance buffer for per-player colors
  // Each instance will have its own RGB color
  const colorBuffer = new Float32Array(0); // Empty initially, grows per instance
  box.registerInstancedBuffer('color', 3); // 3 floats (RGB)
  box.instancedBuffers.color = new Color3(0, 1, 0.53); // Default color
  
  // Enable shadow receiving
  box.receiveShadows = true;
  
  // Hide the base cube (it's just a template)
  box.isVisible = false;
  
  return box;
}

/**
 * Convert a hex color string to Color3.
 */
export function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

/**
 * Create a player cube instance with a unique color.
 * Uses the hidden base cube for efficient instanced rendering.
 */
export function createPlayerInstance(name: string, scene: Scene, color: Color3): Mesh {
  const baseCube = scene.getMeshByName('basePlayerCube') as Mesh;
  
  if (!baseCube) {
    throw new Error('Base player cube not found! Call createGameScene() first.');
  }
  
  const instance = baseCube.createInstance(name);
  
  // Set unique color for this instance
  instance.instancedBuffers.color = color;
  
  return instance as Mesh;
}

/**
 * Legacy function - kept for backward compatibility but not recommended.
 * Use createPlayerInstance() instead for better performance.
 */
export function createCube(name: string, scene: Scene) {
  console.warn('createCube() is deprecated. Use createPlayerInstance() for better performance.');
  
  const box = MeshBuilder.CreateBox(name, { size: 1 }, scene);
  box.position.y = 0.5;
  
  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.diffuseColor = new Color3(0, 1, 0.53);
  mat.emissiveColor = new Color3(0, 0.5, 0.27);
  mat.specularColor = new Color3(0, 1, 1);
  mat.wireframe = true;
  
  box.material = mat;
  
  return box;
}
