/**
 * On-demand Electrum batch lifecycle for the service worker.
 *
 * Contract (batch mode):
 *   1. Resolve ordered candidates (sticky activeUrl first)
 *   2. Filter candidates by existing host permission (never request)
 *   3. connectWithFailover + server.version probe
 *   4. Run the caller's batch against the live client
 *   5. ALWAYS disconnect in finally — no idle long-lived MV3 socket
 *
 * UI-scoped watch (scripthash.subscribe while a popup Port is open) lives in
 * electrumWatch.ts and reuses a held client outside this helper.
 *
 * Verified paths dual-check balance/UTXO fingerprints (or broadcast txids)
 * when verifyWithSecondServer is on and ≥2 permitted endpoints exist.
 */

import {
  connectWithFailover,
  ElectrumClient,
} from '../domain/electrum/client';
import { chainFingerprint } from '../domain/electrum/fingerprint';
import { ElectrumError } from '../domain/errors';
import type { NetworkType } from '../domain/network';
import {
  ElectrumUnconfiguredError,
  getConnectCandidates,
  setActiveUrl,
  type WalletSettings,
} from '../domain/settings';
import type { Utxo } from '../domain/transaction';
import {
  assertHostPermission,
  filterPermittedUrls,
} from '../platform/permissions';
import { writeSettings } from '../platform/storage';

export type ElectrumConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'unconfigured';

export interface ElectrumBatchResult<T> {
  value: T;
  serverUrl: string;
  version: [string, string];
  settings: WalletSettings;
}

/** Minimum shape required for dual-server fingerprint compare. */
export type ChainFingerprintSource = {
  balance: { confirmed: number; unconfirmed: number };
  utxos: Utxo[];
};

async function persistActiveUrl(
  settings: WalletSettings,
  network: NetworkType,
  serverUrl: string
): Promise<WalletSettings> {
  const nextSettings = setActiveUrl(settings, network, serverUrl);
  if (nextSettings !== settings) {
    await writeSettings(nextSettings);
    return nextSettings;
  }
  return settings;
}

function resolveCandidates(
  settings: WalletSettings,
  network: NetworkType
): string[] {
  try {
    return getConnectCandidates(settings, network);
  } catch (err) {
    if (err instanceof ElectrumUnconfiguredError) throw err;
    throw err;
  }
}

/**
 * Connect on demand, run `fn`, disconnect. Persists sticky activeUrl on success.
 * Throws ElectrumUnconfiguredError when the network has no endpoints.
 * Throws when no candidates have an existing host grant (never prompts).
 */
export async function withElectrumBatch<T>(
  settings: WalletSettings,
  network: NetworkType,
  fn: (client: ElectrumClient) => Promise<T>
): Promise<ElectrumBatchResult<T>> {
  const urls = resolveCandidates(settings, network);
  const permitted = await filterPermittedUrls(urls);
  if (permitted.length === 0) {
    throw new ElectrumError('PERMISSION_REQUIRED');
  }

  const { client, serverUrl, version } = await connectWithFailover(permitted);
  try {
    const value = await fn(client);
    const nextSettings = await persistActiveUrl(settings, network, serverUrl);
    return { value, serverUrl, version, settings: nextSettings };
  } finally {
    client.disconnect();
  }
}

/**
 * Ordered primary/secondary pairs from permitted URLs.
 * Consecutive: (0,1), (1,2), … then wrap secondary for last primary if n>=2.
 */
export function dualServerPairs(permitted: string[]): Array<[string, string]> {
  if (permitted.length < 2) return [];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < permitted.length - 1; i++) {
    pairs.push([permitted[i]!, permitted[i + 1]!]);
  }
  // Allow starting at last URL with first as secondary when ≥3 (rotation).
  if (permitted.length >= 3) {
    pairs.push([permitted[permitted.length - 1]!, permitted[0]!]);
  }
  return pairs;
}

type DualOutcome<T> =
  | { kind: 'ok'; value: T; serverUrl: string; version: [string, string] }
  | { kind: 'primary_connect_failed' }
  | { kind: 'verify_failed' }
  | { kind: 'disagree' }
  | { kind: 'primary_rpc_failed'; error: Error };

async function tryDualPair<T>(
  primaryUrl: string,
  secondaryUrl: string,
  run: (
    primary: ElectrumClient,
    secondary: ElectrumClient
  ) => Promise<
    | { kind: 'ok'; value: T }
    | { kind: 'disagree' }
    | { kind: 'verify_failed' }
    | { kind: 'primary_rpc_failed'; error: Error }
  >
): Promise<DualOutcome<T>> {
  const primary = new ElectrumClient();
  const secondary = new ElectrumClient();
  try {
    const connectResults = await Promise.allSettled([
      primary.connectAndProbe(primaryUrl),
      secondary.connectAndProbe(secondaryUrl),
    ]);

    if (connectResults[0].status === 'rejected') {
      return { kind: 'primary_connect_failed' };
    }
    if (connectResults[1].status === 'rejected') {
      return { kind: 'verify_failed' };
    }

    const primaryVersion = connectResults[0].value;
    const result = await run(primary, secondary);
    if (result.kind === 'ok') {
      return {
        kind: 'ok',
        value: result.value,
        serverUrl: primaryUrl,
        version: primaryVersion,
      };
    }
    return result;
  } finally {
    primary.disconnect();
    secondary.disconnect();
  }
}

/**
 * Verified batch with optional dual-server balance/UTXO fingerprint check.
 * When verify is off or fewer than two permitted URLs: same as withElectrumBatch.
 * When verify is on and ≥2 permitted: try ordered pairs; primary connect fail
 * rotates to the next pair (P1.2); secondary fail / mismatch fail closed.
 */
export async function withElectrumRefreshBatch<T extends ChainFingerprintSource>(
  settings: WalletSettings,
  network: NetworkType,
  fn: (client: ElectrumClient) => Promise<T>
): Promise<ElectrumBatchResult<T>> {
  const urls = resolveCandidates(settings, network);
  const permitted = await filterPermittedUrls(urls);
  if (permitted.length === 0) {
    throw new ElectrumError('PERMISSION_REQUIRED');
  }

  const useDual =
    settings.verifyWithSecondServer === true && permitted.length >= 2;

  if (!useDual) {
    return withElectrumBatch(settings, network, fn);
  }

  let lastPrimaryConnectError: Error | undefined;
  for (const [primaryUrl, secondaryUrl] of dualServerPairs(permitted)) {
    const outcome = await tryDualPair<T>(primaryUrl, secondaryUrl, async (primary, secondary) => {
      let primaryValue: T;
      let secondaryValue: T;
      try {
        primaryValue = await fn(primary);
      } catch (err) {
        return {
          kind: 'primary_rpc_failed',
          error: err instanceof Error ? err : new ElectrumError('RPC_ERROR'),
        };
      }
      try {
        secondaryValue = await fn(secondary);
      } catch {
        return { kind: 'verify_failed' };
      }

      const fpA = chainFingerprint(primaryValue.balance, primaryValue.utxos);
      const fpB = chainFingerprint(secondaryValue.balance, secondaryValue.utxos);
      if (fpA !== fpB) {
        return { kind: 'disagree' };
      }
      return {
        kind: 'ok',
        value: primaryValue,
      };
    });

    if (outcome.kind === 'ok') {
      const nextSettings = await persistActiveUrl(
        settings,
        network,
        outcome.serverUrl
      );
      return {
        value: outcome.value,
        serverUrl: outcome.serverUrl,
        version: outcome.version,
        settings: nextSettings,
      };
    }
    if (outcome.kind === 'primary_connect_failed') {
      lastPrimaryConnectError = new ElectrumError('CONNECT_FAILED');
      continue;
    }
    if (outcome.kind === 'verify_failed') {
      throw new ElectrumError('VERIFY_FAILED');
    }
    if (outcome.kind === 'disagree') {
      throw new ElectrumError('SERVERS_DISAGREE');
    }
    if (outcome.kind === 'primary_rpc_failed') {
      throw outcome.error;
    }
  }

  throw (
    lastPrimaryConnectError ??
    new ElectrumError('CONNECT_FAILED')
  );
}

/**
 * Broadcast with optional dual-server txid check (P1.1).
 * When dual verify is on and ≥2 permitted: broadcast to a connected pair and
 * require matching txids. Primary connect fail rotates pairs (same as refresh).
 */
export async function withElectrumBroadcastBatch(
  settings: WalletSettings,
  network: NetworkType,
  hex: string
): Promise<ElectrumBatchResult<string>> {
  const urls = resolveCandidates(settings, network);
  const permitted = await filterPermittedUrls(urls);
  if (permitted.length === 0) {
    throw new ElectrumError('PERMISSION_REQUIRED');
  }

  const useDual =
    settings.verifyWithSecondServer === true && permitted.length >= 2;

  if (!useDual) {
    return withElectrumBatch(settings, network, (client) =>
      client.broadcast(hex)
    );
  }

  let lastPrimaryConnectError: Error | undefined;
  for (const [primaryUrl, secondaryUrl] of dualServerPairs(permitted)) {
    const outcome = await tryDualPair<string>(primaryUrl, secondaryUrl, async (primary, secondary) => {
      let txidA: string;
      let txidB: string;
      try {
        txidA = await primary.broadcast(hex);
      } catch (err) {
        return {
          kind: 'primary_rpc_failed',
          error: err instanceof Error ? err : new ElectrumError('RPC_ERROR'),
        };
      }
      try {
        txidB = await secondary.broadcast(hex);
      } catch {
        return { kind: 'verify_failed' };
      }
      if (txidA !== txidB) {
        return { kind: 'disagree' };
      }
      return {
        kind: 'ok',
        value: txidA,
      };
    });

    if (outcome.kind === 'ok') {
      const nextSettings = await persistActiveUrl(
        settings,
        network,
        outcome.serverUrl
      );
      return {
        value: outcome.value,
        serverUrl: outcome.serverUrl,
        version: outcome.version,
        settings: nextSettings,
      };
    }
    if (outcome.kind === 'primary_connect_failed') {
      lastPrimaryConnectError = new ElectrumError('CONNECT_FAILED');
      continue;
    }
    if (outcome.kind === 'verify_failed') {
      throw new ElectrumError('VERIFY_FAILED');
    }
    if (outcome.kind === 'disagree') {
      throw new ElectrumError('SERVERS_DISAGREE');
    }
    if (outcome.kind === 'primary_rpc_failed') {
      throw outcome.error;
    }
  }

  throw (
    lastPrimaryConnectError ??
    new ElectrumError('CONNECT_FAILED')
  );
}

/**
 * Probe a single URL (for Settings "Test connection").
 * Asserts an existing host grant inside (defense in depth; callers may also assert).
 * SW never calls chrome.permissions.request. Always disconnects before returning.
 */
export async function probeElectrumUrl(
  url: string
): Promise<{ serverUrl: string; version: [string, string] }> {
  await assertHostPermission(url);
  const { client, serverUrl, version } = await connectWithFailover([url]);
  client.disconnect();
  return { serverUrl, version };
}
