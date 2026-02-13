import { NullEngine, Scene, FreeCamera, Vector3, MeshBuilder } from '@babylonjs/core';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let havokInstance: any = null;

export async function initializeHavok(): Promise<void> {
  if (!havokInstance) {
    // In Node.js, we need to load the WASM file manually
    const wasmPath = join(__dirname, '../../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
    const wasmBuffer = readFileSync(wasmPath);
    const wasmBinary = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
    havokInstance = await HavokPhysics({ wasmBinary });
  }
}

export function createNullEngine(): NullEngine {
  const engine = new NullEngine({
    renderWidth: 512,
    renderHeight: 512,
    textureSize: 512,
    deterministicLockstep: true,
    lockstepMaxSteps: 4
  });

  return engine;
}

export async function createScene(engine: NullEngine): Promise<Scene> {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  
  // NullEngine requires a camera to be present even though it doesn't render
  new FreeCamera('camera', Vector3.Zero(), scene);
  
  // Initialize Havok physics for projectile/environment collisions
  if (havokInstance) {
    const havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
    console.log('Havok physics enabled on server');
    
    // Create ground plane collider for projectiles to hit
    const ground = MeshBuilder.CreateGround('ground', {
      width: 30,
      height: 30
    }, scene);
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }
  
  return scene;
}
