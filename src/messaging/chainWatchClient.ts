/**
 * Popup-side client for UI-scoped Electrum watch over chrome.runtime.Port.
 */

import type { WalletStatus } from './protocol';
import {
  CHAIN_WATCH_PORT,
  parseWatchServerMessage,
  type WatchServerMessage,
} from './watchProtocol';

export type ChainWatchHandlers = {
  onStatus: (status: WalletStatus) => void;
  onError: (error: string, status?: WalletStatus) => void;
};

export type ChainWatchHandle = {
  /** Ask SW to (re)start subscribe + initial refresh. */
  start: () => void;
  /** Disconnect Port — SW tears down the Electrum socket. */
  stop: () => void;
};

/**
 * Open a named Port for the duration of an unlocked popup session.
 * Call stop() on lock or unmount.
 */
export function connectChainWatch(handlers: ChainWatchHandlers): ChainWatchHandle {
  const port = chrome.runtime.connect({ name: CHAIN_WATCH_PORT });

  const onMessage = (raw: unknown) => {
    const parsed = parseWatchServerMessage(raw);
    if (!parsed.success) return;
    const msg: WatchServerMessage = parsed.data;
    if (msg.type === 'watch/status') {
      handlers.onStatus(msg.status);
      return;
    }
    handlers.onError(msg.error, msg.status);
  };

  port.onMessage.addListener(onMessage);

  return {
    start: () => {
      try {
        port.postMessage({ type: 'watch/start' });
      } catch {
        // Port disconnected.
      }
    },
    stop: () => {
      try {
        port.onMessage.removeListener(onMessage);
        port.disconnect();
      } catch {
        // ignore
      }
    },
  };
}
