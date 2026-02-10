/**
 * Shared primitive meshes for instanced rendering.
 * Creates master meshes once and provides instances for efficient rendering.
 */

import { MeshBuilder, Mesh, Scene, Color3, InstancedMesh, StandardMaterial, Color4 } from '@babylonjs/core';

export class MeshPrimitives {
  private static instance: MeshPrimitives | null = null;
  private masterCube: Mesh | null = null;
  private masterSphere: Mesh | null = null;
  private masterCylinder: Mesh | null = null;
  private scene: Scene | null = null;

  private constructor() {}

  static getInstance(): MeshPrimitives {
    if (!MeshPrimitives.instance) {
      MeshPrimitives.instance = new MeshPrimitives();
    }
    return MeshPrimitives.instance;
  }

  /**
   * Initialize the primitive meshes for the given scene.
   */
  initialize(scene: Scene): void {
    if (this.scene) return; // Already initialized
    this.scene = scene;

    // Create master cube (1x1x1 unit cube)
    this.masterCube = MeshBuilder.CreateBox('masterCube', {
      width: 1,
      height: 1,
      depth: 1
    }, scene);
    
    // Create default material for boxes
    const boxMaterial = new StandardMaterial('instancedBoxMaterial', scene);
    boxMaterial.diffuseColor = new Color3(1, 1, 1); // White base
    boxMaterial.specularColor = new Color3(0.5, 0.5, 0.5); // Default shine
    this.masterCube.material = boxMaterial;
    
    // Make master invisible (only instances are visible)
    this.masterCube.isVisible = false;
    
    // Enable instancing for color
    this.masterCube.registerInstancedBuffer('color', 4); // RGBA diffuse color
    
    // Create master sphere (diameter 1)
    this.masterSphere = MeshBuilder.CreateSphere('masterSphere', {
      diameter: 1,
      segments: 16
    }, scene);
    
    // Create default material for spheres
    const sphereMaterial = new StandardMaterial('instancedSphereMaterial', scene);
    sphereMaterial.diffuseColor = new Color3(1, 1, 1); // White base
    sphereMaterial.specularColor = new Color3(0.5, 0.5, 0.5); // Default shine
    this.masterSphere.material = sphereMaterial;
    
    // Make master invisible
    this.masterSphere.isVisible = false;
    
    // Enable instancing for color
    this.masterSphere.registerInstancedBuffer('color', 4); // RGBA diffuse color
    
    // Create master cylinder (diameter 1, height 1)
    this.masterCylinder = MeshBuilder.CreateCylinder('masterCylinder', {
      diameter: 1,
      height: 1,
      tessellation: 16
    }, scene);
    
    // Create default material for cylinders
    const cylinderMaterial = new StandardMaterial('instancedCylinderMaterial', scene);
    cylinderMaterial.diffuseColor = new Color3(1, 1, 1); // White base
    cylinderMaterial.specularColor = new Color3(0.5, 0.5, 0.5); // Default shine
    this.masterCylinder.material = cylinderMaterial;
    
    // Make master invisible
    this.masterCylinder.isVisible = false;
    
    // Enable instancing for color
    this.masterCylinder.registerInstancedBuffer('color', 4); // RGBA diffuse color
  }

  /**
   * Create a colored box instance.
   * @param name Instance name
   * @param width Box width (X)
   * @param height Box height (Y)
   * @param depth Box depth (Z)
   * @param diffuseColor Diffuse color (main color)
   * @param emissiveColor Optional emissive color (glow)
   * @param specularColor Optional specular color (shine)
   * @returns InstancedMesh with the specified dimensions and colors
   */
  createBoxInstance(
    name: string,
    width: number,
    height: number,
    depth: number,
    diffuseColor: Color3,
    emissiveColor?: Color3,
    specularColor?: Color3
  ): InstancedMesh {
    if (!this.masterCube || !this.scene) {
      throw new Error('MeshPrimitives not initialized. Call initialize() first.');
    }

    const instance = this.masterCube.createInstance(name);
    
    // Scale to desired dimensions
    instance.scaling.set(width, height, depth);
    
    // Set diffuse color via instance buffer
    const finalColor = new Color4(diffuseColor.r, diffuseColor.g, diffuseColor.b, 1.0);
    
    // Mix emissive into the color if provided (simple approximation)
    if (emissiveColor) {
      finalColor.r = Math.min(1, finalColor.r + emissiveColor.r * 0.5);
      finalColor.g = Math.min(1, finalColor.g + emissiveColor.g * 0.5);
      finalColor.b = Math.min(1, finalColor.b + emissiveColor.b * 0.5);
    }
    
    instance.instancedBuffers.color = finalColor;
    
    return instance;
  }

  /**
   * Create a colored sphere instance.
   * @param name Instance name
   * @param diameter Sphere diameter
   * @param diffuseColor Diffuse color (main color)
   * @param emissiveColor Optional emissive color (glow)
   * @returns InstancedMesh with the specified diameter and colors
   */
  createSphereInstance(
    name: string,
    diameter: number,
    diffuseColor: Color3,
    emissiveColor?: Color3
  ): InstancedMesh {
    if (!this.masterSphere || !this.scene) {
      throw new Error('MeshPrimitives not initialized. Call initialize() first.');
    }

    const instance = this.masterSphere.createInstance(name);
    
    // Scale to desired diameter
    instance.scaling.set(diameter, diameter, diameter);
    
    // Set diffuse color via instance buffer
    const finalColor = new Color4(diffuseColor.r, diffuseColor.g, diffuseColor.b, 1.0);
    
    // Mix emissive into the color if provided
    if (emissiveColor) {
      finalColor.r = Math.min(1, finalColor.r + emissiveColor.r * 0.5);
      finalColor.g = Math.min(1, finalColor.g + emissiveColor.g * 0.5);
      finalColor.b = Math.min(1, finalColor.b + emissiveColor.b * 0.5);
    }
    
    instance.instancedBuffers.color = finalColor;
    
    return instance;
  }

  /**
   * Create a colored cylinder instance.
   * @param name Instance name
   * @param diameter Cylinder diameter
   * @param height Cylinder height
   * @param diffuseColor Diffuse color (main color)
   * @param emissiveColor Optional emissive color (glow)
   * @returns InstancedMesh with the specified dimensions and colors
   */
  createCylinderInstance(
    name: string,
    diameter: number,
    height: number,
    diffuseColor: Color3,
    emissiveColor?: Color3
  ): InstancedMesh {
    if (!this.masterCylinder || !this.scene) {
      throw new Error('MeshPrimitives not initialized. Call initialize() first.');
    }

    const instance = this.masterCylinder.createInstance(name);
    
    // Scale to desired dimensions
    instance.scaling.set(diameter, height, diameter);
    
    // Set diffuse color via instance buffer
    const finalColor = new Color4(diffuseColor.r, diffuseColor.g, diffuseColor.b, 1.0);
    
    // Mix emissive into the color if provided
    if (emissiveColor) {
      finalColor.r = Math.min(1, finalColor.r + emissiveColor.r * 0.5);
      finalColor.g = Math.min(1, finalColor.g + emissiveColor.g * 0.5);
      finalColor.b = Math.min(1, finalColor.b + emissiveColor.b * 0.5);
    }
    
    instance.instancedBuffers.color = finalColor;
    
    return instance;
  }

  /**
   * Dispose of all primitive meshes.
   */
  dispose(): void {
    if (this.masterCube) {
      this.masterCube.dispose();
      this.masterCube = null;
    }
    if (this.masterSphere) {
      this.masterSphere.dispose();
      this.masterSphere = null;
    }
    if (this.masterCylinder) {
      this.masterCylinder.dispose();
      this.masterCylinder = null;
    }
    this.scene = null;
  }
}
