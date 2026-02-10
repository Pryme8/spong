/**
 * Procedural cloud generator.
 *
 * Algorithm:
 * 1. Place 8-30 random spheres (radius 12-30) ensuring a dynamic edge buffer
 *    of 1.5x each sphere's radius from all grid boundaries.
 * 2. Clear every cell below Y = CLOUD_FLOOR_Y (12).
 * 3. Identify the "rim" — solid cells sitting directly at Y = CLOUD_FLOOR_Y.
 * 4. Inflate the rim: each rim cell and the 3 cells above it "leak" their
 *    density into the cells below and to the X/Z neighbors (not upward).
 *    The original cell keeps its starting value; only neighbors gain.
 *    Repeat this inflation pass 3 times to puff out the bottom.
 */

import { SeededRandom } from '../rng.js';
import { CloudVoxelGrid, CLOUD_GRID_W, CLOUD_GRID_H, CLOUD_GRID_D, CLOUD_FLOOR_Y } from './CloudVoxelGrid.js';

// Sphere placement parameters
const MIN_SPHERES = 8;
const MAX_SPHERES = 30;
const MIN_RADIUS = 5;
const MAX_RADIUS = 11;
const EDGE_BUFFER_MULT = 1.5; // Each sphere must be this * its radius from edges

// Inflation parameters
const INFLATE_PASSES = 5;
const INFLATE_HEIGHT = 5; // How many cells above the rim participate
const INFLATE_LEAK_FACTOR = 0.3; // Fraction of density that leaks per pass

// Blur parameters
const BLUR_PASSES = 2;
const BLUR_EXTEND_Y = 9; // Blur this many units above the highest inflated cell
const SURFACE_THRESHOLD = 0.18; // After blur, cells below this density are erased

interface SpherePoint {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

/**
 * Generate a cloud voxel grid from a seed string.
 */
export function generateCloud(seed: string): CloudVoxelGrid {
  const rng = new SeededRandom(seed);
  const grid = new CloudVoxelGrid();

  // ── Step 1: Place random spheres ───────────────────────────
  const sphereCount = rng.int(MIN_SPHERES, MAX_SPHERES);
  const spheres: SpherePoint[] = [];

  for (let i = 0; i < sphereCount; i++) {
    const radius = rng.range(MIN_RADIUS, MAX_RADIUS);
    const buffer = radius * EDGE_BUFFER_MULT;

    // Position within safe bounds
    const cx = rng.range(buffer, CLOUD_GRID_W - buffer);
    const cy = rng.range(buffer, CLOUD_GRID_H - buffer);
    const cz = rng.range(buffer, CLOUD_GRID_D - buffer);

    spheres.push({ cx, cy, cz, radius });

    // Fill sphere into density grid
    fillSphere(grid, cx, cy, cz, radius);
  }

  console.log(`[CloudGen] Placed ${sphereCount} spheres`);

  // ── Step 2: Clear everything below CLOUD_FLOOR_Y ───────────
  grid.clearBelowY(CLOUD_FLOOR_Y);

  // ── Step 3: Identify rim cells at Y = CLOUD_FLOOR_Y ────────
  // These are solid cells at the floor boundary.
  // Also collect cells up to INFLATE_HEIGHT above the rim.
  // We'll inflate from these source cells.

  // ── Step 4: Inflate bottom rim ─────────────────────────────
  // Track every cell modified by inflation so we can blur them after
  const modifiedCells = new Set<number>();

  for (let pass = 0; pass < INFLATE_PASSES; pass++) {
    inflateBottom(grid, modifiedCells);
  }

  // Also include all solid source cells in the inflation zone itself
  // (inflateBottom only tracks where density was *added*, not the sources)
  const w = grid.width;
  const d = grid.depth;
  const sourceMaxY = Math.min(CLOUD_FLOOR_Y + INFLATE_HEIGHT, grid.height - 1);
  for (let y = 0; y <= sourceMaxY; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          modifiedCells.add(x + z * w + y * w * d);
        }
      }
    }
  }

  console.log(`[CloudGen] Inflation region: ${modifiedCells.size} cells`);

  // ── Step 5: Extend blur region upward ──────────────────────
  // Also blur solid cells up to BLUR_EXTEND_Y above the highest inflated cell
  // to smooth the transition between inflated bottom and original spheres.
  extendBlurRegion(grid, modifiedCells, BLUR_EXTEND_Y);

  console.log(`[CloudGen] Blur region: ${modifiedCells.size} cells`);

  // ── Step 6: Blur pass over modified + extended cells ───────
  blurModifiedCells(grid, modifiedCells, BLUR_PASSES);

  // ── Step 7: Threshold pass ─────────────────────────────────
  // The blur created smooth density gradients at boundaries.
  // Now cut through that gradient: anything below the threshold
  // becomes empty, revealing the soft rounded contour underneath.
  thresholdGrid(grid, SURFACE_THRESHOLD);

  const solidCount = grid.getSolidCount();
  console.log(`[CloudGen] Final solid voxels: ${solidCount}`);

  return grid;
}

/**
 * Fill a sphere into the density grid.
 * Uses smooth falloff: density = 1.0 at center, 0 at edge.
 */
function fillSphere(
  grid: CloudVoxelGrid,
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
          // Smooth falloff: 1.0 at center, 0.0 at edge
          const t = 1.0 - Math.sqrt(distSq) / radius;
          // Add rather than set, so overlapping spheres accumulate
          grid.addDensity(x, y, z, t);
        }
      }
    }
  }
}

/**
 * Extend the blur region upward from the highest modified cells.
 * Adds all solid cells up to `extendY` units above the inflation zone
 * so the blur smooths the seam between inflated bottom and original spheres.
 */
function extendBlurRegion(grid: CloudVoxelGrid, modified: Set<number>, extendY: number): void {
  const w = grid.width;
  const d = grid.depth;
  const h = grid.height;

  // Find the highest Y in the modified set
  let maxY = 0;
  for (const idx of modified) {
    const y = Math.floor(idx / (w * d));
    if (y > maxY) maxY = y;
  }

  // Add all solid cells from maxY+1 up to maxY+extendY
  const topY = Math.min(maxY + extendY, h - 1);
  for (let y = maxY + 1; y <= topY; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (grid.getDensity(x, y, z) > 0) {
          modified.add(x + z * w + y * w * d);
        }
      }
    }
  }
}

/**
 * Single inflation pass: for every solid cell at and just above the floor,
 * leak density downward and outward (X/Z) without reducing the source cell.
 * Records all modified cell indices into the provided set.
 */
function inflateBottom(grid: CloudVoxelGrid, modified: Set<number>): void {
  const w = grid.width;
  const h = grid.height;
  const d = grid.depth;

  const sourceMinY = CLOUD_FLOOR_Y;
  const sourceMaxY = Math.min(CLOUD_FLOOR_Y + INFLATE_HEIGHT, h - 1);

  const additions: Array<{ x: number; y: number; z: number; value: number }> = [];

  for (let y = sourceMinY; y <= sourceMaxY; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const density = grid.getDensity(x, y, z);
        if (density <= 0) continue;

        const leak = density * INFLATE_LEAK_FACTOR;

        // Leak downward (y - 1) — full leak
        if (y > 0) {
          additions.push({ x, y: y - 1, z, value: leak });
        }

        // Leak upward (y + 1) — only into already-solid cells
        if (y < h - 1 && grid.getDensity(x, y + 1, z) > 0) {
          additions.push({ x, y: y + 1, z, value: leak * 0.5 });
        }

        // Leak to X/Z neighbors — half the downward amount
        if (x > 0) additions.push({ x: x - 1, y, z, value: leak * 0.5 });
        if (x < w - 1) additions.push({ x: x + 1, y, z, value: leak * 0.5 });
        if (z > 0) additions.push({ x, y, z: z - 1, value: leak * 0.5 });
        if (z < d - 1) additions.push({ x, y, z: z + 1, value: leak * 0.5 });
      }
    }
  }

  // Apply and track
  for (const add of additions) {
    grid.addDensity(add.x, add.y, add.z, add.value);
    modified.add(add.x + add.z * w + add.y * w * d);
  }
}

/**
 * 3D box blur applied only to cells in the modified set.
 * Averages each cell with its 26 neighbors (3x3x3 kernel).
 * Repeats for `passes` iterations to progressively smooth.
 *
 * Cells that end up below a small threshold after blurring are zeroed
 * out so the cloud surface doesn't gain a thin halo of near-zero voxels.
 */
function blurModifiedCells(grid: CloudVoxelGrid, modified: Set<number>, passes: number): void {
  const w = grid.width;
  const h = grid.height;
  const d = grid.depth;

  // Decode packed index back to x, y, z
  function decode(idx: number): [number, number, number] {
    const y = Math.floor(idx / (w * d));
    const rem = idx - y * w * d;
    const z = Math.floor(rem / w);
    const x = rem - z * w;
    return [x, y, z];
  }

  // Expand the modified set to include neighbors (blur reads from neighbors)
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

  // Convert to array for iteration
  const cells = Array.from(expanded);

  for (let pass = 0; pass < passes; pass++) {
    // Snapshot current values for cells we'll blur
    const snapshots = new Map<number, number>();
    for (const idx of cells) {
      const [x, y, z] = decode(idx);
      snapshots.set(idx, grid.getDensity(x, y, z));
    }

    // For each cell, average with its 3x3x3 neighborhood
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
              // Use snapshot if available (modified region), otherwise read grid
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
 * This carves away the thin low-density fringe that inflation/blur left,
 * revealing the smooth contour created by the density gradient.
 */
function thresholdGrid(grid: CloudVoxelGrid, threshold: number): void {
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
