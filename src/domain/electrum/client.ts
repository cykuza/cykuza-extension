/**
 * Browser Electrum JSON-RPC client over wss://.
 *
 * Lifecycle contract (MV3):
 *   - Batch: connect → probe (server.version) → RPCs → disconnect
 *   - Watch: connect → probe → subscribe → stay open only while a UI Port
 *     keeps the service worker alive; disconnect on Port close / lock.
 * The service worker must not keep a long-lived socket across idle periods.
 * Use `connectWithFailover` / `withElectrumBatch` (sw layer) for batch mode.
 *
 * Pure domain logic — no chrome.* APIs.
 * Error messages never embed hostnames / URLs (operational privacy).
 */

import { ElectrumError } from '../errors';
import { sanitizeElectrumRpcMessage } from '../redact';
import { parseWssUrl } from './url';

type ResolveReject = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Electrum JSON-RPC notification params (method has no request id). */
export type SubscriptionHandler = (params: unknown[]) => void;

export const ELECTRUM_CONNECT_TIMEOUT_MS = 10_000;
export const ELECTRUM_RPC_TIMEOUT_MS = 12_000;

export class ElectrumClient {
  private ws?: WebSocket;
  private id = 0;
  private pending = new Map<number, ResolveReject>();
  private subscriptions = new Map<string, SubscriptionHandler>();
  private url: string | null = null;
  private connectTimer?: ReturnType<typeof setTimeout>;

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  get serverUrl(): string | null {
    return this.url;
  }

  async connect(url: string): Promise<void> {
    const normalized = parseWssUrl(url);
    this.disconnect();
    this.url = normalized;
    this.id = 0;

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
        }
        fn();
      };

      try {
        this.ws = new WebSocket(normalized);
      } catch {
        this.url = null;
        reject(new ElectrumError('CONNECT_FAILED'));
        return;
      }

      const handleOpen = () => settle(() => resolve());
      const handleError = () =>
        settle(() => {
          this.cleanupSocket();
          reject(new ElectrumError('CONNECT_FAILED'));
        });
      const handleClose = () => {
        // After a successful open, still clear pending RPCs on socket close.
        if (settled) {
          this.resetPending(new ElectrumError('CLOSED'));
          this.ws = undefined;
          return;
        }
        settle(() => {
          this.resetPending(new ElectrumError('CLOSED'));
          this.ws = undefined;
          reject(new ElectrumError('CONNECT_FAILED'));
        });
      };

      this.ws.addEventListener('open', handleOpen, { once: true });
      this.ws.addEventListener('error', handleError, { once: true });
      this.ws.addEventListener('close', handleClose, { once: true });
      this.ws.addEventListener('message', this.onMessage);

      this.connectTimer = setTimeout(() => {
        settle(() => {
          this.cleanupSocket();
          reject(new ElectrumError('CONNECT_TIMEOUT'));
        });
      }, ELECTRUM_CONNECT_TIMEOUT_MS);
    });
  }

  /**
   * Connect and require a successful server.version probe (protocol ≥ 1.4).
   */
  async connectAndProbe(url: string): Promise<[string, string]> {
    await this.connect(url);
    try {
      return await this.serverVersion();
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  disconnect(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
    this.cleanupSocket();
    this.resetPending(new ElectrumError('CLOSED'));
    this.subscriptions.clear();
    this.url = null;
  }

  private cleanupSocket(): void {
    if (!this.ws) return;
    this.ws.removeEventListener('message', this.onMessage);
    try {
      this.ws.close();
    } catch {
      // Best-effort close.
    }
    this.ws = undefined;
  }

  private resetPending(reason: Error): void {
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(reason);
    });
    this.pending.clear();
  }

  private onMessage = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: unknown;
        error?: { message?: string };
        result?: unknown;
      };
      if (payload.id !== undefined && this.pending.has(payload.id)) {
        const entry = this.pending.get(payload.id)!;
        this.pending.delete(payload.id);
        clearTimeout(entry.timer);
        if (payload.error) {
          entry.reject(
            new ElectrumError(
              'RPC_ERROR',
              sanitizeElectrumRpcMessage(payload.error.message)
            )
          );
        } else {
          entry.resolve(payload.result);
        }
        return;
      }
      // JSON-RPC notification: no id, method + params.
      if (payload.method && Array.isArray(payload.params)) {
        const handler = this.subscriptions.get(payload.method);
        if (handler) handler(payload.params);
      }
    } catch {
      // Ignore malformed frames; pending calls will time out.
    }
  };

  private send(method: string, params: unknown[] = []): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new ElectrumError('NOT_CONNECTED'));
    }
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, jsonrpc: '2.0' }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(
            new ElectrumError(
              'RPC_TIMEOUT',
              `Electrum request timed out: ${method}`
            )
          );
        }
      }, ELECTRUM_RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  serverVersion(): Promise<[string, string]> {
    return this.send('server.version', ['cykuza-extension', '1.4']) as Promise<
      [string, string]
    >;
  }

  getBalance(
    scripthash: string
  ): Promise<{ confirmed: number; unconfirmed: number }> {
    return this.send('blockchain.scripthash.get_balance', [scripthash]) as Promise<{
      confirmed: number;
      unconfirmed: number;
    }>;
  }

  getHistory(
    scripthash: string
  ): Promise<Array<{ tx_hash: string; height: number }>> {
    return this.send('blockchain.scripthash.get_history', [
      scripthash,
    ]) as Promise<Array<{ tx_hash: string; height: number }>>;
  }

  listUnspent(
    scripthash: string
  ): Promise<
    Array<{ tx_hash: string; tx_pos: number; height: number; value: number }>
  > {
    return this.send('blockchain.scripthash.listunspent', [
      scripthash,
    ]) as Promise<
      Array<{ tx_hash: string; tx_pos: number; height: number; value: number }>
    >;
  }

  estimateFee(blocks = 6): Promise<number> {
    return this.send('blockchain.estimatefee', [blocks]) as Promise<number>;
  }

  broadcast(raw: string): Promise<string> {
    return this.send('blockchain.transaction.broadcast', [raw]) as Promise<string>;
  }

  ping(): Promise<null> {
    return this.send('server.ping') as Promise<null>;
  }

  /**
   * Subscribe to scripthash status changes. Notifications invoke `handler`
   * with Electrum params (typically `[scripthash, status]`).
   * Returns the initial status string from the subscribe RPC result.
   */
  subscribeScripthash(
    scripthash: string,
    handler: SubscriptionHandler
  ): Promise<string> {
    this.subscriptions.set('blockchain.scripthash.subscribe', handler);
    return this.send('blockchain.scripthash.subscribe', [scripthash]) as Promise<string>;
  }
}

export interface ConnectFailoverResult {
  client: ElectrumClient;
  serverUrl: string;
  version: [string, string];
}

/**
 * Try servers in sticky order until one connects and answers server.version.
 * Caller owns the returned client and must disconnect after the batch.
 * On total failure throws ElectrumError('CONNECT_FAILED') without host details.
 */
export async function connectWithFailover(
  urls: readonly string[]
): Promise<ConnectFailoverResult> {
  if (urls.length === 0) {
    throw new ElectrumError('NO_SERVERS');
  }
  for (const url of urls) {
    const client = new ElectrumClient();
    try {
      const version = await client.connectAndProbe(url);
      return {
        client,
        serverUrl: client.serverUrl ?? url,
        version,
      };
    } catch {
      client.disconnect();
    }
  }
  throw new ElectrumError('CONNECT_FAILED');
}
