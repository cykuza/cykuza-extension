import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectWithFailover,
  ElectrumClient,
  ELECTRUM_CONNECT_TIMEOUT_MS,
} from './client';

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  url: string;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener, _opts?: unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }

  send(data: string) {
    const msg = JSON.parse(data) as { id: number; method: string };
    queueMicrotask(() => {
      if (msg.method === 'server.version') {
        this.emit('message', {
          data: JSON.stringify({
            id: msg.id,
            result: ['ElectrumX', '1.4'],
          }),
        });
      } else if (msg.method === 'blockchain.scripthash.get_balance') {
        this.emit('message', {
          data: JSON.stringify({
            id: msg.id,
            result: { confirmed: 100, unconfirmed: 0 },
          }),
        });
      }
    });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  fail() {
    this.emit('error');
    this.close();
  }

  private emit(type: string, event?: unknown) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) {
      fn(event);
    }
  }

  /** Test helper — fire a listener event from outside. */
  emitPublic(type: string, event?: unknown) {
    this.emit(type, event);
  }
}

describe('ElectrumClient', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    vi.useRealTimers();
    FakeWebSocket.instances = [];
    globalThis.WebSocket = OriginalWebSocket;
  });

  function installFakeWs() {
    // @ts-expect-error test double
    globalThis.WebSocket = FakeWebSocket;
  }

  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('rejects ws://', async () => {
    const client = new ElectrumClient();
    await expect(client.connect('ws://example.com:50004')).rejects.toThrow(
      /wss:\/\//
    );
  });

  it('connects and probes server.version', async () => {
    installFakeWs();
    const client = new ElectrumClient();
    const pending = client.connectAndProbe('wss://good.example:50004');
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!.open();
    const version = await pending;
    expect(version).toEqual(['ElectrumX', '1.4']);
    expect(client.serverUrl).toBe('wss://good.example:50004');
    client.disconnect();
  });

  it('times out connect', async () => {
    installFakeWs();
    vi.useFakeTimers();
    const client = new ElectrumClient();
    const pending = client.connect('wss://slow.example:50004');
    await flush();
    vi.advanceTimersByTime(ELECTRUM_CONNECT_TIMEOUT_MS + 1);
    await expect(pending).rejects.toThrow(/timed out/i);
  });

  it('failover skips failing server then succeeds', async () => {
    installFakeWs();
    const pending = connectWithFailover([
      'wss://bad.example:50004',
      'wss://good.example:50004',
    ]);

    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!.fail();
    await flush();
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    FakeWebSocket.instances[1]!.open();

    const result = await pending;
    expect(result.serverUrl).toBe('wss://good.example:50004');
    result.client.disconnect();
  });

  it('all servers fail with host-free Connection failed', async () => {
    installFakeWs();
    const pending = connectWithFailover(['wss://bad.example:50004']);
    await flush();
    FakeWebSocket.instances[0]!.fail();
    await expect(pending).rejects.toThrow('Connection failed');
  });

  it('dispatches scripthash subscribe notifications', async () => {
    installFakeWs();
    const client = new ElectrumClient();
    const pending = client.connect('wss://good.example:50004');
    await flush();
    FakeWebSocket.instances[0]!.open();
    await pending;

    const ws = FakeWebSocket.instances[0]!;
    const originalSend = ws.send.bind(ws);
    ws.send = (data: string) => {
      const msg = JSON.parse(data) as { id: number; method: string };
      if (msg.method === 'blockchain.scripthash.subscribe') {
        queueMicrotask(() => {
          ws.emitPublic('message', {
            data: JSON.stringify({ id: msg.id, result: 'status-initial' }),
          });
        });
        return;
      }
      originalSend(data);
    };

    const notifications: unknown[][] = [];
    const status = await client.subscribeScripthash('abc', (params) => {
      notifications.push(params);
    });
    expect(status).toBe('status-initial');

    ws.emitPublic('message', {
      data: JSON.stringify({
        method: 'blockchain.scripthash.subscribe',
        params: ['abc', 'status-next'],
      }),
    });
    expect(notifications).toEqual([['abc', 'status-next']]);
    client.disconnect();
  });

  it('ignores notifications without a registered handler', async () => {
    installFakeWs();
    const client = new ElectrumClient();
    const pending = client.connect('wss://good.example:50004');
    await flush();
    FakeWebSocket.instances[0]!.open();
    await pending;

    // Should not throw.
    FakeWebSocket.instances[0]!.emitPublic('message', {
      data: JSON.stringify({
        method: 'blockchain.headers.subscribe',
        params: [{ height: 1 }],
      }),
    });
    client.disconnect();
  });
});
