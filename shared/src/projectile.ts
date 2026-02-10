import { ProjectileComponent } from './components/index.js';
import { PROJECTILE } from './physicsConstants.js';

/**
 * Shared deterministic projectile stepping with distance-based gravity.
 * Called at fixed timestep by both client and server.
 * Mutates the component in place.
 */
export function stepProjectile(proj: ProjectileComponent, dt: number): void {
  // Horizontal movement
  const dx = proj.dirX * proj.speed * dt;
  const dz = proj.dirZ * proj.speed * dt;
  proj.posX += dx;
  proj.posZ += dz;
  
  // Track distance traveled first (for damage falloff and gravity check)
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  proj.distanceTraveled += horizontalDist;
  
  // Vertical movement with distance-based gravity
  proj.posY += proj.velY * dt;
  
  // Only apply gravity after traveling the minimum distance
  if (proj.distanceTraveled >= proj.gravityStartDistance) {
    proj.velY += PROJECTILE.GRAVITY * dt;
  }
  
  proj.lifetime -= dt;
}
