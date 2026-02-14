import { WebSocket } from 'ws';
import { Opcode } from '@spong/shared';

export interface ConnectionState {
  id: string;
  ws: WebSocket;
  roomId?: string;
  entityId?: number;
  isAlive: boolean;
}

export type MessageHandler = (conn: ConnectionState, data: any) => void | Promise<void>;
export type BinaryHandler = (conn: ConnectionState, buffer: ArrayBuffer) => void | Promise<void>;
export type DisconnectHandler = (conn: ConnectionState) => void | Promise<void>;

export class ConnectionHandler {
  private connections = new Map<string, ConnectionState>();
  private messageHandlers = new Map<number, MessageHandler>();
  private binaryHandlers = new Map<number, BinaryHandler>();
  private disconnectHandlers: DisconnectHandler[] = [];
  private nextId = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 30000);
  }

  dispose(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const conns = Array.from(this.connections.values());
    this.connections.clear();
    for (const conn of conns) {
      try {
        conn.ws.terminate();
      } catch (_) {}
    }
  }

  registerMessageHandler(opcode: Opcode, handler: MessageHandler) {
    this.messageHandlers.set(opcode, handler);
  }

  registerBinaryHandler(opcode: Opcode, handler: BinaryHandler) {
    this.binaryHandlers.set(opcode, handler);
  }

  registerDisconnectHandler(handler: DisconnectHandler) {
    this.disconnectHandlers.push(handler);
  }

  handleConnection(ws: WebSocket) {
    const id = `conn_${this.nextId++}`;
    const conn: ConnectionState = {
      id,
      ws,
      isAlive: true
    };

    this.connections.set(id, conn);

    // Handle pong responses
    ws.on('pong', () => {
      conn.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      this.handleMessage(conn, data);
    });

    // Handle disconnect
    ws.on('close', () => {
      this.handleDisconnect(conn);
    });

    ws.on('error', (_err) => {

    });

  }

  private async handleMessage(conn: ConnectionState, data: Buffer) {
    if (data.length === 0) return;

    const opcode = data[0];

    // Check if it's a binary message (high-frequency)
    if (opcode <= 0x0f) {
      const handler = this.binaryHandlers.get(opcode);
      if (handler) {
        // Convert Buffer to ArrayBuffer
        const arrayBuffer = new ArrayBuffer(data.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(data);
        await handler(conn, arrayBuffer);
      } else {

      }
    } else {
      // Low-frequency JSON message
      const handler = this.messageHandlers.get(opcode);
      if (handler) {
        try {
          const json = data.slice(1).toString('utf-8');

          const payload = JSON.parse(json);
          await handler(conn, payload);
        } catch (_err) {
          this.sendError(conn, 'PARSE_ERROR', 'Invalid JSON payload');
        }
      } else {

      }
    }
  }

  private handleDisconnect(conn: ConnectionState) {

    // Notify all disconnect handlers
    this.disconnectHandlers.forEach(handler => {
      handler(conn);
    });
    
    this.connections.delete(conn.id);
  }

  private heartbeat() {
    this.connections.forEach((conn) => {
      if (!conn.isAlive) {

        conn.ws.terminate();
        this.connections.delete(conn.id);
        return;
      }

      conn.isAlive = false;
      conn.ws.ping();
    });
  }

  send(conn: ConnectionState, data: Buffer | ArrayBuffer) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
    }
  }

  sendLow(conn: ConnectionState, opcode: Opcode, payload: any) {
    const json = JSON.stringify(payload);
    const buffer = Buffer.allocUnsafe(1 + json.length);
    buffer[0] = opcode;
    buffer.write(json, 1, 'utf-8');
    this.send(conn, buffer);
  }

  sendError(conn: ConnectionState, code: string, message: string) {
    this.sendLow(conn, Opcode.Error, { code, message });
  }

  broadcast(roomConnections: ConnectionState[], data: Buffer | ArrayBuffer) {
    roomConnections.forEach((conn) => {
      this.send(conn, data);
    });
  }

  getConnection(id: string): ConnectionState | undefined {
    return this.connections.get(id);
  }

  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }
}
