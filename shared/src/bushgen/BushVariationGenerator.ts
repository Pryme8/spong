/**
 * Bush variation generator for level placement.
 * Generates pre-made bush variations that can be instanced.
 */

import { generateBush, type BushParams } from './BushGenerator.js';
import { BushGreedyMesher } from './BushGreedyMesher.js';
import { SeededRandom } from '../rng.js';
import { BushMeshBuilder } from './BushMeshBuilder.js';
import { BushMeshDecimator } from './BushMeshDecimator.js';
import type { BushQuad } from './BushGreedyMesher.js';
import type { BushMesh, BushColliderMesh } from './BushMesh.js';

export interface BushVariation {
  /** Unique ID for this bush variation */
  id: number;
  /** Seed used to generate this bush */
  seed: string;
  /** Pre-generated quads for this bush mesh */
  quads: BushQuad[];
  /** Full detail triangle mesh */
  fullMesh: BushMesh;
  /** Simplified collider mesh for trigger detection */
  colliderMesh: BushColliderMesh;
}

/** Ranges give level bushes variety in shape/density; editor uses defaults when no params. */
function randomBushParamsForSeed(bushSeed: string): BushParams {
  const r = new SeededRandom(bushSeed);
  return {
    minSpheres: r.int(2, 4),
    maxSpheres: r.int(5, 8),
    minRadius: r.range(1.5, 2.5),
    maxRadius: r.range(3.5, 5),
    spreadFactor: r.range(0.15, 0.35),
    blurPasses: r.int(1, 3),
    surfaceThreshold: r.range(0.1, 0.2),
  };
}

/**
 * Generate a set of bush variations for a level.
 * Creates unique bush meshes that can be instanced throughout the level.
 * 
 * @param baseSeed The level seed to derive bush seeds from
 * @param count Number of variations to generate (default 8)
 * @param colliderResolution Grid resolution for mesh decimation (default 18)
 * @returns Array of bush variations with pre-generated mesh data
 */
export function generateBushVariations(
  baseSeed: string,
  count: number = 8,
  colliderResolution: number = 18
): BushVariation[] {
  const variations: BushVariation[] = [];

  console.log(`Generating ${count} bush variations for level (collider resolution: ${colliderResolution})...`);

  for (let i = 0; i < count; i++) {
    const bushSeed = `${baseSeed}_bush_${i}`;
    const params = randomBushParamsForSeed(bushSeed);
    const grid = generateBush(bushSeed, params);
    
    // Greedy mesh it
    const mesher = new BushGreedyMesher(grid);
    const quads = mesher.generateMesh();
    
    // Build full triangle mesh
    const meshBuilder = new BushMeshBuilder();
    const fullMesh = meshBuilder.buildFromQuads(quads);
    
    // Decimate for collider mesh (used for trigger detection)
    const decimator = new BushMeshDecimator();
    const colliderMesh = decimator.decimate(fullMesh, colliderResolution);
    
    variations.push({
      id: i,
      seed: bushSeed,
      quads,
      fullMesh,
      colliderMesh
    });
    
    const fullTriCount = fullMesh.indices.length / 3;
    const reduction = ((1 - colliderMesh.triangleCount / fullTriCount) * 100).toFixed(1);
    console.log(
      `  Bush variation ${i}: ${quads.length} quads, ` +
      `${fullTriCount} full tris → ${colliderMesh.triangleCount} collider tris (${reduction}% reduction)`
    );
  }

  return variations;
}
