/**
 * Bush placement for level generation.
 * Places bush instances across terrain with avoidance of occupied cells.
 */

import { SeededRandom } from '../rng.js';

export interface BushInstance {
  /** Which variation to use */
  variationId: number;
  /** World-space position */
  worldX: number;
  worldY: number;
  worldZ: number;
}

/**
 * Place bush instances across the level terrain.
 * Bushes are smaller decorative elements placed more densely than trees.
 * 
 * @param baseSeed Base seed for random placement
 * @param variationCount Number of bush variations available
 * @param targetCount Target number of bush instances (200-300)
 * @param terrainGetHeight Function to get terrain height at (worldX, worldZ)
 * @param occupiedCells Set of occupied cell keys ("x,z")
 * @returns Array of bush instances with positions and variation IDs
 */
export function placeBushInstances(
  baseSeed: string,
  variationCount: number,
  targetCount: number,
  terrainGetHeight: (worldX: number, worldZ: number) => number,
  occupiedCells: Set<string>
): BushInstance[] {
  const rng = new SeededRandom(baseSeed + '_bush_placement');
  const instances: BushInstance[] = [];
  
  // Level boundaries (200x200 world)
  const minX = -100;
  const maxX = 100;
  const minZ = -100;
  const maxZ = 100;
  
  // Bush placement parameters
  const cellSize = 4; // 4 units per cell (bushes are smaller)
  const maxAttempts = targetCount * 10; // Try 10x the target count
  
  let attempts = 0;
  let underwaterCount = 0;
  let occupiedCount = 0;
  const heightSamples: number[] = [];
  while (instances.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    // Random position within level bounds
    const worldX = rng.range(minX, maxX);
    const worldZ = rng.range(minZ, maxZ);
    
    // Get terrain height at this position
    const worldY = terrainGetHeight(worldX, worldZ);
    
    // Sample some heights for debugging (first 50)
    if (heightSamples.length < 50) {
      heightSamples.push(worldY);
    }
    
    // Calculate cell coordinates for occupancy check
    const cellX = Math.floor(worldX / cellSize);
    const cellZ = Math.floor(worldZ / cellSize);
    const cellKey = `${cellX},${cellZ}`;
    
    // Skip if this cell is occupied
    if (occupiedCells.has(cellKey)) {
      occupiedCount++;
      continue;
    }
    
    // Mark cell as occupied
    occupiedCells.add(cellKey);
    
    // Random variation ID
    const variationId = Math.floor(rng.next() * variationCount);
    
    // Create bush instance
    instances.push({
      variationId,
      worldX,
      worldY,
      worldZ
    });
  }
  
  // Calculate height statistics
  const avgHeight = heightSamples.length > 0 
    ? (heightSamples.reduce((a, b) => a + b, 0) / heightSamples.length).toFixed(2)
    : 'N/A';
  const minHeight = heightSamples.length > 0 ? Math.min(...heightSamples).toFixed(2) : 'N/A';
  const maxHeight = heightSamples.length > 0 ? Math.max(...heightSamples).toFixed(2) : 'N/A';
  
  console.log(`[BushPlacement] Placed ${instances.length}/${targetCount} bushes (${attempts} attempts)`);
  console.log(`[BushPlacement] Level bounds: ${minX} to ${maxX}, ${minZ} to ${maxZ}`);
  console.log(`[BushPlacement] Skipped: ${underwaterCount} underwater, ${occupiedCount} occupied`);
  console.log(`[BushPlacement] Terrain heights (sampled ${heightSamples.length}): min=${minHeight}, max=${maxHeight}, avg=${avgHeight}`);
  return instances;
}
