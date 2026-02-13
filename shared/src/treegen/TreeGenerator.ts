/**
 * L-System based procedural tree generation.
 * 
 * Uses a string-rewriting L-system with production rules, then interprets
 * the resulting string with a 3D turtle to fill a voxel grid.
 * 
 * Symbols:
 *   T  - Trunk segment (non-branching)
 *   F  - Branch segment (can branch further)
 *   R  - Root segment (grows downward from trunk base)
 *   +  - Rotate yaw positive (+ random deviation)
 *   -  - Rotate yaw negative (+ random deviation)
 *   ^  - Pitch up (+ random deviation)
 *   v  - Pitch down (+ random deviation)
 *   [  - Push state (save position/direction/thickness for branching)
 *   ]  - Pop state (restore saved state)
 *   L  - Place leaf cluster at current position
 *   !  - Reduce thickness
 *   G  - Gravity droop for branches (pitch)
 *   D  - Root gravity droop (pitch downward)
 */

import { SeededRandom } from '../rng.js';
import { Turtle3D } from './Turtle3D.js';
import { TreeVoxelGrid, MATERIAL_WOOD, MATERIAL_LEAF } from './TreeVoxelGrid.js';

/** Deviation controls for organic randomness */
export interface TreeParams {
  /** Base angle for yaw rotations (radians) */
  yawAngle: number;
  /** Random deviation range for yaw (radians) */
  yawDeviation: number;
  /** Base angle for pitch rotations (radians) */
  pitchAngle: number;
  /** Random deviation range for pitch (radians) */
  pitchDeviation: number;
  /** Base forward step length */
  stepLength: number;
  /** Random deviation range for step length */
  stepDeviation: number;
  /** Thickness reduction factor per '!' symbol */
  thicknessDecay: number;
  /** Starting trunk thickness (voxel radius) */
  startThickness: number;
  /** Minimum thickness before stopping */
  minThickness: number;
  /** Number of L-system iterations */
  iterations: number;
  /** Gravity droop angle per 'G' symbol (radians) */
  gravityDroop: number;
  /** Leaf blob base radius */
  leafRadius: number;
  /** Leaf radius random variation (0-1, added/subtracted to leafRadius) */
  leafRadiusVariation: number;
  /** Leaf blob count per L symbol */
  leafBlobs: number;
  
  // Trunk-specific parameters
  /** Number of T segments before first branch */
  trunkSegments: number;
  /** T segments between middle branches */
  trunkMidSegments: number;
  /** T segments at top */
  trunkTopSegments: number;
  /** Step length per T segment (overrides stepLength for trunk) */
  trunkStepLength: number;
  /** Thickness reduction per T segment (1.0 = no taper) */
  trunkTaper: number;
  /** Random rotation per T segment (0 = straight) */
  trunkSway: number;
  /** Twist rotation per T segment (radians, for spiral trunks) */
  trunkTwist: number;
  
  // Root-specific parameters
  /** R segments per root branch */
  rootSegments: number;
  /** Number of root branches around trunk base */
  rootBranches: number;
  /** Downward pull for roots (positive = more down) */
  rootGravityDroop: number;
  
  // Toggle flags
  /** Skip trunk T segments during drawing */
  skipTrunk: boolean;
  /** Skip branch F segments during drawing */
  skipBranches: boolean;
  /** Skip root R segments during drawing */
  skipRoots: boolean;
}

const DEFAULT_PARAMS: TreeParams = {
  yawAngle: 0.975,              // Middle of 0.55-1.4 range
  yawDeviation: 0.375,          // Middle of 0.15-0.6 range
  pitchAngle: 1.0,              // Middle of 0.80-1.2 range
  pitchDeviation: 0.25,         // Middle of 0.10-0.4 range
  stepLength: 0.775,            // Middle of 0.45-1.1 range
  stepDeviation: 0.30,          // Middle of 0.2-0.40 range
  thicknessDecay: 0.65,         // Middle of 0.6-0.70 range
  startThickness: 3.0,          // 3 voxel radius trunk
  minThickness: 0.55,           // Middle of 0.4-0.70 range
  iterations: 2,                // 2 iterations
  gravityDroop: -0.12,          // Moderate droop downward (negative = down)
  leafRadius: 5,                // Leaf blob radius (4-6 range)
  leafRadiusVariation: 0.5,     // Random variation in leaf size (0-1 range)
  leafBlobs: 2,                 // Blobs per cluster (1-4 range, default 2)
  
  // Trunk defaults
  trunkSegments: 15,            // T segments before first branch (middle of 12-18 range)
  trunkMidSegments: 6,          // T segments between branches (middle of 4-9 range)
  trunkTopSegments: 5,          // T segments at top (middle of 4-6 range)
  trunkStepLength: 1.0,         // Middle of 0.8-1.25 range
  trunkTaper: 0.97,             // Middle of 0.96-0.98 range
  trunkSway: 0.0,               // Straight trunk (0-1 range)
  trunkTwist: 0.0,              // No twist by default (-0.5 to 0.5 range)
  
  // Root defaults
  rootSegments: 3,              // Medium length roots (1-6 range)
  rootBranches: 4,              // 4 roots around trunk (2-6 range)
  rootGravityDroop: 0.60,       // Middle of 0.50-0.70 range
  
  // Toggles (all on by default)
  skipTrunk: false,
  skipBranches: false,
  skipRoots: false,
};

/**
 * L-system production rules.
 * Each rule maps a symbol to its replacement string.
 */
interface ProductionRule {
  from: string;
  to: string;
  probability: number; // 0-1, for stochastic rules
}

export interface DebugSegment {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  thickness: number;
}

export class TreeGenerator {
  private rng: SeededRandom;
  private grid: TreeVoxelGrid;
  private params: TreeParams;
  private skipLeaves: boolean;
  public debugSegments: DebugSegment[] = [];

  constructor(seed: string, grid: TreeVoxelGrid, params?: Partial<TreeParams>, skipLeaves = false) {
    this.rng = new SeededRandom(seed);
    this.grid = grid;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.skipLeaves = skipLeaves;
  }

  /**
   * Generate a full tree in the voxel grid.
   */
  generate(): void {
    // Step 1: Build L-system string
    const lString = this.buildLString();

    // Step 2: Interpret the string with a 3D turtle
    this.interpretLString(lString);
  }

  /**
   * Build the L-system string through iterative rewriting.
   */
  private buildLString(): string {
    // Build root branches (grow down from trunk base)
    const singleRoot = 'R'.repeat(this.params.rootSegments);
    const rootBranches: string[] = [];
    
    for (let i = 0; i < this.params.rootBranches; i++) {
      // Each root: save state, pitch down slightly, rotate yaw to spread, draw root, restore
      // Single 'v' for gentle start, rootGravityDroop controls the curve
      const yawSymbol = '+'.repeat(i * 2); // Spread roots in yaw (0°, 90°, 180°, 270°)
      rootBranches.push(`[!v${yawSymbol}D${singleRoot}]`);
    }
    
    const rootPattern = rootBranches.join('');
    
    // Build trunk segments
    const baseTrunk = 'TT'; // Base trunk fills Y=0-2 gap under roots
    const trunk1 = 'T'.repeat(this.params.trunkSegments);
    const trunk2 = 'T'.repeat(this.params.trunkMidSegments);
    const trunk3 = 'T'.repeat(this.params.trunkTopSegments);
    
    // Axiom pattern: base trunk -> roots -> main trunk -> branches -> trunk -> branches -> trunk -> branches
    let current = `${baseTrunk}${rootPattern}${trunk1}[!v+FF][!v-FF][!^+FF]${trunk2}[!v++FF][!v--FF]${trunk3}[!^FF]`;
    
    const rules = this.getProductionRules();
    
    for (let iter = 0; iter < this.params.iterations; iter++) {
      let next = '';
      for (let i = 0; i < current.length; i++) {
        const ch = current[i];
        const replaced = this.applyRules(ch, rules);
        next += replaced;
      }
      current = next;
    }
    
    return current;
  }

  /**
   * Get the production rules for this tree type.
   * Stochastic rules give natural variety.
   * CRITICAL: Apply pitch (^/v) BEFORE yaw (+/-) to tilt away from vertical first!
   * Oak tree style: T=trunk (non-branching), F=branches
   */
  private getProductionRules(): ProductionRule[] {
    return [
      // T (trunk) -> stays as trunk, doesn't branch
      {
        from: 'T',
        to: 'T',
        probability: 1.0,
      },
      // F (branch forward) -> grow longer and add leaves at tips
      // Rule 1: Just extend the branch (most common) - add gravity droop
      {
        from: 'F',
        to: 'FGFF',
        probability: 0.50,
      },
      // Rule 2: Branch splits with leaves at ends
      {
        from: 'F',
        to: 'FGF[!v+FFL][!v-FFL]',
        probability: 0.20,
      },
      // Rule 3: Single sub-branch with leaves
      {
        from: 'F',
        to: 'FGFF[!v++FL]',
        probability: 0.15,
      },
      // Rule 4: Grow and terminate with leaves
      {
        from: 'F',
        to: 'FGFFL',
        probability: 0.15,
      },
      // Leaf clusters stay as-is
      {
        from: 'L',
        to: 'L',
        probability: 1.0,
      },
      // R (root) -> extend with gravity droop
      {
        from: 'R',
        to: 'RDR',
        probability: 1.0,
      },
    ];
  }

  /**
   * Apply production rules to a single character.
   */
  private applyRules(ch: string, rules: ProductionRule[]): string {
    // Find applicable rules
    const applicable = rules.filter(r => r.from === ch);
    if (applicable.length === 0) return ch;
    
    // Stochastic selection
    const roll = this.rng.next();
    let cumulative = 0;
    for (const rule of applicable) {
      cumulative += rule.probability;
      if (roll < cumulative) {
        return rule.to;
      }
    }
    
    // Fallback to last rule
    return applicable[applicable.length - 1].to;
  }

  /**
   * Interpret the L-system string with a 3D turtle.
   */
  private interpretLString(lString: string): void {
    // Start at bottom center, pointing up
    const startX = this.grid.width * 0.5;
    const startY = 2; // Small pad from bottom
    const startZ = this.grid.depth * 0.5;
    
    const turtle = new Turtle3D(startX, startY, startZ, 0, 1, 0);
    let thickness = this.params.startThickness;
    
    // State stack for [ ] branching
    const stateStack: { turtle: Turtle3D; thickness: number }[] = [];
    
    let fDrawn = 0;
    let fSkipped = 0;
    let branchCount = 0;
    let minThicknessEncountered = thickness;
    let maxThicknessEncountered = thickness;
    let yawRotations = 0;
    let pitchRotations = 0;
    
    for (let i = 0; i < lString.length; i++) {
      const ch = lString[i];
      
      // Track thickness range
      minThicknessEncountered = Math.min(minThicknessEncountered, thickness);
      maxThicknessEncountered = Math.max(maxThicknessEncountered, thickness);
      
      switch (ch) {
        case 'T': {
          // Trunk segment (non-branching)
          if (this.params.skipTrunk || thickness < this.params.minThickness) {
            break;
          }
          
          // Record start position for debug
          const startX = turtle.posX;
          const startY = turtle.posY;
          const startZ = turtle.posZ;
          
          // Apply trunk-specific step length
          const step = this.params.trunkStepLength + this.rng.range(-this.params.stepDeviation, this.params.stepDeviation);
          
          // Apply trunk sway (small random rotation for organic look)
          if (this.params.trunkSway > 0) {
            const swayYaw = this.rng.range(-this.params.trunkSway, this.params.trunkSway);
            const swayPitch = this.rng.range(-this.params.trunkSway * 0.5, this.params.trunkSway * 0.5);
            turtle.rotateYaw(swayYaw);
            turtle.rotatePitch(swayPitch);
          }
          
          // Apply trunk twist (cumulative rotation for spiral effect)
          if (this.params.trunkTwist !== 0) {
            turtle.rotateYaw(this.params.trunkTwist);
          }
          
          const path = turtle.forward(Math.max(1, step), 2);
          
          // Record debug segment
          this.debugSegments.push({
            startX,
            startY,
            startZ,
            endX: turtle.posX,
            endY: turtle.posY,
            endZ: turtle.posZ,
            thickness
          });
          
          // Draw trunk wood
          for (const pos of path) {
            this.grid.fillCylinder(pos.posX, pos.posY, pos.posZ, thickness, MATERIAL_WOOD);
          }
          
          // Apply trunk taper
          thickness *= this.params.trunkTaper;
          break;
        }
        
        case 'F': {
          // Branch segment (can branch further)
          if (this.params.skipBranches || thickness < this.params.minThickness) {
            fSkipped++;
            break;
          }
          
          fDrawn++;
          
          // Record start position for debug
          const startX = turtle.posX;
          const startY = turtle.posY;
          const startZ = turtle.posZ;
          
          const step = this.params.stepLength + this.rng.range(-this.params.stepDeviation, this.params.stepDeviation);
          const path = turtle.forward(Math.max(1, step), 2);
          
          // Record debug segment
          this.debugSegments.push({
            startX,
            startY,
            startZ,
            endX: turtle.posX,
            endY: turtle.posY,
            endZ: turtle.posZ,
            thickness
          });
          
          // Draw branch wood
          for (const pos of path) {
            this.grid.fillCylinder(pos.posX, pos.posY, pos.posZ, thickness, MATERIAL_WOOD);
          }
          break;
        }
        
        case '+': {
          // Yaw positive with deviation
          yawRotations++;
          const angle = this.params.yawAngle + this.rng.range(-this.params.yawDeviation, this.params.yawDeviation);
          turtle.rotateYaw(angle);
          break;
        }
        
        case '-':   // regular minus
        case '−': { // en-dash minus (from string literal)
          // Yaw negative with deviation
          yawRotations++;
          const angle = -(this.params.yawAngle + this.rng.range(-this.params.yawDeviation, this.params.yawDeviation));
          turtle.rotateYaw(angle);
          break;
        }
        
        case '^': {
          // Pitch up with deviation
          pitchRotations++;
          const angle = this.params.pitchAngle + this.rng.range(-this.params.pitchDeviation, this.params.pitchDeviation);
          turtle.rotatePitch(angle);
          if (pitchRotations <= 3) {

          }
          break;
        }
        
        case 'v': {
          // Pitch down with deviation
          pitchRotations++;
          const angle = -(this.params.pitchAngle + this.rng.range(-this.params.pitchDeviation, this.params.pitchDeviation));
          turtle.rotatePitch(angle);
          break;
        }
        
        case '[': {
          // Push state
          branchCount++;
          stateStack.push({
            turtle: turtle.fork(),
            thickness: thickness
          });
          break;
        }
        
        case ']': {
          // Pop state
          const state = stateStack.pop();
          if (state) {
            turtle.posX = state.turtle.posX;
            turtle.posY = state.turtle.posY;
            turtle.posZ = state.turtle.posZ;
            turtle.dirX = state.turtle.dirX;
            turtle.dirY = state.turtle.dirY;
            turtle.dirZ = state.turtle.dirZ;
            thickness = state.thickness;
          }
          break;
        }
        
        case '!': {
          // Reduce thickness
          thickness *= this.params.thicknessDecay;
          break;
        }
        
        case 'G': {
          // Gravity droop - pitch branches (positive = down, negative = up)
          turtle.rotatePitch(this.params.gravityDroop);
          break;
        }
        
        case 'D': {
          // Root gravity droop - pitch downward for roots
          turtle.rotatePitch(this.params.rootGravityDroop);
          break;
        }
        
        case 'R': {
          // Root segment (grows downward from trunk base)
          if (this.params.skipRoots || thickness < this.params.minThickness) {
            break;
          }
          
          const startX = turtle.posX;
          const startY = turtle.posY;
          const startZ = turtle.posZ;
          
          // Use trunk step length for roots (thicker, more solid)
          const step = this.params.trunkStepLength + this.rng.range(-this.params.stepDeviation, this.params.stepDeviation);
          const path = turtle.forward(Math.max(1, step), 2);
          
          // Record debug segment
          this.debugSegments.push({
            startX,
            startY,
            startZ,
            endX: turtle.posX,
            endY: turtle.posY,
            endZ: turtle.posZ,
            thickness
          });
          
          // Draw root as wood (same as trunk/branches)
          for (const pos of path) {
            this.grid.fillCylinder(pos.posX, pos.posY, pos.posZ, thickness, MATERIAL_WOOD);
          }
          break;
        }
        
        case 'L': {
          // Place leaf cluster (skip if disabled, or too thick for leaves)
          const skipLeaves = this.skipLeaves || (this.params as any).skipLeaves;
          if (!skipLeaves && thickness < this.params.startThickness * 0.5) {
            // Only place leaves on thinner branches (not trunk)
            this.placeLeafCluster(turtle.posX, turtle.posY, turtle.posZ);
          }
          break;
        }
      }
    }
    
    // Log interpretation statistics

  }

  /**
   * Place a billowy cluster of leaf spheres at a position.
   * Multiple overlapping ellipsoids create a full, organic look.
   */
  private placeLeafCluster(cx: number, cy: number, cz: number): void {
    const blobCount = this.params.leafBlobs + this.rng.int(-1, 2);
    const baseR = this.params.leafRadius;
    const variation = this.params.leafRadiusVariation;
    
    for (let i = 0; i < blobCount; i++) {
      // Random offset from center for billowy appearance
      const offsetX = this.rng.range(-baseR * 0.4, baseR * 0.4);
      const offsetY = this.rng.range(-baseR * 0.3, baseR * 0.3);
      const offsetZ = this.rng.range(-baseR * 0.4, baseR * 0.4);
      
      // Randomized radii using leafRadiusVariation parameter
      const radiusX = baseR + this.rng.range(-variation, variation);
      const radiusY = baseR * 0.75 + this.rng.range(-variation, variation);
      const radiusZ = baseR + this.rng.range(-variation, variation);
      
      this.grid.fillSphere(
        cx + offsetX,
        cy + offsetY,
        cz + offsetZ,
        Math.max(1, radiusX),
        Math.max(1, radiusY),
        Math.max(1, radiusZ),
        MATERIAL_LEAF
      );
    }
  }
}

export interface TreeGenerationResult {
  grid: TreeVoxelGrid;
  debugSegments: DebugSegment[];
}

/**
 * Helper function to generate a tree from a seed.
 * Returns the filled voxel grid and debug segments.
 */
/**
 * Hash a seed string to a number for deterministic random checks.
 */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function generateTree(seed: string, params?: Partial<TreeParams>, skipLeaves = false): TreeGenerationResult {
  // 10% chance of leafless tree (deterministic based on seed)
  const seedHash = hashSeed(seed);
  const leaflessChance = (seedHash % 100) < 10; // 10% probability
  
  if (leaflessChance && !skipLeaves) {

    skipLeaves = true;
  }
  
  const grid = new TreeVoxelGrid();
  const generator = new TreeGenerator(seed, grid, params, skipLeaves);
  generator.generate();
  return {
    grid,
    debugSegments: generator.debugSegments
  };
}
