/**
 * Network worker — owns the WebSocket off the main thread.
 *
 * Why: when the socket lives on the main thread, the `onmessage` callback (and
 * therefore the message arrival timestamp) is delayed while a render frame is
 * executing, inflating measured latency and deferring server state. Running the
 * socket in a worker means messages are received and timestamped immediately,
 * regardless of how busy the render thread is.
 *
 * This worker only relays RAW bytes both ways and handles connect/reconnect +
 * simulated latency. All decoding stays on the main thread (NetworkClient), so
 * the worker has no dependency on @spong/shared.
 *
 * Timestamps use Date.now() (epoch, consistent across threads) — performance.now()
 * has a different origin per thread and could not be compared to the main thread.
 */

type InitMsg = { type: 'init'; url: string; simulatedLatencyMs: number };
type SendMsg = { type: 'send'; data: ArrayBuffer };
type CloseMsg = { type: 'close' };
type InboundMsg = InitMsg | SendMsg | CloseMsg;

// `self` is the DedicatedWorkerGlobalScope; cast to any to avoid DOM/webworker lib conflicts.
const ctx: any = self;

let ws: WebSocket | null = null;
let url = '';
let simulatedLatencyMs = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;
let closedByMain = false;

function open(): void {
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    reconnectAttempts = 0;
    ctx.postMessage({ type: 'open' });
  };

  ws.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!(data instanceof ArrayBuffer)) return;
    if (simulatedLatencyMs > 0) {
      const copy = data.slice(0);
      setTimeout(() => {
        // Stamp recvTime when the main thread will actually "see" it (after the
        // simulated delay) so RTT ≈ 2 * simulatedLatencyMs as documented.
        ctx.postMessage({ type: 'msg', data: copy, recvTime: Date.now() }, [copy]);
      }, simulatedLatencyMs);
    } else {
      ctx.postMessage({ type: 'msg', data, recvTime: Date.now() }, [data]);
    }
  };

  ws.onclose = () => {
    ctx.postMessage({ type: 'close' });
    if (!closedByMain) attemptReconnect();
  };

  ws.onerror = () => {
    ctx.postMessage({ type: 'error' });
  };
}

function attemptReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  setTimeout(() => {
    if (!closedByMain) open();
  }, delay);
}

ctx.onmessage = (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    url = msg.url;
    simulatedLatencyMs = msg.simulatedLatencyMs;
    closedByMain = false;
    reconnectAttempts = 0;
    open();
  } else if (msg.type === 'send') {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (simulatedLatencyMs > 0) {
      const buf = msg.data;
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(buf);
      }, simulatedLatencyMs);
    } else {
      ws.send(msg.data);
    }
  } else if (msg.type === 'close') {
    closedByMain = true;
    if (ws) {
      ws.close();
      ws = null;
    }
  }
};
