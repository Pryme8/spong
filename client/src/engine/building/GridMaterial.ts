/**
 * Create a material for the grid plane with procedural lines.
 * Shows yellow lines at cell boundaries, transparent elsewhere.
 */

import { Scene, ShaderMaterial, Color3, Texture } from '@babylonjs/core';

/**
 * Create grid material using a simple approach with a dynamic texture.
 * Grid lines match the cell size (160 lines for 160 cells).
 */
export function createGridMaterial(scene: Scene, gridCount: number): ShaderMaterial {
  const mat = new ShaderMaterial('gridMat', scene, {
    vertexSource: `
      precision highp float;
      
      attribute vec3 position;
      attribute vec2 uv;
      
      uniform mat4 worldViewProjection;
      
      varying vec2 vUV;
      
      void main() {
        gl_Position = worldViewProjection * vec4(position, 1.0);
        vUV = uv;
      }
    `,
    fragmentSource: `
      precision highp float;
      
      varying vec2 vUV;
      
      uniform float gridCount;
      
      void main() {
        // Calculate grid lines
        vec2 gridUV = vUV * gridCount;
        vec2 grid = abs(fract(gridUV - 0.5) - 0.5) / fwidth(gridUV);
        float line = min(grid.x, grid.y);
        
        // Yellow lines with smooth anti-aliasing
        float alpha = 1.0 - min(line, 1.0);
        vec3 color = vec3(1.0, 1.0, 0.0); // Yellow
        
        // Make lines more visible
        alpha = smoothstep(0.0, 0.5, alpha);
        
        if (alpha < 0.1) discard; // Discard fully transparent pixels
        
        gl_FragColor = vec4(color, alpha * 0.6);
      }
    `
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'gridCount']
  });

  mat.setFloat('gridCount', gridCount);
  mat.backFaceCulling = false; // Double-sided
  mat.alpha = 0.6;
  mat.alphaMode = 2; // ALPHA_BLEND
  mat.transparencyMode = 2; // MATERIAL_ALPHABLEND
  mat.zOffset = -0.1; // Offset to render above ground and prevent z-fighting

  return mat;
}
