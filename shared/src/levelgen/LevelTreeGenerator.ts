/**
 * Level tree generation utilities.
 * Generates tree variations for level placement.
 */

import { TreeGenerator, TreeVoxelGrid, TreeGreedyMesher, TreeMeshBuilder, TreeMeshDecimator, type TreeQuad, type TreeMesh, type TreeColliderMesh, type TreeParams } from '../treegen/index.js';
import { SeededRandom } from '../rng.js';

/** Ranges match TreeView.vue randomSeed() so level trees match editor variety (twist, sway, etc.) */
function randomTreeParamsForSeed(treeSeed: string): Partial<TreeParams> {
  const r = new SeededRandom(treeSeed);
  return {
    trunkSegments: Math.floor(r.next() * (18 - 8 + 1)) + 8,
    trunkMidSegments: Math.floor(r.next() * (9 - 4 + 1)) + 4,
    trunkTopSegments: Math.floor(r.next() * (6 - 4 + 1)) + 4,
    trunkStepLength: r.next() * (1.25 - 0.8) + 0.8,
    trunkTaper: r.next() * (0.980 - 0.960) + 0.960,
    trunkSway: r.next() * 1.0,
    trunkTwist: r.next() * 1.0 - 0.5,
    yawAngle: r.next() * (1.4 - 0.55) + 0.55,
    yawDeviation: r.next() * (0.6 - 0.15) + 0.15,
    pitchAngle: r.next() * (1.2 - 0.80) + 0.80,
    pitchDeviation: r.next() * (0.4 - 0.10) + 0.10,
    stepLength: r.next() * (1.1 - 0.45) + 0.45,
    stepDeviation: r.next() * (0.40 - 0.2) + 0.2,
    thicknessDecay: r.next() * (0.70 - 0.6) + 0.6,
    minThickness: r.next() * (0.70 - 0.4) + 0.4,
    leafRadius: Math.floor(r.next() * (6 - 4 + 1)) + 4,
    leafRadiusVariation: r.next() * 1.0,
    leafBlobs: Math.floor(r.next() * (4 - 1 + 1)) + 1,
    gravityDroop: r.next() * (0.12 - (-0.12)) + (-0.12),
    rootSegments: Math.floor(r.next() * (6 - 1 + 1)) + 1,
    rootBranches: Math.floor(r.next() * (6 - 2 + 1)) + 2,
    rootGravityDroop: r.next() * (0.70 - 0.50) + 0.50,
  };
}

export interface TreeVariation {
  /** Unique ID for this tree variation (0-17) */
  id: number;
  /** Seed used to generate this tree */
  seed: string;
  /** Pre-generated quads for this tree mesh (rendering) */
  quads: TreeQuad[];
  /** Full detail triangle mesh (wood only) */
  fullMesh: TreeMesh;
  /** Simplified collider mesh (wood only) */
  colliderMesh: TreeColliderMesh;
}

export interface TreeInstance {
  /** Which variation to use (0-17) */
  variationId: number;
  /** World-space position (X, Z on terrain grid) */
  worldX: number;
  worldZ: number;
  /** World-space Y (on terrain surface) */
  worldY: number;
  /** Random rotation around Y axis (in radians) */
  rotationY: number;
}

/**
 * Generate a set of tree variations for a level.
 * Creates 8 unique tree meshes that can be instanced throughout the level.
 * 
 * @param baseSeed The level seed to derive tree seeds from
 * @param gridResolution Collider mesh resolution (default 32)
 * @returns Array of 8 tree variations with pre-generated mesh data
 */
export function generateTreeVariations(baseSeed: string, gridResolution: number = 32): TreeVariation[] {
  const variations: TreeVariation[] = [];
  const VARIATION_COUNT = 8;
  for (let i = 0; i < VARIATION_COUNT; i++) {
    const treeSeed = `${baseSeed}_tree_${i}`;
    const grid = new TreeVoxelGrid();
    const params = randomTreeParamsForSeed(treeSeed);
    const generator = new TreeGenerator(treeSeed, grid, params);

    // Generate the tree
    generator.generate();
    
    // Mesh it
    const mesher = new TreeGreedyMesher(grid);
    const quads = mesher.generateMesh();
    
    // Build full triangle mesh (wood only)
    const meshBuilder = new TreeMeshBuilder();
    const fullMesh = meshBuilder.buildFromQuads(quads);
    
    // Decimate for collider mesh
    const decimator = new TreeMeshDecimator();
    const colliderMesh = decimator.decimate(fullMesh, gridResolution);
    
    variations.push({
      id: i,
      seed: treeSeed,
      quads,
      fullMesh,
      colliderMesh
    });
  }

  return variations;
}

/**
 * Place tree instances across the level terrain.
 * Uses cell-based occupancy tracking to prevent overlaps.
 * 
 * @param baseSeed Level seed for deterministic placement
 * @param variationCount Number of tree variations available
 * @param targetCount Target number of tree instances (200-400)
 * @param terrainGetHeight Function to get terrain height at (worldX, worldZ)
 * @param occupiedCells Set of occupied cell keys ("x,z")
 * @returns Array of tree instances with positions and rotations
 */
export function placeTreeInstances(
  baseSeed: string,
  variationCount: number,
  targetCount: number,
  terrainGetHeight: (worldX: number, worldZ: number) => number,
  occupiedCells: Set<string>
): TreeInstance[] {
  const rng = new SeededRandom(baseSeed + '_tree_placement');
  const instances: TreeInstance[] = [];
  
  // Terrain bounds (100x100 grid, 2x2 voxels, centered at origin)
  // Grid world space: -100 to 100 in X and Z
  const HALF_EXTENT = 90; // Stay inside edges
  const CELL_SIZE = 2.0; // Match terrain voxel size
  
  const MAX_ATTEMPTS = targetCount * 3; // Try up to 3x target to fill level
  let attempts = 0;
  while (instances.length < targetCount && attempts < MAX_ATTEMPTS) {
    attempts++;
    
    // Random cell position
    const cellX = Math.floor(rng.next() * (HALF_EXTENT * 2 / CELL_SIZE));
    const cellZ = Math.floor(rng.next() * (HALF_EXTENT * 2 / CELL_SIZE));
    const cellKey = `${cellX},${cellZ}`;
    
    // Snap to cell center (terrain cells are 2x2)
    const worldX = cellX * CELL_SIZE - HALF_EXTENT + CELL_SIZE * 0.5;
    const worldZ = cellZ * CELL_SIZE - HALF_EXTENT + CELL_SIZE * 0.5;
    
    // Check if cell is occupied
    if (occupiedCells.has(cellKey)) {
      continue;
    }
    
    // Check neighboring cells for tree radius overlap
    let tooClose = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const neighborKey = `${cellX + dx},${cellZ + dz}`;
        if (occupiedCells.has(neighborKey)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) break;
    }
    
    if (tooClose) continue;
    
    // Get terrain height
    const worldY = terrainGetHeight(worldX, worldZ);
    
    // Random variation and rotation
    const variationId = Math.floor(rng.next() * variationCount);
    const rotationY = rng.next() * Math.PI * 2;
    
    // Place tree
    instances.push({
      variationId,
      worldX,
      worldZ,
      worldY,
      rotationY
    });
    
    // Mark cell as occupied
    occupiedCells.add(cellKey);
  }
  return instances;
}
