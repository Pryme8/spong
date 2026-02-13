/**
 * Bush leaf effect - generates dynamic textures by compositing leaf images
 * with random rotations and alpha blending.
 */

import { Scene, DynamicTexture, Texture } from '@babylonjs/core';
import { BaseEffect } from './base/BaseEffect';

interface LeafImagePair {
  colorUrl: string;
  maskUrl: string;
}

export class BushLeafEffect extends BaseEffect {
  private colorTextures: DynamicTexture[] = [];
  private maskTextures: DynamicTexture[] = [];

  // Leaf image pairs (color + mask)
  private leafPairs: LeafImagePair[] = [
    { colorUrl: '/assets/images/leaf_a_color.png', maskUrl: '/assets/images/leaf_a_mask.png' },
    { colorUrl: '/assets/images/leaf_b_color.png', maskUrl: '/assets/images/leaf_b_mask.png' },
    { colorUrl: '/assets/images/leaf_c_color.png', maskUrl: '/assets/images/leaf_c_mask.png' },
  ];

  constructor(scene: Scene) {
    super(scene);
  }

  /**
   * Generate 3 pairs of dynamic textures (color + mask) at 1024x1024.
   * Each texture composites all 3 leaf images with random rotations and alpha blending.
   * Total: 3 color textures + 3 mask textures = 6 textures.
   */
  async generate(): Promise<void> {
    console.log('[BushLeafEffect] Starting texture generation...');

    // Load all leaf images first
    const loadedImages = await this.loadAllLeafImages();

    // Generate 3 pairs of textures (6 total textures)
    for (let i = 0; i < 3; i++) {
      const { colorTexture, maskTexture } = this.generateTexturePair(i, loadedImages);
      this.colorTextures.push(colorTexture);
      this.maskTextures.push(maskTexture);
      this.textures.push(colorTexture, maskTexture);
    }

    this.isReady = true;
    console.log('[BushLeafEffect] Generated 3 texture pairs (6 total textures)');
  }

  /**
   * Load all leaf images (color + mask pairs).
   */
  private async loadAllLeafImages(): Promise<Array<{ color: HTMLImageElement; mask: HTMLImageElement }>> {
    const promises = this.leafPairs.map(async (pair) => {
      const color = await this.loadImage(pair.colorUrl);
      const mask = await this.loadImage(pair.maskUrl);
      return { color, mask };
    });

    return Promise.all(promises);
  }

  /**
   * Load a single image from URL.
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn(`[BushLeafEffect] Failed to load ${url}, using placeholder`);
        // Create a placeholder colored square
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#2D5016';
        ctx.fillRect(0, 0, 256, 256);
        const placeholderImg = new Image();
        placeholderImg.src = canvas.toDataURL();
        placeholderImg.onload = () => resolve(placeholderImg);
      };
      img.src = url;
    });
  }

  /**
   * Generate a single pair of dynamic textures (color + mask).
   */
  private generateTexturePair(
    index: number,
    loadedImages: Array<{ color: HTMLImageElement; mask: HTMLImageElement }>
  ): { colorTexture: DynamicTexture; maskTexture: DynamicTexture } {
    const size = 1024;

    // Create dynamic textures
    const colorTexture = new DynamicTexture(`bushLeafColor_${index}`, size, this.scene, false);
    const maskTexture = new DynamicTexture(`bushLeafMask_${index}`, size, this.scene, false);

    const colorCtx = colorTexture.getContext();
    const maskCtx = maskTexture.getContext();

    // Clear to transparent
    colorCtx.clearRect(0, 0, size, size);
    maskCtx.clearRect(0, 0, size, size);

    // Alpha values for the 3 layers (reversed: start with least opaque, end with most opaque)
    // This way each successive layer draws over the previous with higher opacity
    const alphas = [0.35, 0.6, 1.0];

    // Shuffle leaf order for variety (using index as seed)
    const leafOrder = this.shuffleArray([0, 1, 2], index);

    // Draw each leaf image with rotation and alpha
    // Each layer replaces the alpha of pixels underneath
    for (let i = 0; i < 3; i++) {
      const leafIndex = leafOrder[i];
      const { color, mask } = loadedImages[leafIndex];
      const alpha = alphas[i];
      const rotation = this.getRandomRotation(index, i); // 0, 90, 180, or 270 degrees

      this.drawRotatedImage(colorCtx, color, size, rotation, alpha, false);
      this.drawRotatedImage(maskCtx, mask, size, rotation, alpha, true);
    }

    // Update textures
    colorTexture.update();
    maskTexture.update();

    return { colorTexture, maskTexture };
  }

  /**
   * Draw an image to a canvas context with rotation and alpha.
   * Each layer paints over the previous, with later layers having higher opacity.
   * @param isMask If true, uses 'lighten' mode so black areas don't override white
   */
  private drawRotatedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasSize: number,
    rotationDegrees: number,
    alpha: number,
    isMask: boolean = false
  ): void {
    ctx.save();

    // For masks: use 'lighten' so only lighter pixels (white) replace darker ones (black)
    // This prevents black areas from overriding white areas from previous layers
    if (isMask) {
      ctx.globalCompositeOperation = 'lighten';
    }

    // Set alpha - each successive layer will paint over with its opacity value
    ctx.globalAlpha = alpha;

    // Move to center, rotate, then draw
    ctx.translate(canvasSize * 0.5, canvasSize * 0.5);
    ctx.rotate((rotationDegrees * Math.PI) / 180);

    // Draw image centered
    const scale = canvasSize / Math.max(img.width, img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    ctx.drawImage(img, -drawWidth * 0.5, -drawHeight * 0.5, drawWidth, drawHeight);

    ctx.restore();
  }

  /**
   * Get a deterministic "random" rotation (0, 90, 180, or 270 degrees).
   */
  private getRandomRotation(textureIndex: number, layerIndex: number): number {
    const seed = textureIndex * 3 + layerIndex;
    const rotations = [0, 90, 180, 270];
    return rotations[seed % 4];
  }

  /**
   * Shuffle an array deterministically based on a seed.
   */
  private shuffleArray<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
      // Simple pseudo-random number generator
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      const j = Math.floor((currentSeed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Get a color texture by index (0-2).
   */
  getColorTexture(index: number): DynamicTexture | null {
    return this.colorTextures[index] || null;
  }

  /**
   * Get a mask texture by index (0-2).
   */
  getMaskTexture(index: number): DynamicTexture | null {
    return this.maskTextures[index] || null;
  }

  /**
   * Dispose all textures.
   */
  dispose(): void {
    super.dispose();
    this.colorTextures = [];
    this.maskTextures = [];
  }
}
