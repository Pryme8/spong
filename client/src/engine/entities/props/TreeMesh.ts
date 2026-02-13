/**
 * Convert tree greedy mesh quads into Babylon.js geometry with materials.
 * Creates separate meshes for trunk/branches (brown) and leaves (green).
 */

import { Mesh, VertexData, Scene, Vector3, StandardMaterial, Color3 } from '@babylonjs/core';
import type { TreeQuad } from '@spong/shared';
import { TREE_VOXEL_SIZE, TREE_GRID_SIZE, MATERIAL_WOOD, MATERIAL_LEAF } from '@spong/shared';

export class TreeMesh {
  private scene: Scene;
  private trunkMesh: Mesh | null = null;
  private leafMesh: Mesh | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create Babylon.js meshes from tree quads.
   * Returns an array of meshes [trunkMesh, leafMesh].
   */
  createFromQuads(quads: TreeQuad[]): Mesh[] {
    // Separate quads by material
    const woodQuads = quads.filter(q => q.material === MATERIAL_WOOD);
    const leafQuads = quads.filter(q => q.material === MATERIAL_LEAF);

    const meshes: Mesh[] = [];

    // Create trunk mesh if there are wood quads
    if (woodQuads.length > 0) {
      this.trunkMesh = this.createMeshFromQuads(woodQuads, 'trunk', this.createWoodMaterial());
      meshes.push(this.trunkMesh);
    }

    // Create leaf mesh if there are leaf quads
    if (leafQuads.length > 0) {
      this.leafMesh = this.createMeshFromQuads(leafQuads, 'leaves', this.createLeafMaterial());
      meshes.push(this.leafMesh);
    }

    return meshes;
  }

  /**
   * Create a single mesh from a set of quads with a given material.
   * Mesh is centered at origin (0,0,0) with base at Y=0, scaled 0.4x to match in-game trees.
   */
  private createMeshFromQuads(quads: TreeQuad[], name: string, material: StandardMaterial): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const TREE_SCALE = 0.4; // Match LevelTreeManager scale
    
    // Center offset to position mesh at origin
    const halfGrid = TREE_GRID_SIZE * TREE_VOXEL_SIZE * 0.5;
    // Turtle starts at Y=2 in voxel space, offset down so base is at Y=0
    const yOffset = 2 * TREE_VOXEL_SIZE;

    let vertexOffset = 0;

    for (const quad of quads) {
      const quadVerts = this.generateQuadGeometry(quad);

      // Add vertices, centering them during construction
      for (let i = 0; i < quadVerts.positions.length; i += 3) {
        positions.push(
          (quadVerts.positions[i] - halfGrid) * TREE_SCALE,         // Center X and scale
          (quadVerts.positions[i + 1] - yOffset) * TREE_SCALE,      // Offset Y to base 0, then scale
          (quadVerts.positions[i + 2] - halfGrid) * TREE_SCALE      // Center Z and scale
        );
      }
      
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
    const mesh = new Mesh(name, this.scene);
    const vertexData = new VertexData();

    vertexData.positions = positions;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.indices = indices;

    vertexData.applyToMesh(mesh);

    // Mesh is now centered at origin, no position/scale needed
    mesh.material = material;

    return mesh;
  }

  /**
   * Create brown material for trunk and branches.
   */
  private createWoodMaterial(): StandardMaterial {
    const material = new StandardMaterial('woodMaterial', this.scene);
    
    // Dark brown
    material.diffuseColor = new Color3(0.35, 0.2, 0.1);
    
    // Slight warm glow
    material.emissiveColor = new Color3(0.05, 0.03, 0.01);
    
    // Subtle specular
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    
    material.backFaceCulling = true;
    
    return material;
  }

  /**
   * Create green material for leaves.
   */
  private createLeafMaterial(): StandardMaterial {
    const material = new StandardMaterial('leafMaterial', this.scene);
    
    // Forest green
    material.diffuseColor = new Color3(0.1, 0.6, 0.2);
    
    // Slight green glow
    material.emissiveColor = new Color3(0.02, 0.1, 0.03);
    
    // Less shiny than wood
    material.specularColor = new Color3(0.05, 0.05, 0.05);
    
    material.backFaceCulling = true;
    
    return material;
  }

  /**
   * Generate vertex data for a single quad.
   */
  private generateQuadGeometry(quad: TreeQuad): {
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
   * Trees use uniform voxel size for all axes.
   */
  private getQuadGeometry(quad: TreeQuad): {
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
          corners = [
            new Vector3(x, y, z),
            new Vector3(x, y, z + width * TREE_VOXEL_SIZE),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z + width * TREE_VOXEL_SIZE),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z),
          ];
        } else {
          corners = [
            new Vector3(x, y, z + width * TREE_VOXEL_SIZE),
            new Vector3(x, y, z),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z + width * TREE_VOXEL_SIZE),
          ];
        }
        break;

      case 'y':
        // XZ plane, normal along Y axis
        normal = new Vector3(0, positive ? 1 : -1, 0);
        if (positive) {
          corners = [
            new Vector3(x, y, z),
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z),
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z + height * TREE_VOXEL_SIZE),
            new Vector3(x, y, z + height * TREE_VOXEL_SIZE),
          ];
        } else {
          corners = [
            new Vector3(x, y, z + height * TREE_VOXEL_SIZE),
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z + height * TREE_VOXEL_SIZE),
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z),
            new Vector3(x, y, z),
          ];
        }
        break;

      case 'z':
        // XY plane, normal along Z axis
        normal = new Vector3(0, 0, positive ? 1 : -1);
        if (positive) {
          corners = [
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z),
            new Vector3(x, y, z),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z),
            new Vector3(x + width * TREE_VOXEL_SIZE, y + height * TREE_VOXEL_SIZE, z),
          ];
        } else {
          corners = [
            new Vector3(x, y, z),
            new Vector3(x + width * TREE_VOXEL_SIZE, y, z),
            new Vector3(x + width * TREE_VOXEL_SIZE, y + height * TREE_VOXEL_SIZE, z),
            new Vector3(x, y + height * TREE_VOXEL_SIZE, z),
          ];
        }
        break;
    }

    return { corners, normal };
  }

  /**
   * Dispose of all meshes.
   */
  dispose(): void {
    if (this.trunkMesh) {
      this.trunkMesh.dispose();
      this.trunkMesh = null;
    }
    if (this.leafMesh) {
      this.leafMesh.dispose();
      this.leafMesh = null;
    }
  }
}
