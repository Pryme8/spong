import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  Color4,
  Vector3,
  Texture
} from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import type { SolidParticle } from '@babylonjs/core/Particles/solidParticleSystem';
import { ParticleMaster, ParticleSystem, ParticleGroup } from './ParticleMaster';

interface ParentProps {
  timeAlive: number;
  maxLife: number;
  fadeOutAt: number;
  timeToMaxSize: number;
  scale: number;
  text: string;
  hasSpawned: boolean;
  children: number[];
  riseSpeed: number;
  color: Color3;
}

interface TextProps {
  parentId: number;
  position: number;
  character: string | null;
  uvSet: boolean;
}

export class DamagePopupSystem {
  private readonly pm: ParticleMaster;
  private readonly system: ParticleSystem;
  private readonly parentGroup: ParticleGroup;
  private readonly textGroup: ParticleGroup;
  private readonly textMesh: Mesh;
  private readonly parentMesh: Mesh;
  private readonly numberTexture: DynamicTexture;
  private readonly numberMaterial: StandardMaterial;
  private readonly scratchColor = new Color3(1, 0.2, 0.2);
  private readonly offset = new Vector3(0, 1.6, 0);
  private readonly maxChars = 6;

  constructor(scene: Scene) {
    this.pm = new ParticleMaster({ scene });
    this.system = this.pm.addNewSystem({
      name: 'damagePopupSystem',
      options: {
        useModelMaterial: true,
        enableDepthSort: true
      }
    });

    this.parentMesh = MeshBuilder.CreatePlane('damagePopupParent', { size: 0.1 }, scene);
    const parentMat = new StandardMaterial('damagePopupParentMat', scene);
    parentMat.alpha = 0;
    parentMat.disableLighting = true;
    this.parentMesh.material = parentMat;

    this.textMesh = MeshBuilder.CreatePlane('damagePopupText', { size: 0.6 }, scene);
    this.numberTexture = this.createNumberAtlas(scene);
    this.numberMaterial = new StandardMaterial('damagePopupTextMat', scene);
    this.numberMaterial.diffuseTexture = this.numberTexture;
    this.numberMaterial.opacityTexture = this.numberTexture;
    this.numberMaterial.emissiveTexture = this.numberTexture;
    this.numberMaterial.emissiveColor = Color3.White();
    this.numberMaterial.ambientColor = Color3.White();
    this.numberMaterial.disableLighting = true;
    this.numberMaterial.backFaceCulling = false;
    this.numberMaterial.useAlphaFromDiffuseTexture = true;
    this.textMesh.material = this.numberMaterial;

    this.parentGroup = this.createParentGroup();
    this.textGroup = this.createTextGroup();

    this.parentMesh.dispose();
    this.textMesh.dispose();

    this.system.build();
  }

  update(deltaSeconds: number): void {
    this.pm.update(deltaSeconds);
  }

  spawn(value: number, worldPosition: Vector3, color: Color3 = this.scratchColor): void {
    const colorCopy = color.clone();
    const text = Math.round(value).toString();
    const clampedText = text.length > this.maxChars ? text.slice(0, this.maxChars) : text;

    const idx = this.parentGroup.awakeParticle({
      props: {
        timeAlive: 0,
        maxLife: 1.2,
        fadeOutAt: 0.75,
        timeToMaxSize: 0.18,
        scale: 0,
        text: clampedText,
        hasSpawned: false,
        children: [],
        riseSpeed: 2.8,
        color: colorCopy
      } satisfies ParentProps
    });

    if (idx >= 0) {
      const particle = this.parentGroup.particleSystem.particles[idx];
      particle.position.set(
        worldPosition.x + this.offset.x,
        worldPosition.y + this.offset.y,
        worldPosition.z + this.offset.z
      );
      particle.rotation.setAll(0);
      particle.scale.setAll(0);
      particle.color = new Color4(colorCopy.r, colorCopy.g, colorCopy.b, 1);
    }
  }

  dispose(): void {
    this.system.dispose();
    this.numberTexture.dispose();
    this.numberMaterial.dispose();
  }

  private createParentGroup(): ParticleGroup {
    return this.system.addGroup(
      'damagePopupParentGroup',
      (group) => {
        group.deadList.forEach((idx) => {
          group.onRecycle(group.particleSystem.particles[idx]);
        });
      },
      (particle: SolidParticle) => {
        if (particle.props?.children) {
          for (const idx of particle.props.children as number[]) {
            this.textGroup.killParticle(idx);
          }
        }
        particle.position.setAll(0);
        particle.rotation.setAll(0);
        particle.scale.setAll(0);
        particle.color = new Color4(1, 1, 1, 1);
        particle.props = {
          timeAlive: 0,
          maxLife: 1.2,
          fadeOutAt: 0.75,
          timeToMaxSize: 0.18,
          scale: 0,
          text: '',
          hasSpawned: false,
          children: [],
          riseSpeed: 2.8,
          color: new Color3(1, 1, 1)
        } satisfies ParentProps;
      },
      (particle: SolidParticle) => {
        if (!particle.alive) return;
        const delta = this.system.lastDelta;
        const props = particle.props as ParentProps;

        if (!props.hasSpawned) {
          props.hasSpawned = true;
          const chars = props.text.split('');
          const negOffset = (chars.length - 1) * -0.5;
          for (let i = 0; i < chars.length; i++) {
            const childIdx = this.textGroup.awakeParticle({
              props: {
                parentId: particle.idx,
                character: chars[i],
                position: negOffset + i,
                uvSet: false
              } satisfies TextProps
            });
            if (childIdx >= 0) {
              props.children.push(childIdx);
            }
          }
        }

        props.timeAlive += delta;
        props.scale = Math.min(props.timeAlive / props.timeToMaxSize, 1);

        if (props.timeAlive >= props.fadeOutAt) {
          const fade = 1.0 - (props.timeAlive - props.fadeOutAt) / (props.maxLife - props.fadeOutAt);
          particle.color.a = Math.max(0, Math.min(1, fade));
        }

        particle.scale.setAll(props.scale);
        particle.position.y += props.riseSpeed * delta;

        if (props.timeAlive >= props.maxLife) {
          this.parentGroup.killParticle(particle.idx);
        }
      },
      this.parentMesh,
      320
    );
  }

  private createTextGroup(): ParticleGroup {
    return this.system.addGroup(
      'damagePopupTextGroup',
      (group) => {
        group.deadList.forEach((idx) => {
          group.onRecycle(group.particleSystem.particles[idx]);
        });
      },
      (particle: SolidParticle) => {
        particle.position.setAll(0);
        particle.rotation.setAll(0);
        particle.scale.setAll(0);
        particle.color = new Color4(1, 1, 1, 0);
        particle.props = {
          parentId: -1,
          position: 0,
          character: null,
          uvSet: false
        } satisfies TextProps;
      },
      (particle: SolidParticle) => {
        if (!particle.alive) return;
        const props = particle.props as TextProps;
        const parent = this.parentGroup.particleSystem.particles[props.parentId];

        if (!parent || !parent.alive) {
          this.textGroup.killParticle(particle.idx);
          return;
        }

        if (!props.uvSet && props.character) {
          props.uvSet = true;
          const uv = this.characterToUv(props.character);
          particle.uvs.set(uv[0], uv[1], uv[2], uv[3]);
        }

        particle.scale.setAll(parent.props.scale);
        particle.position.x = parent.position.x + (props.position * 0.65) * parent.props.scale;
        particle.position.y = parent.position.y;
        particle.position.z = parent.position.z;
        particle.color.r = parent.props.color.r;
        particle.color.g = parent.props.color.g;
        particle.color.b = parent.props.color.b;
        particle.color.a = parent.color.a;
      },
      this.textMesh,
      1280
    );
  }

  private createNumberAtlas(scene: Scene): DynamicTexture {
    const size = 64;
    const texture = new DynamicTexture('damagePopupAtlas', { width: size, height: size }, scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.font = '16px Impact';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cell = size / 4;
    const half = cell * 0.5;
    const glyphs = [
      '0', '1', '2', '3',
      '4', '5', '6', '7',
      '8', '9', '-', '+'
    ];

    glyphs.forEach((glyph, index) => {
      const x = (index % 4) * cell + half;
      const y = Math.floor(index / 4) * cell + half;
      ctx.fillText(glyph, x, y);
      ctx.strokeText(glyph, x, y);
    });

    texture.update();
    texture.updateSamplingMode(Texture.NEAREST_LINEAR);
    return texture;
  }

  private characterToUv(char: string): [number, number, number, number] {
    const glyphMap: Record<string, number> = {
      '0': 0,
      '1': 1,
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      '-': 10,
      '+': 11
    };

    const index = glyphMap[char] ?? 0;
    const step = 0.25;
    const col = index % 4;
    const row = Math.floor(index / 4);
    const u0 = col * step;
    const u1 = u0 + step;
    const v1 = 1 - row * step;
    const v0 = v1 - step;
    return [u0, v0, u1, v1];
  }
}
