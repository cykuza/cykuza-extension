import { parseWssUrl } from '../../domain/electrum/url';
import {
  rematerializeForNetwork,
  wipeIdentity,
} from '../../domain/keyring';
import type { NetworkType } from '../../domain/network';
import { ElectrumTrustBlockedError } from '../../domain/electrumTrust';
import { safeErrorMessage } from '../../domain/redact';
import {
  customElectrumUrls,
  defaultMainnetElectrumConfig,
  ElectrumUnconfiguredError,
  isDefaultElectrumUrl,
  normalizeSettings,
  type ElectrumEndpoint,
  type WalletSettings,
} from '../../domain/settings';
import type { WalletResponse } from '../../messaging/protocol';
import {
  assertHostPermission,
  hasHostPermission,
  HostPermissionRequiredError,
  releaseHostPermissionIfUnused,
} from '../../platform/permissions';
import { readSettings, writeSettings } from '../../platform/storage';
import {
  getWatchClient,
  refreshViaWatch,
  restartWatchIfPortConnected,
  settleServerStatusAfterBatch,
} from '../electrumWatch';
import { probeElectrumUrl, withElectrumRefreshBatch } from '../electrumRuntime';
import { requireElectrumTrustForChainOps } from '../electrumTrustGate';
import { clearConfirmations } from '../transactions';
import { refreshFromClient } from './chainSnapshot';
import { armAutoLock, bumpSessionGeneration, clearChainCache, sessionRam } from './state';
import { buildStatus } from './status';

export async function handleRefresh(): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: 'Wallet is locked' };
  }

  const settings = await readSettings();
  sessionRam.lastServerStatus = getWatchClient()
    ? 'connected'
    : 'connecting';
  sessionRam.lastServerError = undefined;

  try {
    await requireElectrumTrustForChainOps(settings);

    // Prefer the UI-scoped watch socket when live — no reconnect churn.
    if (getWatchClient()) {
      const viaWatch = await refreshViaWatch();
      if (viaWatch.ok) {
        return { ok: true, status: await buildStatus(viaWatch.settings) };
      }
      if (viaWatch.reason === 'error') {
        return {
          ok: false,
          error: viaWatch.error,
          status: await buildStatus(),
        };
      }
      // inactive / stopped → batch fallback
    }

    const scripthash = sessionRam.identity.scripthash;
    const batch = await withElectrumRefreshBatch(
      settings,
      settings.network,
      (client) => refreshFromClient(client, scripthash)
    );

    sessionRam.cachedBalance = batch.value.balance;
    sessionRam.cachedHistory = batch.value.history;
    sessionRam.cachedFeeRates = batch.value.feeRates;
    sessionRam.cachedUtxos = batch.value.utxos;
    sessionRam.lastServerUrl = batch.serverUrl;
    settleServerStatusAfterBatch();

    // Successful user activity — reset idle auto-lock timer.
    await armAutoLock(batch.settings);

    return { ok: true, status: await buildStatus(batch.settings) };
  } catch (err) {
    if (err instanceof ElectrumUnconfiguredError) {
      sessionRam.lastServerUrl = null;
      sessionRam.lastServerStatus = 'unconfigured';
      sessionRam.lastServerError = err.message;
      return {
        ok: false,
        error: err.message,
        status: await buildStatus(),
      };
    }
    if (err instanceof ElectrumTrustBlockedError) {
      sessionRam.lastServerStatus = 'error';
      sessionRam.lastServerError = err.message;
      return {
        ok: false,
        error: err.message,
        status: await buildStatus(),
      };
    }
    const message = safeErrorMessage(err);
    sessionRam.lastServerStatus = 'error';
    sessionRam.lastServerError = message;
    return {
      ok: false,
      error: message,
      status: await buildStatus(),
    };
  }
}

export async function handleSetNetwork(
  network: NetworkType
): Promise<WalletResponse> {
  const settings = await readSettings();
  if (settings.network === network) {
    return { ok: true, status: await buildStatus(settings) };
  }

  const next: WalletSettings = { ...settings, network };
  await writeSettings(next);

  // Invalidate pending confirmations — network/address binding changes.
  clearConfirmations();
  clearChainCache();

  // Rematerialize for the new network from private key bytes (no BIP39 passphrase needed).
  if (sessionRam.identity) {
    const previous = sessionRam.identity;
    sessionRam.identity = null;
    bumpSessionGeneration();
    try {
      const unlocked = rematerializeForNetwork(previous, network);
      wipeIdentity(previous);
      sessionRam.identity = unlocked;
      await armAutoLock(next);
    } catch (err) {
      wipeIdentity(previous);
      return {
        ok: false,
        error: safeErrorMessage(err),
        status: await buildStatus(next),
      };
    }
  }

  void restartWatchIfPortConnected();

  // Surface unconfigured testnet immediately.
  const status = await buildStatus(next);
  return { ok: true, status };
}

function normalizeEndpointInput(
  raw: { kind: 'default' | 'custom'; url: string },
  network: NetworkType
): ElectrumEndpoint {
  const url = parseWssUrl(raw.url);
  if (network === 'mainnet' && isDefaultElectrumUrl(url)) {
    return { kind: 'default', url };
  }
  if (raw.kind === 'default') {
    if (network !== 'mainnet' || !isDefaultElectrumUrl(url)) {
      throw new Error('Unknown default Electrum endpoint');
    }
    return { kind: 'default', url };
  }
  return { kind: 'custom', url };
}

export async function handleSetElectrumConfig(
  network: NetworkType,
  rawEndpoints: Array<{ kind: 'default' | 'custom'; url: string }>
): Promise<WalletResponse> {
  const settings = await readSettings();
  const previous = settings.electrum[network];
  const previousUrls = previous.endpoints.map((e) => e.url);

  const seen = new Set<string>();
  const endpoints: ElectrumEndpoint[] = [];
  for (const raw of rawEndpoints) {
    const ep = normalizeEndpointInput(raw, network);
    if (seen.has(ep.url)) continue;
    seen.add(ep.url);
    endpoints.push(ep);
  }

  // Mainnet empty → restore build-time defaults when present; empty build = custom-only.
  const finalEndpoints =
    endpoints.length === 0 && network === 'mainnet'
      ? defaultMainnetElectrumConfig().endpoints
      : endpoints;

  // Assert existing grants only — never call chrome.permissions.request in SW.
  // Custom hosts must already be allowed via the electrum-grant tab.
  for (const ep of finalEndpoints) {
    if (ep.kind !== 'custom') continue;
    const granted = await hasHostPermission(ep.url);
    if (!granted) {
      return {
        ok: false,
        error:
          'Allow this Electrum host from the Cykuza grant tab first. Server was not saved.',
        status: await buildStatus(settings),
      };
    }
  }

  const activeUrl =
    previous.activeUrl && finalEndpoints.some((e) => e.url === previous.activeUrl)
      ? previous.activeUrl
      : null;

  const next: WalletSettings = normalizeSettings({
    ...settings,
    electrum: {
      ...settings.electrum,
      [network]: { endpoints: finalEndpoints, activeUrl },
    },
  });
  await writeSettings(next);

  // Release permissions for removed custom origins that are no longer needed.
  const stillNeeded = customElectrumUrls(next);
  for (const url of previousUrls) {
    if (!finalEndpoints.some((e) => e.url === url)) {
      await releaseHostPermissionIfUnused(url, stillNeeded);
    }
  }

  if (settings.network === network) {
    // Invalidate chain cache when active network endpoints change.
    clearChainCache();
    void restartWatchIfPortConnected();
  }

  return { ok: true, status: await buildStatus(next) };
}

export async function handleTestElectrum(
  rawUrl: string
): Promise<WalletResponse> {
  let url: string;
  try {
    url = parseWssUrl(rawUrl);
  } catch (err) {
    return {
      ok: false,
      error: safeErrorMessage(err),
    };
  }

  const settings = await readSettings();

  try {
    // Popup must have requested the grant in the same click. SW never calls request().
    await assertHostPermission(url);
    const probe = await probeElectrumUrl(url);
    return {
      ok: true,
      status: await buildStatus(settings),
      probe: {
        version: probe.version,
      },
    };
  } catch (err) {
    const message =
      err instanceof HostPermissionRequiredError
        ? err.message
        : safeErrorMessage(err);
    return {
      ok: false,
      error: message,
      status: await buildStatus(settings),
    };
  }
}
