/**
 * 3D turtle for procedural tree generation.
 * Maintains position and direction, can move forward and rotate.
 */

export interface TurtleState {
  posX: number;
  posY: number;
  posZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export class Turtle3D {
  posX: number;
  posY: number;
  posZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;

  constructor(x: number, y: number, z: number, dirX = 0, dirY = 1, dirZ = 0) {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
    
    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len > 0.001) {
      this.dirX = dirX / len;
      this.dirY = dirY / len;
      this.dirZ = dirZ / len;
    } else {
      // Default to pointing up
      this.dirX = 0;
      this.dirY = 1;
      this.dirZ = 0;
    }
  }

  /**
   * Move turtle forward by distance.
   * Returns array of intermediate positions for voxel filling.
   */
  forward(distance: number, stepsPerUnit: number = 2): TurtleState[] {
    const steps = Math.max(1, Math.ceil(distance * stepsPerUnit));
    const stepSize = distance / steps;
    const positions: TurtleState[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i * stepSize;
      positions.push({
        posX: this.posX + this.dirX * t,
        posY: this.posY + this.dirY * t,
        posZ: this.posZ + this.dirZ * t,
        dirX: this.dirX,
        dirY: this.dirY,
        dirZ: this.dirZ
      });
    }

    // Update turtle position
    this.posX += this.dirX * distance;
    this.posY += this.dirY * distance;
    this.posZ += this.dirZ * distance;

    return positions;
  }

  /**
   * Rotate around world Y axis (yaw).
   * @param angle Angle in radians
   */
  rotateYaw(angle: number): void {
    if (Math.abs(angle) < 0.001) return; // Skip tiny rotations
    
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    const oldX = this.dirX;
    const oldZ = this.dirZ;
    
    this.dirX = oldX * cos - oldZ * sin;
    this.dirZ = oldX * sin + oldZ * cos;
    
    // Normalize to prevent drift
    this.normalize();
  }

  /**
   * Rotate around local right axis (pitch).
   * Uses Rodrigues' rotation formula.
   * @param angle Angle in radians (positive = pitch up)
   */
  rotatePitch(angle: number): void {
    if (Math.abs(angle) < 0.001) return;
    
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Calculate right vector (perpendicular to direction)
    const xzLen = Math.sqrt(this.dirX * this.dirX + this.dirZ * this.dirZ);
    
    let rightX: number;
    let rightZ: number;
    
    if (xzLen < 0.001) {
      // Pointing straight up or down - use world X axis as right
      // This allows pitching when vertical
      rightX = 1;
      rightZ = 0;
    } else {
      // Right vector perpendicular in XZ plane (rotated 90 degrees)
      rightX = this.dirZ / xzLen;
      rightZ = -this.dirX / xzLen;
    }
    
    // Rodrigues' rotation: rotate direction around right axis
    const v = { x: this.dirX, y: this.dirY, z: this.dirZ };
    
    // k · v
    const kDotV = rightX * v.x + rightZ * v.z;
    
    // k × v (cross product with right axis)
    const crossX = -rightZ * v.y;
    const crossY = rightZ * v.x - rightX * v.z;
    const crossZ = rightX * v.y;
    
    // v' = v*cos + (k×v)*sin + k*(k·v)*(1-cos)
    this.dirX = v.x * cos + crossX * sin + rightX * kDotV * (1 - cos);
    this.dirY = v.y * cos + crossY * sin;
    this.dirZ = v.z * cos + crossZ * sin + rightZ * kDotV * (1 - cos);
    
    this.normalize();
  }

  /**
   * Rotate around local roll axis (not commonly used for trees).
   */
  rotateRoll(_angle: number): void {
    // For trees, we typically don't need roll
    // But included for completeness
    // Rotate around direction vector itself
    // This would twist the turtle - not needed for basic tree gen
  }

  /**
   * Create a copy of this turtle (for branching).
   */
  fork(): Turtle3D {
    return new Turtle3D(this.posX, this.posY, this.posZ, this.dirX, this.dirY, this.dirZ);
  }

  /**
   * Get current position.
   */
  getPosition(): { x: number; y: number; z: number } {
    return { x: this.posX, y: this.posY, z: this.posZ };
  }

  /**
   * Get current direction.
   */
  getDirection(): { x: number; y: number; z: number } {
    return { x: this.dirX, y: this.dirY, z: this.dirZ };
  }

  /**
   * Normalize direction vector to prevent drift from repeated rotations.
   */
  private normalize(): void {
    const len = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY + this.dirZ * this.dirZ);
    if (len > 0.001) {
      this.dirX /= len;
      this.dirY /= len;
      this.dirZ /= len;
    }
  }
}
