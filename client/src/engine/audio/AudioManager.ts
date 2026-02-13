/**
 * Audio Manager - Uses Web Audio API directly for reliable cross-browser audio.
 * Supports 2D/3D spatial audio, sound pooling, channels, and duration-based playback.
 */

export interface PlaySoundOptions {
  /** Volume override (0-1), defaults to channel volume */
  volume?: number;
  /** Loop the sound */
  loop?: boolean;
  /** 3D position for spatial audio */
  position?: { x: number; y: number; z: number };
  /** Auto-stop after this duration (seconds) */
  duration?: number;
  /** Pitch adjustment (1.0 = normal) */
  playbackRate?: number;
}

interface SoundInstance {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  pannerNode: PannerNode | null;
  inUse: boolean;
  startedAt: number;
  stopTimeout?: number;
  instanceId?: string; // Unique ID to track this instance
}

interface SoundDefinition {
  name: string;
  buffer: AudioBuffer | null;
  channel: string;
  maxInstances: number;
  spatial: boolean;
  startTime: number; // Offset in seconds to start playback
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  instances: SoundInstance[];
}

/**
 * Audio channel for grouping and volume control.
 */
export class AudioChannel {
  private _volume = 1.0;
  private _muted = false;
  readonly gainNode: GainNode;

  constructor(public readonly name: string, ctx: AudioContext, destination: AudioNode) {
    this.gainNode = ctx.createGain();
    this.gainNode.connect(destination);
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
}

/**
 * Main audio manager singleton.
 * Uses Web Audio API directly for reliable audio playback.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private ctx: AudioContext;
  private masterGain: GainNode;
  private sounds = new Map<string, SoundDefinition>();
  private channels = new Map<string, AudioChannel>();
  private masterVolume = 1.0;
  private masterMuted = false;
  private initialized = false;
  private unlocked = false;
  private warnedSounds = new Set<string>();
  private instanceCounter = 0; // For generating unique instance IDs

  // Listener position for spatial audio
  private listenerX = 0;
  private listenerY = 0;
  private listenerZ = 0;

  private constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.setupDefaultChannels();
    this.setupUnlock();

    console.log(`[AudioManager] Created. AudioContext state: ${this.ctx.state}`);
  }

  /**
   * Initialize the audio manager singleton.
   */
  static Initialize(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /**
   * Get the audio manager instance.
   */
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      throw new Error('AudioManager not initialized. Call AudioManager.Initialize() first.');
    }
    return AudioManager.instance;
  }

  /**
   * Setup unlock listeners - AudioContext must be resumed after user gesture.
   */
  private setupUnlock(): void {
    const unlock = () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.unlocked = true;
          console.log(`[AudioManager] AudioContext unlocked (state: ${this.ctx.state})`);
        });
      } else {
        this.unlocked = true;
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('mousedown', unlock);
      document.removeEventListener('pointerdown', unlock);
    };

    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('mousedown', unlock);
    document.addEventListener('pointerdown', unlock);
  }

  /**
   * Setup default audio channels.
   */
  private setupDefaultChannels(): void {
    this.createChannel('sfx');
    this.createChannel('music');
    this.createChannel('ambient');
    this.createChannel('voice');
    this.createChannel('ui');
  }

  /**
   * Create a new audio channel.
   */
  createChannel(name: string): AudioChannel {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const channel = new AudioChannel(name, this.ctx, this.masterGain);
    this.channels.set(name, channel);
    return channel;
  }

  /**
   * Get an audio channel by name.
   */
  getChannel(name: string): AudioChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * Load audio files from the manifest.
   * Fetches and decodes each audio file into an AudioBuffer.
   */
  async loadSounds(soundManifest: { name: string; path: string; channel?: string; maxInstances?: number; spatial?: boolean; startTime?: number; refDistance?: number; maxDistance?: number; rolloffFactor?: number }[]): Promise<void> {
    console.log(`[AudioManager] Loading ${soundManifest.length} sounds...`);

    const loadPromises = soundManifest.map(async (item) => {
      try {
        const response = await fetch(item.path);
        if (!response.ok) {
          console.warn(`[AudioManager] "${item.name}" - HTTP ${response.status} for ${item.path}`);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

        const soundDef: SoundDefinition = {
          name: item.name,
          buffer: audioBuffer,
          channel: item.channel || 'sfx',
          maxInstances: item.maxInstances || 4,
          spatial: item.spatial || false,
          startTime: item.startTime || 0,
          refDistance: item.refDistance || 5,
          maxDistance: item.maxDistance || 150,
          rolloffFactor: item.rolloffFactor || 1.5,
          instances: [],
        };

        // Pre-create instance slots
        for (let i = 0; i < soundDef.maxInstances; i++) {
          const gainNode = this.ctx.createGain();
          let pannerNode: PannerNode | null = null;

          if (soundDef.spatial) {
            pannerNode = this.ctx.createPanner();
            pannerNode.panningModel = 'HRTF';
            pannerNode.distanceModel = 'inverse';
            pannerNode.maxDistance = soundDef.maxDistance;
            pannerNode.refDistance = soundDef.refDistance;
            pannerNode.rolloffFactor = soundDef.rolloffFactor;
            pannerNode.coneInnerAngle = 360;
            pannerNode.coneOuterAngle = 360;
            pannerNode.connect(gainNode);
          }

          // Connect gain to channel
          const channel = this.channels.get(soundDef.channel);
          if (channel) {
            gainNode.connect(channel.gainNode);
          } else {
            gainNode.connect(this.masterGain);
          }

          soundDef.instances.push({
            source: null,
            gainNode,
            pannerNode,
            inUse: false,
            startedAt: 0,
          });
        }

        this.sounds.set(item.name, soundDef);
      } catch (error) {
        console.warn(`[AudioManager] Failed to load "${item.name}" from ${item.path}:`, error);
      }
    });

    await Promise.all(loadPromises);
    this.initialized = true;

    console.log(`[AudioManager] Loaded ${this.sounds.size}/${soundManifest.length} sounds: ${this.getSoundNames().join(', ')}`);
  }

  /**
   * Play a sound (2D or 3D).
   * Returns a unique instance ID that can be used to update or stop this specific sound.
   */
  play(soundName: string, options: PlaySoundOptions = {}): string | null {
    if (!this.initialized) {
      console.warn(`[AudioManager] Cannot play "${soundName}" - not initialized yet`);
      return null;
    }

    // Try to unlock if not yet
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const soundDef = this.sounds.get(soundName);
    if (!soundDef || !soundDef.buffer) {
      if (!this.warnedSounds.has(soundName)) {
        console.warn(`[AudioManager] Sound "${soundName}" not loaded`);
        this.warnedSounds.add(soundName);
      }
      return null;
    }

    // Find available instance, or steal the oldest playing one
    let instance = soundDef.instances.find((inst) => !inst.inUse);
    if (!instance) {
      // Voice stealing: find the oldest playing instance
      let oldest: SoundInstance | null = null;
      let oldestTime = Infinity;
      for (const inst of soundDef.instances) {
        if (inst.startedAt < oldestTime) {
          oldestTime = inst.startedAt;
          oldest = inst;
        }
      }
      instance = oldest!;
    }

    // Stop previous source if any
    if (instance.source) {
      try { instance.source.stop(); } catch (_e) { /* ignore */ }
      instance.source.disconnect();
    }
    if (instance.stopTimeout) {
      clearTimeout(instance.stopTimeout);
      instance.stopTimeout = undefined;
    }

    instance.inUse = true;
    instance.startedAt = performance.now();
    instance.instanceId = `${soundName}_${++this.instanceCounter}`;

    // Create new source
    const source = this.ctx.createBufferSource();
    source.buffer = soundDef.buffer;
    source.loop = options.loop || false;

    if (options.playbackRate !== undefined) {
      source.playbackRate.value = options.playbackRate;
    }

    // Set volume
    const vol = options.volume !== undefined ? options.volume : 1.0;
    instance.gainNode.gain.value = vol;

    // Set spatial position and route through panner only when position is provided.
    // This allows spatial sounds to be played as direct 2D (e.g. own hurt sound)
    // by simply omitting the position option.
    if (instance.pannerNode && options.position) {
      instance.pannerNode.positionX.value = options.position.x;
      instance.pannerNode.positionY.value = options.position.y;
      instance.pannerNode.positionZ.value = options.position.z;
      source.connect(instance.pannerNode);
    } else {
      source.connect(instance.gainNode);
    }

    instance.source = source;

    // On ended, return to pool
    source.onended = () => {
      instance.inUse = false;
      instance.source = null;
      if (instance.stopTimeout) {
        clearTimeout(instance.stopTimeout);
        instance.stopTimeout = undefined;
      }
    };

    // Play with optional start time offset (skips silence at beginning)
    // source.start(when, offset, duration)
    // - when: 0 = now
    // - offset: where in the buffer to start (in seconds)
    // - duration: optional, how long to play
    source.start(0, soundDef.startTime);

    // Auto-stop after duration
    if (options.duration !== undefined && options.duration > 0) {
      instance.stopTimeout = window.setTimeout(() => {
        try { source.stop(); } catch (_e) { /* ignore */ }
        instance.inUse = false;
        instance.source = null;
        instance.stopTimeout = undefined;
      }, options.duration * 1000);
    }

    return instance.instanceId!;
  }

  /**
   * Update listener position and orientation for spatial audio (call each frame).
   */
  updateListener(
    x: number, y: number, z: number,
    forwardX?: number, forwardY?: number, forwardZ?: number,
    upX = 0, upY = 1, upZ = 0
  ): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerZ = z;

    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = z;
    }

    if (forwardX !== undefined && listener.forwardX) {
      listener.forwardX.value = forwardX;
      listener.forwardY.value = forwardY || 0;
      listener.forwardZ.value = forwardZ || 0;
    }

    if (listener.upX) {
      listener.upX.value = upX;
      listener.upY.value = upY;
      listener.upZ.value = upZ;
    }
  }

  /**
   * Stop all instances of a sound.
   */
  stop(soundName: string): void {
    const soundDef = this.sounds.get(soundName);
    if (!soundDef) return;

    for (const instance of soundDef.instances) {
      if (instance.source && instance.inUse) {
        try { instance.source.stop(); } catch (_e) { /* ignore */ }
        instance.source = null;
      }
      instance.inUse = false;
      if (instance.stopTimeout) {
        clearTimeout(instance.stopTimeout);
        instance.stopTimeout = undefined;
      }
    }
  }

  /**
   * Update properties of currently playing sound instances.
   * Useful for dynamic volume and playback rate changes (e.g., heartbeat).
   */
  updateSoundProperties(soundName: string, options: { volume?: number; playbackRate?: number }): void {
    const soundDef = this.sounds.get(soundName);
    if (!soundDef) return;

    const channel = this.channels.get(soundDef.channel);
    if (!channel) return;

    for (const instance of soundDef.instances) {
      if (instance.inUse && instance.source) {
        // Update volume
        if (options.volume !== undefined) {
          const finalVolume = options.volume * channel.volume;
          instance.gainNode.gain.value = finalVolume;
        }
        
        // Update playback rate
        if (options.playbackRate !== undefined && instance.source.playbackRate) {
          instance.source.playbackRate.value = options.playbackRate;
        }
      }
    }
  }

  /**
   * Stop all sounds across all channels.
   */
  stopAll(): void {
    for (const soundDef of this.sounds.values()) {
      for (const instance of soundDef.instances) {
        if (instance.source && instance.inUse) {
          try { instance.source.stop(); } catch (_e) { /* ignore */ }
          instance.source = null;
        }
        instance.inUse = false;
        if (instance.stopTimeout) {
          clearTimeout(instance.stopTimeout);
          instance.stopTimeout = undefined;
        }
      }
    }
  }

  /**
   * Stop a specific sound instance by its ID.
   */
  stopInstance(instanceId: string): void {
    for (const soundDef of this.sounds.values()) {
      for (const instance of soundDef.instances) {
        if (instance.instanceId === instanceId && instance.inUse) {
          if (instance.source) {
            try { instance.source.stop(); } catch (_e) { /* ignore */ }
            instance.source = null;
          }
          instance.inUse = false;
          instance.instanceId = undefined;
          if (instance.stopTimeout) {
            clearTimeout(instance.stopTimeout);
            instance.stopTimeout = undefined;
          }
          return;
        }
      }
    }
  }

  /**
   * Update the spatial position of a specific sound instance.
   */
  updateInstancePosition(instanceId: string, x: number, y: number, z: number): void {
    for (const soundDef of this.sounds.values()) {
      for (const instance of soundDef.instances) {
        if (instance.instanceId === instanceId && instance.inUse && instance.pannerNode) {
          instance.pannerNode.positionX.value = x;
          instance.pannerNode.positionY.value = y;
          instance.pannerNode.positionZ.value = z;
          return;
        }
      }
    }
  }

  /**
   * Update the volume of a specific sound instance.
   */
  updateInstanceVolume(instanceId: string, volume: number): void {
    for (const soundDef of this.sounds.values()) {
      for (const instance of soundDef.instances) {
        if (instance.instanceId === instanceId && instance.inUse) {
          instance.gainNode.gain.value = Math.max(0, Math.min(1, volume));
          return;
        }
      }
    }
  }

  /**
   * Update the playback rate of a specific sound instance.
   */
  updateInstancePlaybackRate(instanceId: string, playbackRate: number): void {
    for (const soundDef of this.sounds.values()) {
      for (const instance of soundDef.instances) {
        if (instance.instanceId === instanceId && instance.inUse && instance.source) {
          instance.source.playbackRate.value = Math.max(0.1, Math.min(4, playbackRate));
          return;
        }
      }
    }
  }

  /**
   * Pause all sounds by suspending the AudioContext.
   */
  pauseAll(): void {
    this.ctx.suspend();
  }

  /**
   * Resume all paused sounds.
   */
  resumeAll(): void {
    this.ctx.resume();
  }

  /**
   * Set master volume (0-1).
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.value = this.masterMuted ? 0 : this.masterVolume;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    this.masterGain.gain.value = this.masterMuted ? 0 : this.masterVolume;
  }

  isMasterMuted(): boolean {
    return this.masterMuted;
  }

  getSoundNames(): string[] {
    return Array.from(this.sounds.keys());
  }

  hasSound(soundName: string): boolean {
    return this.sounds.has(soundName);
  }

  dispose(): void {
    this.stopAll();
    this.ctx.close();
    this.sounds.clear();
    this.channels.clear();
    AudioManager.instance = null;
  }
}
