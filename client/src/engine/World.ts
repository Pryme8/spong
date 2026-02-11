/**
 * World - Global environment state singleton.
 * Manages wind, sun direction, time of day, and other world-level properties.
 */

import type { Vector3 } from '@babylonjs/core';

export interface WindData {
  directionX: number;
  directionZ: number;
  speed: number;
  strength: number;
}

export interface SunData {
  directionX: number;
  directionY: number;
  directionZ: number;
  elevation: number;
  azimuth: number;
}

export class World {
  private static instance: World | null = null;

  // Wind state
  wind: WindData = {
    directionX: 1.0,
    directionZ: 0.5,
    speed: 0.3,
    strength: 1.0
  };

  // Sun state
  sun: SunData = {
    directionX: 0.5,
    directionY: 1.0,
    directionZ: 0.3,
    elevation: 45,
    azimuth: 135
  };

  // Time state
  gameTime: number = 0;
  deltaTime: number = 0;
  deltaSeconds: number = 0;

  private constructor() {
    console.log('[World] Created world singleton');
  }

  static getInstance(): World {
    if (!World.instance) {
      World.instance = new World();
    }
    return World.instance;
  }

  static reset(): void {
    if (World.instance) {
      World.instance.gameTime = 0;
      World.instance.deltaTime = 0;
      World.instance.deltaSeconds = 0;
      console.log('[World] Reset world state');
    }
  }

  static dispose(): void {
    World.instance = null;
    console.log('[World] Disposed world singleton');
  }

  /**
   * Update time (call from fixed timestep loop at 60Hz).
   */
  updateTime(deltaTimeSeconds: number): void {
    const deltaMs = deltaTimeSeconds * 1000;
    this.deltaTime = deltaMs;
    this.deltaSeconds = deltaTimeSeconds;
    this.gameTime += deltaTimeSeconds;
  }

  /**
   * Set sun direction from elevation and azimuth angles.
   * Elevation: angle above horizon (0-90 degrees)
   * Azimuth: compass direction (0-360 degrees, 0=North, 90=East)
   */
  setSunFromAngles(elevation: number, azimuth: number): void {
    this.sun.elevation = elevation;
    this.sun.azimuth = azimuth;

    const elevRad = elevation * Math.PI / 180;
    const azimRad = azimuth * Math.PI / 180;

    this.sun.directionX = Math.cos(elevRad) * Math.sin(azimRad);
    this.sun.directionY = Math.sin(elevRad);
    this.sun.directionZ = Math.cos(elevRad) * Math.cos(azimRad);

    console.log(`[World] Sun updated: elevation=${elevation.toFixed(1)}°, azimuth=${azimuth.toFixed(1)}° -> dir=(${this.sun.directionX.toFixed(2)}, ${this.sun.directionY.toFixed(2)}, ${this.sun.directionZ.toFixed(2)})`);
  }

  /**
   * Set sun direction from a Vector3 direction.
   */
  setSunFromDirection(direction: Vector3): void {
    this.sun.directionX = direction.x;
    this.sun.directionY = direction.y;
    this.sun.directionZ = direction.z;

    // Calculate elevation and azimuth from direction
    const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (len > 0.001) {
      const normY = direction.y / len;
      this.sun.elevation = Math.asin(normY) * 180 / Math.PI;
      this.sun.azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
      if (this.sun.azimuth < 0) this.sun.azimuth += 360;
    }
  }

  /**
   * Set wind direction and normalize it.
   */
  setWindDirection(x: number, z: number): void {
    const len = Math.sqrt(x * x + z * z);
    if (len > 0.001) {
      this.wind.directionX = x / len;
      this.wind.directionZ = z / len;
    } else {
      this.wind.directionX = 1.0;
      this.wind.directionZ = 0.0;
    }
  }

  /**
   * Get wind direction as normalized 2D vector.
   */
  getWindDirection(): { x: number; z: number } {
    return {
      x: this.wind.directionX,
      z: this.wind.directionZ
    };
  }

  /**
   * Get sun direction as Vector3-like object.
   */
  getSunDirection(): { x: number; y: number; z: number } {
    return {
      x: this.sun.directionX,
      y: this.sun.directionY,
      z: this.sun.directionZ
    };
  }
}
