/**
 * UI-scoped Electrum watch session.
 *
 * While a popup Port (`cykuza-chain-watch`) is connected and the vault is
 * unlocked, hold one ElectrumClient with scripthash.subscribe. Disconnect the
 * socket on Port close, lock, or teardown — never across idle SW periods.
 *
 * Batch ops (send, probe) stay on withElectrum* paths. handleRefresh reuses
 * the watch client when present. Network/endpoint changes restart via
 * restartWatchIfPortConnected (SW owns restart; UI keeps the Port stable).
 */

import {
  connectWithFailover,
  ElectrumClient,
} from '../domain/electrum/client';
import { chainFingerprint } from '../domain/electrum/fingerprint';
import { ElectrumError } from '../domain/errors';
import { ElectrumTrustBlockedError } from '../domain/electrumTrust';
import { safeErrorMessage } from '../domain/redact';
import {
  ElectrumUnconfiguredError,
  getConnectCandidates,
  setActiveUrl,
  type WalletSettings,
} from '../domain/settings';
import type { Utxo } from '../domain/transaction';
import {
  parseWatchClientMessage,
  type WatchServerMessage,
} from '../messaging/watchProtocol';
import { filterPermittedUrls } from '../platform/permissions';
import { readSettings, writeSettings } from '../platform/storage';
import { requireElectrumTrustForChainOps } from './electrumTrustGate';
import { refreshFromClient } from './session/chainSnapshot';
import { armAutoLock, sessionRam } from './session/state';
import { buildStatus } from './session/status';

const WATCH_PING_MS = 20_000;
const WATCH_REFRESH_DEBOUNCE_MS = 400;

let watchClient: ElectrumClient | null = null;
let watchPort: chrome.runtime.Port | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on every stop so in-flight start/refresh aborts cleanly. */
let watchGeneration = 0;

export type WatchRefreshResult =
  | { ok: true; settings: WalletSettings }
  | { ok: false; reason: 'inactive' | 'stopped' | 'error'; error: string };

export function getWatchClient(): ElectrumClient | null {
  return watchClient?.connected ? watchClient : null;
}

/** After a one-shot batch, keep `connected` if the watch socket is still open. */
export function settleServerStatusAfterBatch(): void {
  sessionRam.lastServerStatus = getWatchClient() ? 'connected' : 'idle';
  sessionRam.lastServerError = undefined;
}

function syncWatchActiveFlag(): void {
  sessionRam.watchActive = !!getWatchClient();
}

function postToPort(msg: WatchServerMessage): void {
  if (!watchPort) return;
  try {
    watchPort.postMessage(msg);
  } catch {
    // Port may already be disconnected.
  }
}

async function persistActiveUrl(
  settings: WalletSettings,
  serverUrl: string
): Promise<WalletSettings> {
  const next = setActiveUrl(settings, settings.network, serverUrl);
  if (next !== settings) {
    await writeSettings(next);
    return next;
  }
  return settings;
}

function clearPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function clearRefreshDebounce(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function armPing(generation: number): void {
  clearPing();
  pingTimer = setInterval(() => {
    if (generation !== watchGeneration || !watchClient?.connected) return;
    void watchClient.ping().catch(() => {
      // Soft failure — scripthash notify or explicit refresh recovers.
    });
  }, WATCH_PING_MS);
}

/**
 * Tear down the Electrum socket (and optionally the Port).
 * Preserves `unconfigured`; otherwise resets status to idle.
 */
export function stopWatch(opts?: { disconnectPort?: boolean }): void {
  watchGeneration += 1;
  clearPing();
  clearRefreshDebounce();
  if (watchClient) {
    watchClient.disconnect();
    watchClient = null;
  }
  if (opts?.disconnectPort !== false && watchPort) {
    try {
      watchPort.disconnect();
    } catch {
      // ignore
    }
    watchPort = null;
  }
  syncWatchActiveFlag();
  if (sessionRam.lastServerStatus !== 'unconfigured') {
    sessionRam.lastServerStatus = 'idle';
  }
}

async function dualVerifyFingerprint(
  settings: WalletSettings,
  primary: {
    balance: { confirmed: number; unconfirmed: number };
    utxos: Utxo[];
  },
  excludeUrl: string
): Promise<void> {
  if (settings.verifyWithSecondServer !== true) return;

  const candidates = getConnectCandidates(settings, settings.network);
  const permitted = await filterPermittedUrls(candidates);
  if (permitted.length < 2) return;

  const secondaryUrl = permitted.find((u) => u !== excludeUrl);
  if (!secondaryUrl) {
    throw new ElectrumError('VERIFY_FAILED');
  }

  const secondary = new ElectrumClient();
  try {
    await secondary.connectAndProbe(secondaryUrl);
    const scripthash = sessionRam.identity?.scripthash;
    if (!scripthash) {
      throw new ElectrumError('VERIFY_FAILED');
    }
    const snap = await refreshFromClient(secondary, scripthash);
    const fpA = chainFingerprint(primary.balance, primary.utxos);
    const fpB = chainFingerprint(snap.balance, snap.utxos);
    if (fpA !== fpB) {
      throw new ElectrumError('SERVERS_DISAGREE');
    }
  } catch (err) {
    if (err instanceof ElectrumError) throw err;
    throw new ElectrumError('VERIFY_FAILED');
  } finally {
    secondary.disconnect();
  }
}

async function applyRefreshSnapshot(
  settings: WalletSettings,
  serverUrl: string,
  snap: Awaited<ReturnType<typeof refreshFromClient>>,
  generation: number
): Promise<WalletSettings> {
  if (generation !== watchGeneration) return settings;

  await dualVerifyFingerprint(settings, snap, serverUrl);

  if (generation !== watchGeneration) return settings;

  sessionRam.cachedBalance = snap.balance;
  sessionRam.cachedHistory = snap.history;
  sessionRam.cachedFeeRates = snap.feeRates;
  sessionRam.cachedUtxos = snap.utxos;
  sessionRam.lastServerUrl = serverUrl;
  sessionRam.lastServerStatus = 'connected';
  sessionRam.lastServerError = undefined;
  syncWatchActiveFlag();

  const next = await persistActiveUrl(settings, serverUrl);
  await armAutoLock(next);
  return next;
}

async function pushStatus(settings?: WalletSettings): Promise<void> {
  const status = await buildStatus(settings);
  postToPort({ type: 'watch/status', status });
}

async function pushError(error: string): Promise<void> {
  const status = await buildStatus();
  postToPort({ type: 'watch/error', error, status });
}

/**
 * Refresh chain data through the open watch client (no reconnect).
 */
export async function refreshViaWatch(): Promise<WatchRefreshResult> {
  const client = getWatchClient();
  if (!client || !sessionRam.identity) {
    return { ok: false, reason: 'inactive', error: 'Watch inactive' };
  }
  const generation = watchGeneration;
  const settings = await readSettings();
  const serverUrl = client.serverUrl ?? sessionRam.lastServerUrl;
  if (!serverUrl) {
    return { ok: false, reason: 'inactive', error: 'Watch inactive' };
  }

  try {
    await requireElectrumTrustForChainOps(settings);
    const snap = await refreshFromClient(client, sessionRam.identity.scripthash);
    const next = await applyRefreshSnapshot(
      settings,
      serverUrl,
      snap,
      generation
    );
    if (generation !== watchGeneration) {
      return { ok: false, reason: 'stopped', error: 'Watch stopped' };
    }
    return { ok: true, settings: next };
  } catch (err) {
    const message = safeErrorMessage(err);
    sessionRam.lastServerStatus = 'error';
    sessionRam.lastServerError = message;
    return { ok: false, reason: 'error', error: message };
  }
}

function scheduleNotifyRefresh(generation: number): void {
  clearRefreshDebounce();
  refreshTimer = setTimeout(() => {
    void (async () => {
      if (generation !== watchGeneration) return;
      const result = await refreshViaWatch();
      if (generation !== watchGeneration) return;
      if (result.ok) {
        await pushStatus(result.settings);
      } else if (result.reason === 'error') {
        await pushError(result.error);
      }
    })();
  }, WATCH_REFRESH_DEBOUNCE_MS);
}

/**
 * Connect, subscribe, initial refresh. Keeps the socket open.
 * If already live on this Port, pushes current status only.
 */
export async function startWatch(port: chrome.runtime.Port): Promise<void> {
  if (watchPort && watchPort !== port) {
    stopWatch({ disconnectPort: true });
  }
  watchPort = port;

  if (!sessionRam.identity) {
    await pushError('Wallet is locked');
    return;
  }

  if (getWatchClient()) {
    await pushStatus();
    return;
  }

  // Invalidate in-flight work and clear any half-open client; keep Port.
  stopWatch({ disconnectPort: false });
  watchPort = port;
  const generation = watchGeneration;

  sessionRam.lastServerStatus = 'connecting';
  sessionRam.lastServerError = undefined;
  syncWatchActiveFlag();
  await pushStatus();

  try {
    const settings = await readSettings();
    await requireElectrumTrustForChainOps(settings);

    let candidates: string[];
    try {
      candidates = getConnectCandidates(settings, settings.network);
    } catch (err) {
      if (err instanceof ElectrumUnconfiguredError) {
        sessionRam.lastServerStatus = 'unconfigured';
        sessionRam.lastServerError = err.message;
        await pushError(err.message);
        return;
      }
      throw err;
    }

    const permitted = await filterPermittedUrls(candidates);
    if (permitted.length === 0) {
      throw new ElectrumError('PERMISSION_REQUIRED');
    }

    const { client, serverUrl } = await connectWithFailover(permitted);
    if (generation !== watchGeneration) {
      client.disconnect();
      return;
    }

    watchClient = client;
    syncWatchActiveFlag();
    const scripthash = sessionRam.identity.scripthash;

    await client.subscribeScripthash(scripthash, () => {
      scheduleNotifyRefresh(generation);
    });

    if (generation !== watchGeneration) {
      client.disconnect();
      if (watchClient === client) watchClient = null;
      syncWatchActiveFlag();
      return;
    }

    const snap = await refreshFromClient(client, scripthash);
    const next = await applyRefreshSnapshot(
      settings,
      serverUrl,
      snap,
      generation
    );

    if (generation !== watchGeneration) {
      client.disconnect();
      if (watchClient === client) watchClient = null;
      syncWatchActiveFlag();
      return;
    }

    armPing(generation);
    await pushStatus(next);
  } catch (err) {
    if (generation !== watchGeneration) return;

    if (watchClient) {
      watchClient.disconnect();
      watchClient = null;
    }
    syncWatchActiveFlag();

    if (err instanceof ElectrumUnconfiguredError) {
      sessionRam.lastServerStatus = 'unconfigured';
      sessionRam.lastServerError = err.message;
      await pushError(err.message);
      return;
    }
    if (err instanceof ElectrumTrustBlockedError) {
      sessionRam.lastServerStatus = 'error';
      sessionRam.lastServerError = err.message;
      await pushError(err.message);
      return;
    }

    const message = safeErrorMessage(err);
    sessionRam.lastServerStatus = 'error';
    sessionRam.lastServerError = message;
    await pushError(message);
  }
}

/** SW-owned restart after network / endpoint changes (Port stays connected). */
export async function restartWatchIfPortConnected(): Promise<void> {
  const port = watchPort;
  if (!port) return;
  stopWatch({ disconnectPort: false });
  await startWatch(port);
}

export function bindWatchPort(port: chrome.runtime.Port): void {
  watchPort = port;
  port.onDisconnect.addListener(() => {
    if (watchPort === port) {
      watchPort = null;
      stopWatch({ disconnectPort: false });
    }
  });
  port.onMessage.addListener((raw) => {
    const parsed = parseWatchClientMessage(raw);
    if (!parsed.success) return;
    if (parsed.data.type === 'watch/start') {
      void startWatch(port);
    }
  });
}
