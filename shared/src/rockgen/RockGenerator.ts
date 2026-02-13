/**
 * Procedural rock generator using sphere clipping and noise distortion.
 *
 * Algorithm:
 * 1. Place a single sphere at grid center with radius 18-20
 * 2. Random plane clipping 6-12 times to create facets
 * 3. Apply noise distortion to roughen surfaces
 * 4. Threshold pass to clean up edges
 */

import { SeededRandom } from '../rng.js';
import { Noise2D } from '../noise.js';
import { RockVoxelGrid } from './RockVoxelGrid.js';

// Rock size configurations
export interface RockSizeConfig {
  gridSize: number;
  minRadius: number;
  maxRadius: number;
  minClipPasses: number;
  maxClipPasses: number;
}

// Three size variants: small, medium, large
// With ROCK_VOXEL_SIZE=1.0 and ROCK_SCALE=0.5, final size = gridSize * 0.5
// Larger rocks use fewer voxels per unit so each cell is bigger (chunkier look)
const ROCK_SIZES: RockSizeConfig[] = [
  { gridSize: 12, minRadius: 4, maxRadius: 5, minClipPasses: 4, maxClipPasses: 7 },   // Small (~3 units final)
  { gridSize: 16, minRadius: 5, maxRadius: 7, minClipPasses: 5, maxClipPasses: 9 },   // Medium (~4 units final)
  { gridSize: 20, minRadius: 7, maxRadius: 9, minClipPasses: 6, maxClipPasses: 11 }   // Large (~5 units final)
];

const DEFAULT_NOISE_AMPLITUDE = 1.0;
const DEFAULT_SURFACE_THRESHOLD = 0.15;

/** Optional overrides for level variety (same seed + params = same rock). */
export interface RockParams {
  noiseAmplitude?: number;
  surfaceThreshold?: number;
}

/**
 * Deterministically choose rock size based on seed.
 */
function selectRockSize(seed: string): RockSizeConfig {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % ROCK_SIZES.length;
  return ROCK_SIZES[index];
}

/**
 * Generate a rock voxel grid from a seed string.
 * Size is randomly selected from three variants based on seed.
 * Optional params add variety (e.g. level gen uses seed-derived params).
 */
export function generateRock(seed: string, params?: RockParams): RockVoxelGrid {
  const sizeConfig = selectRockSize(seed);
  const rng = new SeededRandom(seed);
  const grid = new RockVoxelGrid(sizeConfig.gridSize);
  const noiseAmplitude = params?.noiseAmplitude ?? DEFAULT_NOISE_AMPLITUDE;
  const surfaceThreshold = params?.surfaceThreshold ?? DEFAULT_SURFACE_THRESHOLD;

  const centerX = sizeConfig.gridSize * 0.5;
  const centerY = sizeConfig.gridSize * 0.5;
  const centerZ = sizeConfig.gridSize * 0.5;

  // ── Step 1: Place initial sphere ───────────────────────────
  const radius = rng.range(sizeConfig.minRadius, sizeConfig.maxRadius);
  fillSphere(grid, centerX, centerY, centerZ, radius);
  
  console.log(`[RockGen] Size=${sizeConfig.gridSize}x${sizeConfig.gridSize} Initial sphere: radius=${radius.toFixed(1)}`);

  // ── Step 2: Random plane clipping ──────────────────────────
  const clipPasses = rng.int(sizeConfig.minClipPasses, sizeConfig.maxClipPasses);
  
  for (let i = 0; i < clipPasses; i++) {
    // Generate random normal (unit sphere sampling)
    const theta = rng.range(0, Math.PI * 2);
    const phi = Math.acos(2 * rng.next() - 1);
    const normalX = Math.sin(phi) * Math.cos(theta);
    const normalY = Math.sin(phi) * Math.sin(theta);
    const normalZ = Math.cos(phi);
    
    // Find current radius along this normal
    const currentRadius = findRadiusAlongNormal(
      grid, 
      centerX, centerY, centerZ,
      normalX, normalY, normalZ
    );
    
    if (currentRadius < 2) continue; // Skip if already fully clipped
    
    // Compute clip offset (2 to min(8, radius-2) units inward)
    const maxOffset = Math.min(8, currentRadius - 2);
    const clipInset = rng.range(2, maxOffset);
    const clipOffset = currentRadius - clipInset;
    
    // Zero out density on the far side of the plane
    clipPlane(grid, centerX, centerY, centerZ, normalX, normalY, normalZ, clipOffset);
  }
  
  console.log(`[RockGen] Applied ${clipPasses} clip passes`);

  // ── Step 3: Noise distortion ───────────────────────────────
  applyNoiseDistortion(grid, seed, noiseAmplitude);
  
  console.log(`[RockGen] Applied noise distortion`);

  // ── Step 4: Threshold pass ─────────────────────────────────
  applyThreshold(grid, surfaceThreshold);
  
  console.log(`[RockGen] Applied threshold, solid count: ${grid.getSolidCount()}`);

  // ── Step 5: Remove isolated voxels (stray collider fix) ────
  removeIsolatedVoxels(grid);
  
  console.log(`[RockGen] Removed isolated voxels, final count: ${grid.getSolidCount()}`);

  return grid;
}

/**
 * Fill a sphere into the density grid with smooth falloff.
 */
function fillSphere(
  grid: RockVoxelGrid,
  cx: number,
  cy: number,
  cz: number,
  radius: number
): void {
  const radiusSq = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(grid.size - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(grid.size - 1, Math.ceil(cy + radius));
  const minZ = Math.max(0, Math.floor(cz - radius));
  const maxZ = Math.min(grid.size - 1, Math.ceil(cz + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= radiusSq) {
          // Smooth falloff: 1.0 at center, 0.0 at edge
          const dist = Math.sqrt(distSq);
          const density = 1.0 - (dist / radius);
          grid.setDensity(x, y, z, density);
        }
      }
    }
  }
}

/**
 * Traverse from center along normal to find the current surface radius.
 * Returns the distance where density drops below threshold.
 */
function findRadiusAlongNormal(
  grid: RockVoxelGrid,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number
): number {
  const threshold = 0.1;
  const maxSteps = grid.size;
  
  for (let step = 0; step < maxSteps; step++) {
    const x = Math.round(cx + nx * step);
    const y = Math.round(cy + ny * step);
    const z = Math.round(cz + nz * step);
    
    if (x < 0 || x >= grid.size || y < 0 || y >= grid.size || z < 0 || z >= grid.size) {
      return step;
    }
    
    if (grid.getDensity(x, y, z) < threshold) {
      return step;
    }
  }
  
  return maxSteps;
}

/**
 * Clip the grid by zeroing out all density on one side of a plane.
 * Plane equation: dot(pos - center, normal) > offset
 */
function clipPlane(
  grid: RockVoxelGrid,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
  offset: number
): void {
  for (let y = 0; y < grid.size; y++) {
    for (let z = 0; z < grid.size; z++) {
      for (let x = 0; x < grid.size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        
        // Dot product with normal
        const dot = dx * nx + dy * ny + dz * nz;
        
        // If on the far side of the clip plane, zero it out
        if (dot > offset) {
          grid.setDensity(x, y, z, 0);
        }
      }
    }
  }
}

/**
 * Apply noise distortion to roughen the surface.
 * Samples density from noise-offset coordinates.
 */
function applyNoiseDistortion(
  grid: RockVoxelGrid,
  seed: string,
  amplitude: number
): void {
  const newDensity = new Float32Array(grid.size * grid.size * grid.size);
  const noiseFreq = 0.15; // Frequency of the noise pattern
  
  // Create 3 noise generators for X, Y, Z offsets
  const noiseX = new Noise2D(seed + '_x');
  const noiseY = new Noise2D(seed + '_y');
  const noiseZ = new Noise2D(seed + '_z');
  
  for (let y = 0; y < grid.size; y++) {
    for (let z = 0; z < grid.size; z++) {
      for (let x = 0; x < grid.size; x++) {
        // Sample noise at this position using 2D noise with different plane projections
        const offsetX = (noiseX.noise(y * noiseFreq, z * noiseFreq) - 0.5) * 2 * amplitude;
        const offsetY = (noiseY.noise(x * noiseFreq, z * noiseFreq) - 0.5) * 2 * amplitude;
        const offsetZ = (noiseZ.noise(x * noiseFreq, y * noiseFreq) - 0.5) * 2 * amplitude;
        
        // Offset sample position
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        const sampleZ = z + offsetZ;
        
        // Trilinear interpolation for smooth sampling
        const density = sampleDensity(grid, sampleX, sampleY, sampleZ);
        
        const idx = x + z * grid.size + y * grid.size * grid.size;
        newDensity[idx] = density;
      }
    }
  }
  
  grid.replaceDensity(newDensity);
}

/**
 * Sample density with trilinear interpolation.
 */
function sampleDensity(
  grid: RockVoxelGrid,
  x: number,
  y: number,
  z: number
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  
  // Sample 8 corners
  const d000 = grid.getDensity(x0, y0, z0);
  const d001 = grid.getDensity(x0, y0, z1);
  const d010 = grid.getDensity(x0, y1, z0);
  const d011 = grid.getDensity(x0, y1, z1);
  const d100 = grid.getDensity(x1, y0, z0);
  const d101 = grid.getDensity(x1, y0, z1);
  const d110 = grid.getDensity(x1, y1, z0);
  const d111 = grid.getDensity(x1, y1, z1);
  
  // Trilinear interpolation
  const d00 = d000 * (1 - fx) + d100 * fx;
  const d01 = d001 * (1 - fx) + d101 * fx;
  const d10 = d010 * (1 - fx) + d110 * fx;
  const d11 = d011 * (1 - fx) + d111 * fx;
  
  const d0 = d00 * (1 - fy) + d10 * fy;
  const d1 = d01 * (1 - fy) + d11 * fy;
  
  return d0 * (1 - fz) + d1 * fz;
}

/**
 * Erase density below threshold to clean up fringe.
 */
function applyThreshold(grid: RockVoxelGrid, threshold: number): void {
  for (let y = 0; y < grid.size; y++) {
    for (let z = 0; z < grid.size; z++) {
      for (let x = 0; x < grid.size; x++) {
        const density = grid.getDensity(x, y, z);
        if (density < threshold) {
          grid.setDensity(x, y, z, 0);
        }
      }
    }
  }
}

/**
 * Remove isolated voxels that have too few solid neighbors.
 * This prevents stray colliders from noise-distorted outliers.
 */
function removeIsolatedVoxels(grid: RockVoxelGrid): void {
  const toRemove: Array<{ x: number; y: number; z: number }> = [];
  
  // Check each solid voxel
  for (let y = 0; y < grid.size; y++) {
    for (let z = 0; z < grid.size; z++) {
      for (let x = 0; x < grid.size; x++) {
        if (!grid.isSolid(x, y, z)) continue;
        
        // Count solid neighbors (6-connected)
        let solidNeighbors = 0;
        const neighbors = [
          [x - 1, y, z], [x + 1, y, z],
          [x, y - 1, z], [x, y + 1, z],
          [x, y, z - 1], [x, y, z + 1]
        ];
        
        for (const [nx, ny, nz] of neighbors) {
          if (grid.isSolid(nx, ny, nz)) {
            solidNeighbors++;
          }
        }
        
        // Remove if too isolated (less than 2 solid neighbors)
        if (solidNeighbors < 2) {
          toRemove.push({ x, y, z });
        }
      }
    }
  }
  
  // Remove isolated voxels
  for (const { x, y, z } of toRemove) {
    grid.setDensity(x, y, z, 0);
  }
  
  console.log(`[RockGen] Removed ${toRemove.length} isolated voxels`);
}
