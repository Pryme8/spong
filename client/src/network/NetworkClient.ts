import {
  Opcode,
  decodeTransform,
  TransformData,
  InputData,
  encodeInput,
  encodeShoot,
  ProjectileSpawnData,
  ProjectileDestroyData,
  decodeProjectileSpawn,
  decodeProjectileDestroy,
  decodeProjectileSpawnBatch
} from '@spong/shared';

export type LowFrequencyHandler = (payload: any) => void;
export type HighFrequencyHandler = (data: TransformData) => void;
export type ProjectileSpawnHandler = (data: ProjectileSpawnData) => void;
export type ProjectileSpawnBatchHandler = (data: ProjectileSpawnData[]) => void;
export type ProjectileDestroyHandler = (data: ProjectileDestroyData) => void;
export type InputHandler = (data: InputData) => void;

const MAX_SIMULATED_LATENCY_MS = 5000;

/**
 * Read simulated latency from URL (e.g. ?latency=100 or ?lag=100).
 * One-way delay in ms; applied to both incoming and outgoing (RTT = 2 * value).
 */
export function getSimulatedLatencyMs(): number {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search);
  const v = params.get('latency') ?? params.get('lag');
  if (v == null) return 0;
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? 0 : Math.min(n, MAX_SIMULATED_LATENCY_MS);
}

/** Build WebSocket URL. Always uses wss when page is HTTPS (required by browser). */
export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) {
    const secure = window.location.protocol === 'https:';
    if (secure && envUrl.startsWith('ws://')) return envUrl.replace(/^ws:\/\//, 'wss://');
    return envUrl;
  }
  const secure = window.location.protocol === 'https:';
  const protocol = secure ? 'wss:' : 'ws:';
  if (import.meta.env.DEV) return `${protocol}//${window.location.host}/ws`;
  if (secure) return `${protocol}//${window.location.host}/ws`;
  return `${protocol}//${window.location.hostname}:3000/ws`;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  /** One-way simulated latency in ms (incoming and outgoing). RTT = 2 * this. */
  private simulatedLatencyMs = 0;

  private lowFreqHandlers = new Map<Opcode, LowFrequencyHandler[]>();
  private highFreqHandlers = new Map<Opcode, HighFrequencyHandler[]>();
  private projectileSpawnHandlers: ProjectileSpawnHandler[] = [];
  private projectileSpawnBatchHandlers: ProjectileSpawnBatchHandler[] = [];
  private projectileDestroyHandlers: ProjectileDestroyHandler[] = [];
  private connectionListeners: Array<() => void> = [];
  private disconnectionListeners: Array<() => void> = [];

  constructor(url: string) {
    this.url = url;
    this.simulatedLatencyMs = getSimulatedLatencyMs();
    if (this.simulatedLatencyMs > 0) {
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.connectionListeners.forEach(cb => cb());
          resolve();
        };

        this.ws.onmessage = (event) => {
          const data = event.data;
          if (this.simulatedLatencyMs > 0) {
            const copy = data instanceof ArrayBuffer ? data.slice(0) : data;
            setTimeout(() => this.handleMessage(copy), this.simulatedLatencyMs);
          } else {
            this.handleMessage(data);
          }
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.disconnectionListeners.forEach(cb => cb());
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => {
        this.connect().catch(err => {
        });
      }, delay);
    } else {
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: ArrayBuffer | string) {
    if (typeof data === 'string') {
      return;
    }

    const view = new DataView(data);
    const opcode = view.getUint8(0);

    // High-frequency binary message
    if (opcode <= 0x0f) {
      if (opcode === Opcode.TransformUpdate) {
        const handlers = this.highFreqHandlers.get(opcode);
        if (handlers) {
          const transformData = decodeTransform(data);
          handlers.forEach(handler => handler(transformData));
        }
      } else if (opcode === Opcode.ProjectileSpawn) {
        const spawnData = decodeProjectileSpawn(data);
        this.projectileSpawnHandlers.forEach(h => h(spawnData));
      } else if (opcode === Opcode.ProjectileSpawnBatch) {
        const batchData = decodeProjectileSpawnBatch(data);
        this.projectileSpawnBatchHandlers.forEach(h => h(batchData));
      } else if (opcode === Opcode.ProjectileDestroy) {
        const destroyData = decodeProjectileDestroy(data);
        this.projectileDestroyHandlers.forEach(h => h(destroyData));
      }
    } else {
      // Low-frequency JSON message
      
      // Handle error messages specially (0xFF)
      if (opcode === Opcode.Error) {
        try {
          const jsonBytes = new Uint8Array(data, 1);
          const jsonString = new TextDecoder().decode(jsonBytes);
          const payload = JSON.parse(jsonString);
        } catch (err) {
        }
        return;
      }
      
      const handlers = this.lowFreqHandlers.get(opcode);
      if (handlers) {
        try {
          const jsonBytes = new Uint8Array(data, 1);
          const jsonString = new TextDecoder().decode(jsonBytes);
          const payload = JSON.parse(jsonString);
          handlers.forEach(handler => handler(payload));
        } catch (err) {
        }
      } else {
      }
    }
  }

  private doSend(buffer: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(buffer);
  }

  sendLow(opcode: Opcode, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const json = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(json);
    const buffer = new ArrayBuffer(1 + jsonBytes.length);
    const view = new DataView(buffer);

    view.setUint8(0, opcode);
    new Uint8Array(buffer, 1).set(jsonBytes);

    if (this.simulatedLatencyMs > 0) {
      setTimeout(() => this.doSend(buffer), this.simulatedLatencyMs);
    } else {
      this.doSend(buffer);
    }
  }

  sendBinary(data: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.simulatedLatencyMs > 0) {
      setTimeout(() => this.doSend(data), this.simulatedLatencyMs);
    } else {
      this.doSend(data);
    }
  }
  
  sendInput(input: InputData) {
    const buffer = encodeInput(Opcode.PlayerInput, input);
    this.sendBinary(buffer);
  }

  sendShoot(
    dirX: number, 
    dirY: number, 
    dirZ: number,
    spawnX: number,
    spawnY: number,
    spawnZ: number
  ) {
    const buffer = encodeShoot(Opcode.ShootRequest, {
      timestamp: performance.now(),
      dirX, dirY, dirZ,
      spawnX, spawnY, spawnZ
    });
    this.sendBinary(buffer);
  }

  sendReload() {
    this.sendLow(Opcode.ReloadRequest, {});
  }

  sendItemDrop() {
    this.sendLow(Opcode.ItemDrop, {});
  }

  sendItemTossLand(posX: number, posY: number, posZ: number) {
    this.sendLow(Opcode.ItemTossLand, { posX, posY, posZ });
  }

  onLowFrequency(opcode: Opcode, handler: LowFrequencyHandler) {
    if (!this.lowFreqHandlers.has(opcode)) {
      this.lowFreqHandlers.set(opcode, []);
    }
    this.lowFreqHandlers.get(opcode)!.push(handler);
  }

  onHighFrequency(opcode: Opcode, handler: HighFrequencyHandler) {
    if (!this.highFreqHandlers.has(opcode)) {
      this.highFreqHandlers.set(opcode, []);
    }
    this.highFreqHandlers.get(opcode)!.push(handler);
  }

  onProjectileSpawn(handler: ProjectileSpawnHandler) {
    this.projectileSpawnHandlers.push(handler);
  }

  onProjectileSpawnBatch(handler: ProjectileSpawnBatchHandler) {
    this.projectileSpawnBatchHandlers.push(handler);
  }

  onProjectileDestroy(handler: ProjectileDestroyHandler) {
    this.projectileDestroyHandlers.push(handler);
  }

  onConnect(callback: () => void) {
    this.connectionListeners.push(callback);
  }

  onDisconnect(callback: () => void) {
    this.disconnectionListeners.push(callback);
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Simulated one-way latency in ms (0 = disabled). RTT ≈ 2 * this when active. */
  get simulatedLatency(): number {
    return this.simulatedLatencyMs;
  }
}
