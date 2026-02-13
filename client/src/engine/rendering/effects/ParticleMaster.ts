import type { Scene, Mesh } from '@babylonjs/core';
import { SolidParticleSystem } from '@babylonjs/core/Particles/solidParticleSystem';
import type { SolidParticle } from '@babylonjs/core/Particles/solidParticleSystem';

export interface ParticleMasterParams {
  scene: Scene;
}

export interface ParticleSystemOptions {
  updatable?: boolean;
  isPickable?: boolean;
  enableDepthSort?: boolean;
  particleIntersection?: boolean;
  boundingSphereOnly?: boolean;
  bSphereRadiusFactor?: number;
  expandable?: boolean;
  useModelMaterial?: boolean;
  enableMultiMaterial?: boolean;
}

export interface ParticleSystemParams {
  name: string;
  options: ParticleSystemOptions;
}

interface ParticleSystemParamsMaster extends ParticleSystemParams {
  particleMaster: ParticleMaster;
}

export class ParticleMaster {
  private particleSystems = new Map<string, ParticleSystem[]>();
  private particleSystemList: ParticleSystem[] = [];

  constructor(private params: ParticleMasterParams) {}

  get scene(): Scene {
    return this.params.scene;
  }

  update(deltaSeconds: number): void {
    for (const system of this.particleSystemList) {
      system.update(deltaSeconds);
    }
  }

  addNewSystem(params: ParticleSystemParams): ParticleSystem {
    const system = new ParticleSystem({ ...params, particleMaster: this });
    const existing = this.particleSystems.get(params.name);
    if (existing) {
      existing.push(system);
    } else {
      this.particleSystems.set(params.name, [system]);
    }
    this.particleSystemList.push(system);
    return system;
  }

  removeSystem(name: string, uID: number): void {
    const filter = (system: ParticleSystem) => system.uID !== uID;
    const current = this.particleSystems.get(name) ?? [];
    this.particleSystems.set(name, current.filter(filter));
    this.particleSystemList = this.particleSystemList.filter(filter);
  }
}

export type ParticleGroupInit = (group: ParticleGroup) => void;
export type ParticleGroupHandler = (particle: SolidParticle) => void;

export class ParticleSystem {
  static UID = 0;

  private sps: SolidParticleSystem;
  private groups = new Map<string, ParticleGroup>();
  private particleCount = 0;

  public lastDelta = 0;
  public readonly uID: number;

  constructor(private params: ParticleSystemParamsMaster) {
    this.uID = ParticleSystem.UID++;
    this.sps = new SolidParticleSystem(this.params.name, this.scene, this.params.options);
  }

  get scene(): Scene {
    return this.params.particleMaster.scene;
  }

  get name(): string {
    return this.params.name;
  }

  get particles(): SolidParticle[] {
    return this.sps.particles;
  }

  addGroup(
    name: string,
    onInit: ParticleGroupInit,
    onRecycle: ParticleGroupHandler,
    onUpdate: ParticleGroupHandler,
    outputMesh: Mesh,
    cacheSize: number
  ): ParticleGroup {
    const group = new ParticleGroup({
      particleSystem: this,
      name,
      onInit,
      onRecycle,
      onUpdate,
      cacheSize
    });

    const start = this.particleCount;
    const end = start + cacheSize - 1;
    this.particleCount += cacheSize;

    group.setGroupCachePoints(start, end);

    this.sps.addShape(outputMesh, cacheSize);
    this.groups.set(name, group);
    return group;
  }

  build(): void {
    const mesh = this.sps.buildMesh();
    mesh.renderingGroupId = 2;
    mesh.hasVertexAlpha = true;

    this.sps.initParticles = () => {
      this.init();
    };

    this.sps.initParticles();
    this.sps.setParticles();
  }

  init(): void {
    this.groups.forEach((group) => {
      group.onInit(group);
    });
  }

  update(deltaSeconds: number): void {
    this.lastDelta = deltaSeconds;
    this.groups.forEach((group) => {
      group.update();
    });
    this.sps.setParticles();
    this.sps.refreshVisibleSize();
  }

  dispose(): void {
    this.sps.dispose();
    this.groups.clear();
  }
}

interface ParticleGroupParams {
  particleSystem: ParticleSystem;
  name: string;
  onInit: ParticleGroupInit;
  onRecycle: ParticleGroupHandler;
  onUpdate: ParticleGroupHandler;
  cacheSize: number;
}

export class ParticleGroup {
  public aliveList: number[] = [];
  public deadList: number[] = [];

  constructor(private params: ParticleGroupParams) {}

  get particleSystem(): ParticleSystem {
    return this.params.particleSystem;
  }

  get name(): string {
    return this.params.name;
  }

  get onInit(): ParticleGroupInit {
    return this.params.onInit;
  }

  get onRecycle(): ParticleGroupHandler {
    return this.params.onRecycle;
  }

  get onUpdate(): ParticleGroupHandler {
    return this.params.onUpdate;
  }

  get cacheSize(): number {
    return this.params.cacheSize;
  }

  setGroupCachePoints(start: number, end: number): void {
    for (let i = start; i <= end; i++) {
      this.deadList.push(i);
    }
  }

  update(): void {
    for (const idx of this.aliveList) {
      this.onUpdate(this.particleSystem.particles[idx]);
    }
  }

  awakeParticle(params: Record<string, any>): number {
    const particleIdx = this.getNextDeadParticleIdx();
    if (particleIdx > -1) {
      this.aliveList.push(particleIdx);
      const particle = this.particleSystem.particles[particleIdx];
      particle.alive = true;

      for (const paramsName of Object.keys(params)) {
        if (paramsName === 'props') {
          particle[paramsName] = { ...particle[paramsName], ...params.props };
        } else {
          particle[paramsName] = params[paramsName];
        }
      }
    }
    return particleIdx;
  }

  killParticle(idx: number): void {
    const index = this.aliveList.indexOf(idx);
    if (index >= 0) {
      this.deadList.push(this.aliveList.splice(index, 1)[0]);
    } else {
      this.deadList.push(idx);
    }
    const particle = this.particleSystem.particles[idx];
    particle.alive = false;
    this.onRecycle(particle);
  }

  getNextDeadParticleIdx(): number {
    return this.deadList.length ? this.deadList.splice(0, 1)[0] : -1;
  }
}
