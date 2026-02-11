/**
 * Blood splatter effect - generates dynamic textures with procedural blood splatters
 * for damage notification visualization.
 */

import { Scene, DynamicTexture } from '@babylonjs/core';

/**
 * Seeded random number generator for deterministic results.
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  random(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random(min, max + 1));
  }
}

export class BloodSplatterEffect {
  private scene: Scene;
  private colorTexture: DynamicTexture;
  private maskTexture: DynamicTexture;
  private colorCtx: CanvasRenderingContext2D;
  private maskCtx: CanvasRenderingContext2D;
  private rng: SeededRandom;
  private readonly textureSize = 1024;

  constructor(scene: Scene) {
    this.scene = scene;
    this.rng = new SeededRandom(Date.now());

    // Create dynamic textures
    this.colorTexture = new DynamicTexture('bloodSplatterColor', this.textureSize, this.scene, false);
    this.maskTexture = new DynamicTexture('bloodSplatterMask', this.textureSize, this.scene, false);

    this.colorCtx = this.colorTexture.getContext() as CanvasRenderingContext2D;
    this.maskCtx = this.maskTexture.getContext() as CanvasRenderingContext2D;

    // Initialize with transparent/black backgrounds
    this.clearTextures();
  }

  /**
   * Clear both textures.
   */
  clearTextures(): void {
    // Clear color texture to transparent
    this.colorCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    this.colorCtx.clearRect(0, 0, this.textureSize, this.textureSize);

    // Clear mask texture to black
    this.maskCtx.fillStyle = '#000000';
    this.maskCtx.fillRect(0, 0, this.textureSize, this.textureSize);

    this.colorTexture.update();
    this.maskTexture.update();
  }

  /**
   * Apply a blur pass to existing splatters.
   * This creates a layering effect where old blood is blurred and new blood is sharp.
   */
  blurExistingSplatters(): void {
    // Blur color texture
    this.colorCtx.filter = 'blur(3px)';
    this.colorCtx.drawImage(this.colorCtx.canvas, 0, 0);
    this.colorCtx.filter = 'none';

    // Blur mask texture
    this.maskCtx.filter = 'blur(3px)';
    this.maskCtx.drawImage(this.maskCtx.canvas, 0, 0);
    this.maskCtx.filter = 'none';

    // Update GPU textures
    this.colorTexture.update();
    this.maskTexture.update();
  }

  /**
   * Add random blood splatters to the textures.
   */
  addSplatters(count: number): void {
    const styles = ['radial', 'droplet', 'spray'];

    // Multiply count to spawn way more splatters
    const totalSplatters = count * 5; // 5-15 splatters per hit (was 1-3)

    for (let i = 0; i < totalSplatters; i++) {
      // Create unique seed for this splatter
      const seed = Date.now() + i * 1000 + Math.random() * 10000;
      this.rng = new SeededRandom(seed);

      // Randomize splatter properties with more variation
      const styleIndex = Math.floor(Math.random() * 3); // Use Math.random for true randomness
      const style = styles[styleIndex];
      const size = this.rng.random(60, 280);
      const intensity = this.rng.random(0.4, 1.0);
      const dropletCount = this.rng.randomInt(25, 70);

      // Random position with overdraw (-50 to textureSize+50 for edge coverage)
      // This allows splatters to spawn partially off-screen for better coverage
      const overdraw = 50;
      const x = this.rng.random(-overdraw, this.textureSize + overdraw);
      const y = this.rng.random(-overdraw, this.textureSize + overdraw);

      // Draw to color canvas
      this.rng = new SeededRandom(seed);
      switch (style) {
        case 'radial':
          this.drawRadialSplatter(this.colorCtx, x, y, size, intensity, dropletCount, false);
          break;
        case 'droplet':
          this.drawDropletCluster(this.colorCtx, x, y, size, intensity, dropletCount, false);
          break;
        case 'spray':
          this.drawSprayPattern(this.colorCtx, x, y, size, intensity, dropletCount, false);
          break;
      }

      // Draw to mask canvas (reset RNG with same seed)
      this.rng = new SeededRandom(seed);
      switch (style) {
        case 'radial':
          this.drawRadialSplatter(this.maskCtx, x, y, size, intensity, dropletCount, true);
          break;
        case 'droplet':
          this.drawDropletCluster(this.maskCtx, x, y, size, intensity, dropletCount, true);
          break;
        case 'spray':
          this.drawSprayPattern(this.maskCtx, x, y, size, intensity, dropletCount, true);
          break;
      }
    }

    // Update GPU textures
    this.colorTexture.update();
    this.maskTexture.update();
  }

  /**
   * Get the color texture.
   */
  getColorTexture(): DynamicTexture {
    return this.colorTexture;
  }

  /**
   * Get the mask texture.
   */
  getMaskTexture(): DynamicTexture {
    return this.maskTexture;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.colorTexture.dispose();
    this.maskTexture.dispose();
  }

  // ========== Color Generation ==========

  private getBloodColor(opacity: number, isMask: boolean): string {
    if (isMask) return `rgba(255, 255, 255, ${opacity})`;
    const red = this.rng.randomInt(120, 180);
    const green = this.rng.randomInt(0, 20);
    const blue = this.rng.randomInt(0, 10);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  private getDarkBloodColor(opacity: number, isMask: boolean): string {
    if (isMask) return `rgba(255, 255, 255, ${opacity})`;
    const red = this.rng.randomInt(80, 120);
    const green = this.rng.randomInt(0, 10);
    const blue = this.rng.randomInt(0, 5);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  // ========== Drawing Functions ==========

  private drawIrregularBlob(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
  ): void {
    context.save();
    context.beginPath();

    const points = 20;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const variation = this.rng.random(0.7, 1.1);
      const r = radius * variation;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;

      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }

    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  private drawDroplet(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    opacity: number,
    isMask: boolean
  ): void {
    const gradient = context.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
    gradient.addColorStop(0, this.getBloodColor(opacity, isMask));
    gradient.addColorStop(0.7, this.getDarkBloodColor(opacity * 0.8, isMask));
    gradient.addColorStop(1, this.getDarkBloodColor(opacity * 0.3, isMask));

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = gradient;
    context.fill();
  }

  private drawRadialSplatter(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    intensity: number,
    dropletCount: number,
    isMask: boolean
  ): void {
    // Randomize main splatter body sizes
    const outerSize = size * this.rng.random(0.55, 0.65);
    const innerSize = size * this.rng.random(0.35, 0.45);

    this.drawIrregularBlob(context, x, y, outerSize, this.getDarkBloodColor(intensity, isMask));
    this.drawIrregularBlob(
      context,
      x,
      y,
      innerSize,
      this.getBloodColor(intensity * this.rng.random(0.85, 0.95), isMask)
    );

    // Radiating streaks - randomized count and spacing
    const streakCount = this.rng.randomInt(10, 20);
    const angleOffset = this.rng.random(0, Math.PI * 2);
    const skipChance = this.rng.random(0.1, 0.3);

    for (let i = 0; i < streakCount; i++) {
      if (this.rng.next() < skipChance) continue;

      const angle = angleOffset + (i * (Math.PI * 2)) / streakCount + this.rng.random(-0.15, 0.15);
      const length = this.rng.random(size * 0.35, size * 0.85);
      const startWidth = this.rng.random(0.3, 1.8);
      const endWidth = this.rng.random(2.5, 6.5);

      const endX = Math.cos(angle) * length;
      const endY = Math.sin(angle) * length;

      context.save();

      const gradient = context.createLinearGradient(x, y, x + endX, y + endY);
      const midPoint = this.rng.random(0.5, 0.7);
      gradient.addColorStop(0, this.getDarkBloodColor(intensity * this.rng.random(0.6, 0.8), isMask));
      gradient.addColorStop(midPoint, this.getBloodColor(intensity * this.rng.random(0.4, 0.6), isMask));
      gradient.addColorStop(1, this.getBloodColor(0, isMask));

      context.beginPath();
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);
      context.moveTo(x + perpX * startWidth * 0.5, y + perpY * startWidth * 0.5);
      context.lineTo(x - perpX * startWidth * 0.5, y - perpY * startWidth * 0.5);
      context.lineTo(x + endX + perpX * endWidth * 0.5, y + endY + perpY * endWidth * 0.5);
      context.lineTo(x + endX - perpX * endWidth * 0.5, y + endY - perpY * endWidth * 0.5);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      context.restore();

      // Droplet at end of streak
      const dropletThreshold = this.rng.random(0.3, 0.5);
      if (this.rng.next() > dropletThreshold) {
        const dx = x + endX;
        const dy = y + endY;
        const dropletRadius = this.rng.random(1.5, 4.5);
        const dropletOpacity = intensity * this.rng.random(0.5, 0.7);
        this.drawDroplet(context, dx, dy, dropletRadius, dropletOpacity, isMask);
      }
    }

    // Scattered droplets radiating in all directions
    const actualDropletCount = this.rng.randomInt(
      Math.floor(dropletCount * 0.7),
      Math.ceil(dropletCount * 1.3)
    );
    for (let i = 0; i < actualDropletCount; i++) {
      const angle = (i * (Math.PI * 2)) / actualDropletCount + this.rng.random(-0.4, 0.4);
      const distance = this.rng.random(size * 0.5, size * 1.3);
      const dx = x + Math.cos(angle) * distance;
      const dy = y + Math.sin(angle) * distance;
      const radius = this.rng.random(0.5, 3.5) * (1 - distance / (size * 1.5));
      this.drawDroplet(context, dx, dy, radius, intensity * this.rng.random(0.3, 0.9), isMask);
    }
  }

  private drawDropletCluster(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    intensity: number,
    dropletCount: number,
    isMask: boolean
  ): void {
    // Central large splat with randomized size
    this.drawIrregularBlob(
      context,
      x,
      y,
      size * this.rng.random(0.35, 0.5),
      this.getDarkBloodColor(intensity, isMask)
    );

    // Cluster of various sized droplets
    const actualCount = this.rng.randomInt(Math.floor(dropletCount * 1.2), Math.ceil(dropletCount * 1.8));
    const maxDistance = size * this.rng.random(1.3, 1.7);
    const falloffPower = this.rng.random(0.4, 0.6);

    for (let i = 0; i < actualCount; i++) {
      const angle = this.rng.random(0, Math.PI * 2);
      const distance = this.rng.random(0, maxDistance) * Math.pow(this.rng.next(), falloffPower);
      const dx = x + Math.cos(angle) * distance;
      const dy = y + Math.sin(angle) * distance;
      const radius = this.rng.random(1.5, 9) * (1 - distance / maxDistance);

      this.drawDroplet(context, dx, dy, radius, intensity * this.rng.random(0.5, 1.0), isMask);
    }
  }

  private drawSprayPattern(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    intensity: number,
    dropletCount: number,
    isMask: boolean
  ): void {
    const direction = this.rng.random(0, Math.PI * 2);
    const spread = this.rng.random(1.0, 1.4);
    const density = this.rng.random(1.8, 2.3);

    // Fine mist of tiny droplets
    const mistCount = Math.floor(dropletCount * density);
    for (let i = 0; i < mistCount; i++) {
      const spreadAngle = this.rng.random(direction - spread, direction + spread);
      const falloff = this.rng.random(0.25, 0.35);
      const distance = this.rng.random(size * 0.4, size * 3.2) * Math.pow(this.rng.next(), falloff);
      const dx = x + Math.cos(spreadAngle) * distance;
      const dy = y + Math.sin(spreadAngle) * distance;
      const radius = this.rng.random(0.4, 2.8);

      this.drawDroplet(context, dx, dy, radius, intensity * this.rng.random(0.2, 0.7), isMask);
    }

    // Some larger droplets mixed in
    const largeCount = this.rng.randomInt(Math.floor(dropletCount * 0.2), Math.ceil(dropletCount * 0.4));
    const largeSpread = this.rng.random(0.5, 0.8);

    for (let i = 0; i < largeCount; i++) {
      const spreadAngle = this.rng.random(direction - largeSpread, direction + largeSpread);
      const distance = this.rng.random(size * 0.2, size * 2.0);
      const dx = x + Math.cos(spreadAngle) * distance;
      const dy = y + Math.sin(spreadAngle) * distance;
      const radius = this.rng.random(2.5, 8);

      this.drawDroplet(context, dx, dy, radius, intensity * this.rng.random(0.5, 0.95), isMask);
    }
  }
}
