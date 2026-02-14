/**
 * Level rock generation utilities.
 * Generates rock variations for level placement.
 */

import { 
  generateRock, 
  RockGreedyMesher, 
  type RockQuad, 
  generateRockColliders, 
  type RockCollider,
  RockMeshBuilder,
  RockMeshDecimator,
  type RockMesh,
  type RockColliderMesh,
  type RockParams
} from '../rockgen/index.js';
import { SeededRandom } from '../rng.js';

/** Ranges give level rocks variety in roughness/shape; editor uses defaults when no params. */
function randomRockParamsForSeed(rockSeed: string): RockParams {
  const r = new SeededRandom(rockSeed);
  return {
    noiseAmplitude: r.range(0.5, 1.5),
    surfaceThreshold: r.range(0.1, 0.25),
  };
}

export interface RockVariation {
  /** Unique ID for this rock variation */
  id: number;
  /** Seed used to generate this rock */
  seed: string;
  /** Pre-generated quads for this rock mesh (legacy, for fallback) */
  quads: RockQuad[];
  /** Full detail triangle mesh */
  fullMesh: RockMesh;
  /** Simplified collider mesh */
  colliderMesh: RockColliderMesh;
  /** Local-space AABB colliders (legacy, kept for backward compatibility) */
  colliders: RockCollider[];
}

export interface RockInstance {
  /** Which variation to use */
  variationId: number;
  /** World-space position (X, Z on terrain grid) */
  worldX: number;
  worldZ: number;
  /** World-space Y (on terrain surface) */
  worldY: number;
  /** Random rotation around Y axis (in radians) */
  rotationY: number;
  /** Random scale multiplier */
  scale: number;
}

/**
 * Generate a set of rock variations for a level.
 * Creates unique rock meshes that can be instanced throughout the level.
 * 
 * @param baseSeed The level seed to derive rock seeds from
 * @param count Number of variations to generate (e.g. 5)
 * @param gridResolution Grid resolution for mesh decimation (default 9)
 * @returns Array of rock variations with pre-generated mesh data and colliders
 */
export function generateRockVariations(
  baseSeed: string, 
  count: number = 5,
  gridResolution: number = 9
): RockVariation[] {
  const variations: RockVariation[] = [];
  for (let i = 0; i < count; i++) {
    const rockSeed = `${baseSeed}_rock_${i}`;
    const params = randomRockParamsForSeed(rockSeed);
    const grid = generateRock(rockSeed, params);
    
    // Greedy mesh it
    const mesher = new RockGreedyMesher(grid);
    const quads = mesher.generateMesh();
    
    // Build full triangle mesh
    const meshBuilder = new RockMeshBuilder();
    const fullMesh = meshBuilder.buildFromQuads(quads);
    
    // Decimate for collider mesh
    const decimator = new RockMeshDecimator();
    const colliderMesh = decimator.decimate(fullMesh, gridResolution);
    
    // Generate legacy AABB colliders (kept for backward compatibility)
    const colliders = generateRockColliders(grid);
    
    variations.push({
      id: i,
      seed: rockSeed,
      quads,
      fullMesh,
      colliderMesh,
      colliders
    });
  }

  return variations;
}

/**
 * Place rock instances across the level terrain.
 * Rocks only avoid items (not trees or other rocks) as per requirements.
 * 
 * @param baseSeed Level seed for deterministic placement
 * @param variationCount Number of rock variations available
 * @param targetCount Target number of rock instances
 * @param terrainGetHeight Function to get terrain height at (worldX, worldZ)
 * @param occupiedCells Set of occupied cell keys from items ("x,z")
 * @param bounds Optional half extent for world bounds (default 100 for single tile)
 * @returns Array of rock instances with positions, rotations, and scales
 */
export function placeRockInstances(
  baseSeed: string,
  variationCount: number,
  targetCount: number,
  terrainGetHeight: (worldX: number, worldZ: number) => number,
  occupiedCells: Set<string>,
  bounds?: { halfExtent: number }
): RockInstance[] {
  const rng = new SeededRandom(baseSeed + '_rock_placement');
  const instances: RockInstance[] = [];
  const HALF_EXTENT = bounds?.halfExtent ?? 100;
  const CELL_SIZE = 2.0;
  const cellCount = Math.floor((HALF_EXTENT * 2) / CELL_SIZE);
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 0.8;

  const MAX_ATTEMPTS = targetCount * 3;
  let attempts = 0;
  while (instances.length < targetCount && attempts < MAX_ATTEMPTS) {
    attempts++;

    const cellX = Math.floor(rng.range(0, cellCount));
    const cellZ = Math.floor(rng.range(0, cellCount));
    const cellKey = `${cellX},${cellZ}`;

    if (occupiedCells.has(cellKey)) {
      continue;
    }

    const worldX = cellX * CELL_SIZE - HALF_EXTENT - CELL_SIZE * 0.5;
    const worldZ = cellZ * CELL_SIZE - HALF_EXTENT - CELL_SIZE * 0.5;
    
    // Get terrain height at cell center
    const worldY = terrainGetHeight(worldX, worldZ);
    
    // Random variation, rotation, and scale
    const variationId = Math.floor(rng.next() * variationCount);
    const rotationY = rng.next() * Math.PI * 2;
    const scale = rng.range(MIN_SCALE, MAX_SCALE);
    
    // Place rock
    instances.push({
      variationId,
      worldX,
      worldZ,
      worldY,
      rotationY,
      scale
    });
  }
  return instances;
}
