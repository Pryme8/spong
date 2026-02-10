/**
 * Procedural bush generator.
 *
 * Uses the same density-sphere approach as CloudGenerator but tuned for
 * compact, hemispheric bush shapes that sit flat on the ground plane.
 *
 * Algorithm:
 * 1. Place 3-6 random spheres (radius 2-4) clustered near grid center.
 *    Each sphere must overlap with a previous sphere to ensure connectivity.
 * 2. Find the lowest solid voxel and shift entire density field down so
 *    the bush sits flush at Y=0 (ground level).
 * 3. Clear everything below Y = BUSH_FLOOR_Y (1).
 * 4. Blur all solid cells to smooth the shape.
 * 5. Threshold pass to carve out low-density fringe.
 */

import { SeededRandom } from '../rng.js';
import { BushVoxelGrid, BUSH_GRID_W, BUSH_GRID_H, BUSH_GRID_D, BUSH_FLOOR_Y } from './BushVoxelGrid.js';

// Sphere placement parameters
const MIN_SPHERES = 3;
const MAX_SPHERES = 6;
const MIN_RADIUS = 2;
const MAX_RADIUS = 4;

// Blur parameters
const BLUR_PASSES = 2;
const SURFACE_THRESHOLD = 0.15;

interface SpherePoint {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

/**
 * Generate a bush voxel grid from a seed string.
 */
export function generateBush(seed: string): BushVoxelGrid {
  const rng = new SeededRandom(seed);
  const grid = new BushVoxelGrid();

  // Center of grid
  const centerX = BUSH_GRID_W * 0.5;
  const centerZ = BUSH_GRID_D * 0.5;

  // ── Step 1: Place random spheres clustered near center ─────
  // Each sphere must overlap with at least one previously placed sphere
  // to ensure all voxels are connected.
  const sphereCount = rng.int(MIN_SPHERES, MAX_SPHERES);
  const spheres: SpherePoint[] = [];

  for (let i = 0; i < sphereCount; i++) {
    let attempts = 0;
    const maxAttempts = 50;
    let validSphere = false;

    while (attempts < maxAttempts && !validSphere) {
      const radius = rng.range(MIN_RADIUS, MAX_RADIUS);

      // Cluster spheres near center with some spread
      const spread = BUSH_GRID_W * 0.25;
      const cx = centerX + rng.range(-spread, spread);
      const cz = centerZ + rng.range(-spread, spread);

      // Randomize sphere Y position upward from ground
      const cy = rng.range(0, BUSH_GRID_H * 0.5);

      // Clamp within bounds (allow spheres to sit flat on bottom, Y=0 is OK)
      const clampedCx = Math.max(radius, Math.min(BUSH_GRID_W - radius, cx));
      const clampedCy = cy; // No bottom padding - bushes can be flat at Y=0
      const clampedCz = Math.max(radius, Math.min(BUSH_GRID_D - radius, cz));

      // First sphere is always valid
      if (spheres.length === 0) {
        validSphere = true;
      } else {
        // Check if this sphere overlaps with any existing sphere
        for (const existing of spheres) {
          const dx = clampedCx - existing.cx;
          const dy = clampedCy - existing.cy;
          const dz = clampedCz - existing.cz;
          const distSq = dx * dx + dy * dy + dz * dz;
          const minDist = radius + existing.radius;

          if (distSq <= minDist * minDist) {
            validSphere = true;
            break;
          }
        }
      }

      if (validSphere) {
        spheres.push({ cx: clampedCx, cy: clampedCy, cz: clampedCz, radius });
        fillSphere(grid, clampedCx, clampedCy, clampedCz, radius);
      }

      attempts++;
    }

    // If we couldn't find a valid position after max attempts, stop trying
    if (!validSphere) {
      break;
    }
  }

  console.log(`[BushGen] Placed ${spheres.length} spheres`);

  // ── Step 2: Find lowest solid voxel and shift down to ground ───
  let minY = grid.height;
  for (let y = 0; y < grid.height; y++) {
    for (let z = 0; z < grid.depth; z++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          if (y < minY) minY = y;
        }
      }
    }
  }

  // Shift entire density field down so lowest point is at Y=0
  if (minY > 0 && minY < grid.height) {
    console.log(`[BushGen] Shifting bush down by ${minY} cells to ground`);
    const tempGrid = new BushVoxelGrid();
    
    for (let y = minY; y < grid.height; y++) {
      for (let z = 0; z < grid.depth; z++) {
        for (let x = 0; x < grid.width; x++) {
          const density = grid.getDensity(x, y, z);
          if (density > 0) {
            tempGrid.setDensity(x, y - minY, z, density);
          }
        }
      }
    }

    // Copy back from temp grid
    for (let y = 0; y < grid.height; y++) {
      for (let z = 0; z < grid.depth; z++) {
        for (let x = 0; x < grid.width; x++) {
          grid.setDensity(x, y, z, tempGrid.getDensity(x, y, z));
        }
      }
    }
  }

  // ── Step 3: Clear everything below BUSH_FLOOR_Y ────────────
  grid.clearBelowY(BUSH_FLOOR_Y);

  // ── Step 4: Collect all solid cells for blur ───────────────
  const modifiedCells = new Set<number>();
  const w = grid.width;
  const h = grid.height;
  const d = grid.depth;

  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          modifiedCells.add(x + z * w + y * w * d);
        }
      }
    }
  }

  console.log(`[BushGen] Blur region: ${modifiedCells.size} cells`);

  // ── Step 5: Blur pass over all solid cells ─────────────────
  blurModifiedCells(grid, modifiedCells, BLUR_PASSES);

  // ── Step 6: Threshold pass ─────────────────────────────────
  thresholdGrid(grid, SURFACE_THRESHOLD);

  const solidCount = grid.getSolidCount();
  console.log(`[BushGen] Final solid voxels: ${solidCount}`);

  return grid;
}

/**
 * Fill a sphere into the density grid.
 * Uses smooth falloff: density = 1.0 at center, 0 at edge.
 */
function fillSphere(
  grid: BushVoxelGrid,
  cx: number, cy: number, cz: number,
  radius: number
): void {
  const r = Math.ceil(radius);
  const radiusSq = radius * radius;

  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(grid.width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(grid.height - 1, Math.ceil(cy + r));
  const minZ = Math.max(0, Math.floor(cz - r));
  const maxZ = Math.min(grid.depth - 1, Math.ceil(cz + r));

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= radiusSq) {
          const t = 1.0 - Math.sqrt(distSq) / radius;
          grid.addDensity(x, y, z, t);
        }
      }
    }
  }
}

/**
 * 3D box blur applied only to cells in the modified set.
 */
function blurModifiedCells(grid: BushVoxelGrid, modified: Set<number>, passes: number): void {
  const w = grid.width;
  const h = grid.height;
  const d = grid.depth;

  function decode(idx: number): [number, number, number] {
    const y = Math.floor(idx / (w * d));
    const rem = idx - y * w * d;
    const z = Math.floor(rem / w);
    const x = rem - z * w;
    return [x, y, z];
  }

  // Expand to include neighbors
  const expanded = new Set<number>();
  for (const idx of modified) {
    const [x, y, z] = decode(idx);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && nz >= 0 && nz < d) {
            expanded.add(nx + nz * w + ny * w * d);
          }
        }
      }
    }
  }

  const cells = Array.from(expanded);

  for (let pass = 0; pass < passes; pass++) {
    const snapshots = new Map<number, number>();
    for (const idx of cells) {
      const [x, y, z] = decode(idx);
      snapshots.set(idx, grid.getDensity(x, y, z));
    }

    for (const idx of cells) {
      const [x, y, z] = decode(idx);

      let sum = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;

            if (nx >= 0 && nx < w && ny >= 0 && ny < h && nz >= 0 && nz < d) {
              const nIdx = nx + nz * w + ny * w * d;
              sum += snapshots.has(nIdx) ? snapshots.get(nIdx)! : grid.getDensity(nx, ny, nz);
              count++;
            }
          }
        }
      }

      const blurred = sum / count;
      grid.setDensity(x, y, z, blurred < 0.01 ? 0 : blurred);
    }
  }
}

/**
 * Zero out any cell whose density is below the threshold.
 */
function thresholdGrid(grid: BushVoxelGrid, threshold: number): void {
  const w = grid.width;
  const h = grid.height;
  const d = grid.depth;

  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (grid.getDensity(x, y, z) > 0 && grid.getDensity(x, y, z) < threshold) {
          grid.setDensity(x, y, z, 0);
        }
      }
    }
  }
}
