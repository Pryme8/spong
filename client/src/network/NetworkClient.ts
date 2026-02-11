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

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  private lowFreqHandlers = new Map<Opcode, LowFrequencyHandler[]>();
  private highFreqHandlers = new Map<Opcode, HighFrequencyHandler[]>();
  private projectileSpawnHandlers: ProjectileSpawnHandler[] = [];
  private projectileSpawnBatchHandlers: ProjectileSpawnBatchHandler[] = [];
  private projectileDestroyHandlers: ProjectileDestroyHandler[] = [];
  private connectionListeners: Array<() => void> = [];
  private disconnectionListeners: Array<() => void> = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[NetworkClient] Attempting WebSocket connection to:', this.url);
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          console.log('[NetworkClient] Connected to server');
          this.reconnectAttempts = 0;
          this.connectionListeners.forEach(cb => cb());
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[NetworkClient] WebSocket error. URL:', this.url, 'Error:', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('[NetworkClient] Disconnected from server. Code:', event.code, 'Reason:', event.reason);
          this.disconnectionListeners.forEach(cb => cb());
          this.attemptReconnect();
        };
      } catch (err) {
        console.error('[NetworkClient] Exception during connection attempt:', err);
        reject(err);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Reconnection failed:', err);
        });
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
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
      console.warn('Received string message, expected binary');
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
          console.error(`[NetworkClient] Server error: ${payload.code} - ${payload.message}`);
        } catch (err) {
          console.error('[NetworkClient] Failed to parse error message:', err);
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
          console.error('Error parsing low-frequency message:', err);
        }
      } else {
        console.warn(`[NetworkClient] No handler for low-frequency opcode: 0x${opcode.toString(16)}`);
      }
    }
  }

  sendLow(opcode: Opcode, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not connected');
      return;
    }

    const json = JSON.stringify(payload);
    console.log(`[NetworkClient] Sending opcode 0x${opcode.toString(16)}, JSON: ${json}`);
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(json);
    const buffer = new ArrayBuffer(1 + jsonBytes.length);
    const view = new DataView(buffer);
    
    view.setUint8(0, opcode);
    new Uint8Array(buffer, 1).set(jsonBytes);
    
    this.ws.send(buffer);
  }

  sendBinary(data: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send binary: WebSocket not connected');
      return;
    }

    this.ws.send(data);
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
}
