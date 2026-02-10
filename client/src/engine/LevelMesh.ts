/**
 * Convert greedy mesh quads into Babylon.js geometry.
 * Uses CustomMaterial (extends StandardMaterial) for proper lighting/shadows
 * with injected tri-planar procedural texturing.
 */

import { Mesh, VertexData, Scene, Vector3, Color3 } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom';
import type { Quad } from '@spong/shared';
import { VOXEL_WIDTH, VOXEL_HEIGHT, VOXEL_DEPTH, LEVEL_OFFSET_X, LEVEL_OFFSET_Y, LEVEL_OFFSET_Z } from '@spong/shared';
import { ShadowManager } from './ShadowManager';

export class LevelMesh {
  readonly hasShadows = true;
  
  private scene: Scene;
  private mesh: Mesh | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create Babylon.js mesh from greedy mesh quads.
   */
  createFromQuads(quads: Quad[]): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let vertexOffset = 0;

    for (const quad of quads) {
      const quadVerts = this.generateQuadGeometry(quad);

      // Add vertices
      positions.push(...quadVerts.positions);
      normals.push(...quadVerts.normals);
      uvs.push(...quadVerts.uvs);

      // Add indices (two triangles per quad)
      indices.push(
        vertexOffset + 0,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 3
      );

      vertexOffset += 4;
    }

    // Create mesh
    const mesh = new Mesh('level', this.scene);
    const vertexData = new VertexData();

    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.indices = indices;

    vertexData.applyToMesh(mesh);

    // Convert to flat shaded so each face has its own normals
    mesh.convertToFlatShadedMesh();

    // Position the mesh (centered and lowered)
    mesh.position.set(LEVEL_OFFSET_X, LEVEL_OFFSET_Y, LEVEL_OFFSET_Z);

    // Create tri-planar material using CustomMaterial
    const material = this.createTriPlanarMaterial();
    mesh.material = material;

    // Enable collisions
    mesh.checkCollisions = true;

    // Register shadows if enabled (both cast and receive for self-shadowing)
    if (this.hasShadows) {
      const sm = ShadowManager.getInstance();
      if (sm) {
        sm.addShadowCaster(mesh, true); // Enable self-shadows (terrain casts shadows on itself)
      }
    }

    this.mesh = mesh;
    return mesh;
  }

  /**
   * Create tri-planar material using CustomMaterial.
   * CustomMaterial extends StandardMaterial so we get full Babylon.js
   * lighting, shadows, and fog support for free. We just inject
   * our procedural tri-planar color into the diffuse calculation.
   */
  private createTriPlanarMaterial(): CustomMaterial {
    const material = new CustomMaterial('triPlanar', this.scene);
    
    // Base StandardMaterial settings
    material.diffuseColor = new Color3(1, 1, 1); // White base (overridden by shader)
    material.specularColor = new Color3(0, 0, 0); // No specular
    material.ambientColor = new Color3(0, 0, 0); // No ambient - rely only on directional light
    material.backFaceCulling = true;
    
    // Add custom uniforms
    material.AddUniform('texScale', 'float', 0.25);
    material.AddUniform('topColor', 'vec3', new Color3(0.3, 0.6, 0.2));    // Grass green
    material.AddUniform('sideColor', 'vec3', new Color3(0.4, 0.3, 0.2));   // Dirt brown
    material.AddUniform('bottomColor', 'vec3', new Color3(0.2, 0.2, 0.25)); // Dark rock
    
    // Vertex shader: pass world position to fragment
    material.Vertex_Definitions(`
      varying vec3 vWorldPosCustom;
    `);
    
    material.Vertex_After_WorldPosComputed(`
      vWorldPosCustom = worldPos.xyz;
    `);
    
    // Fragment shader: define noise functions and tri-planar varying
    material.Fragment_Definitions(`
      varying vec3 vWorldPosCustom;
      
      float triHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float triNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = triHash(i);
        float b = triHash(i + vec2(1.0, 0.0));
        float c = triHash(i + vec2(0.0, 1.0));
        float d = triHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      vec3 getProceduralColor(vec2 uv, vec3 baseColor) {
        float n = triNoise(uv * 8.0) * 0.15;
        return baseColor * (0.85 + n);
      }
    `);
    
    // Fragment_Custom_Diffuse: override diffuseColor with tri-planar calculation
    // Note: "result" is replaced with "diffuseColor" by CustomMaterial
    // diffuseColor is a vec3 in the standard shader
    material.Fragment_Custom_Diffuse(`
      vec3 bw = abs(normalW);
      bw = pow(bw, vec3(4.0));
      bw = bw / (bw.x + bw.y + bw.z);

      vec3 sp = vWorldPosCustom * texScale;

      vec3 cX = getProceduralColor(sp.yz, sideColor);
      vec3 cY = getProceduralColor(sp.xz, topColor);
      vec3 cZ = getProceduralColor(sp.xy, sideColor);

      vec3 triColor = cX * bw.x + cY * bw.y + cZ * bw.z;

      float bottomMix = step(normalW.y, -0.5) * 0.5;
      triColor = mix(triColor, bottomColor, bottomMix);

      diffuseColor = triColor;
    `);

    return material;
  }

  /**
   * Generate vertex data for a single quad.
   */
  private generateQuadGeometry(quad: Quad): {
    positions: number[];
    normals: number[];
    uvs: number[];
  } {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Determine quad corners and normal based on axis and direction
    const { corners, normal } = this.getQuadGeometry(quad);

    // Add 4 vertices (bottom-left, bottom-right, top-right, top-left)
    for (let i = 0; i < 4; i++) {
      positions.push(corners[i].x, corners[i].y, corners[i].z);
      normals.push(normal.x, normal.y, normal.z);
    }

    // UV coordinates (simple tiling)
    const uScale = quad.width;
    const vScale = quad.height;
    uvs.push(0, 0, uScale, 0, uScale, vScale, 0, vScale);

    return { positions, normals, uvs };
  }

  /**
   * Get quad corner positions and normal vector based on axis and direction.
   */
  private getQuadGeometry(quad: Quad): {
    corners: Vector3[];
    normal: Vector3;
  } {
    const { x, y, z, width, height, axis, positive } = quad;

    let corners: Vector3[];
    let normal: Vector3;

    switch (axis) {
      case 'x':
        // YZ plane, normal along X axis
        normal = new Vector3(positive ? 1 : -1, 0, 0);
        if (positive) {
          // +X face (looking from +X towards origin, CCW)
          corners = [
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y, (z + width) * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, (z + width) * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
          ];
        } else {
          // -X face (looking from -X towards origin, CCW)
          corners = [
            new Vector3(x * VOXEL_WIDTH, y, (z + width) * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, (z + width) * VOXEL_DEPTH),
          ];
        }
        break;

      case 'y':
        // XZ plane, normal along Y axis
        normal = new Vector3(0, positive ? 1 : -1, 0);
        if (positive) {
          // +Y face (looking from +Y down, CCW)
          corners = [
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y, (z + height) * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y, (z + height) * VOXEL_DEPTH),
          ];
        } else {
          // -Y face (looking from -Y up, CCW)
          corners = [
            new Vector3(x * VOXEL_WIDTH, y, (z + height) * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y, (z + height) * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
          ];
        }
        break;

      case 'z':
        // XY plane, normal along Z axis
        normal = new Vector3(0, 0, positive ? 1 : -1);
        if (positive) {
          // +Z face (looking from +Z towards origin, CCW)
          corners = [
            new Vector3((x + width) * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
          ];
        } else {
          // -Z face (looking from -Z towards origin, CCW)
          corners = [
            new Vector3(x * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y, z * VOXEL_DEPTH),
            new Vector3((x + width) * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
            new Vector3(x * VOXEL_WIDTH, y + height * VOXEL_HEIGHT, z * VOXEL_DEPTH),
          ];
        }
        break;
    }

    return { corners, normal };
  }

  /**
   * Dispose of the mesh.
   */
  dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }
  }
}
