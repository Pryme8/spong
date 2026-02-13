/**
 * Interface for game systems that can be registered with the game loop.
 * Enables pluggable, modular system architecture (ECS-style).
 */
export interface IGameSystem {
  /**
   * Fixed timestep update for physics and deterministic simulation.
   * @param dt Delta time in seconds (typically FIXED_TIMESTEP = 1/60)
   */
  fixedUpdate?(dt: number): void;

  /**
   * Variable frame rate update for rendering and interpolation.
   * @param deltaTime Delta time in seconds since last frame
   */
  update?(deltaTime: number): void;

  /**
   * Cleanup when the system is destroyed.
   */
  dispose?(): void;
}
