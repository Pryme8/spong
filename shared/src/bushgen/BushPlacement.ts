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
 * @param bounds Optional half extent for world bounds (default 100 for single tile)
 * @returns Array of bush instances with positions and variation IDs
 */
export function placeBushInstances(
  baseSeed: string,
  variationCount: number,
  targetCount: number,
  terrainGetHeight: (worldX: number, worldZ: number) => number,
  occupiedCells: Set<string>,
  bounds?: { halfExtent: number }
): BushInstance[] {
  const rng = new SeededRandom(baseSeed + '_bush_placement');
  const instances: BushInstance[] = [];
  const HALF_EXTENT = bounds?.halfExtent ?? 100;
  const minX = -HALF_EXTENT;
  const maxX = HALF_EXTENT;
  const minZ = -HALF_EXTENT;
  const maxZ = HALF_EXTENT;
  
  // Bush placement parameters
  const cellSize = 4; // 4 units per cell (bushes are smaller)
  const maxAttempts = targetCount * 10; // Try 10x the target count
  
  let attempts = 0;
  let occupiedCount = 0;
  while (instances.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    // Random position within level bounds
    const worldX = rng.range(minX, maxX);
    const worldZ = rng.range(minZ, maxZ);
    
    // Get terrain height at this position
    const worldY = terrainGetHeight(worldX, worldZ);
    
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

  return instances;
}
