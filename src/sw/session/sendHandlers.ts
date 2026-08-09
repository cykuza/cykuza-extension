import { recordSpend } from '../../domain/dailySpend';
import { ElectrumTrustBlockedError } from '../../domain/electrumTrust';
import { TxError } from '../../domain/errors';
import { safeErrorMessage } from '../../domain/redact';
import { ElectrumUnconfiguredError } from '../../domain/settings';
import type { WalletResponse } from '../../messaging/protocol';
import {
  readDailySpend,
  readSettings,
  writeDailySpend,
} from '../../platform/storage';
import { withElectrumRefreshBatch } from '../electrumRuntime';
import {
  getWatchClient,
  refreshViaWatch,
  settleServerStatusAfterBatch,
} from '../electrumWatch';
import { requireElectrumTrustForChainOps } from '../electrumTrustGate';
import {
  estimateSpend,
  previewSend,
  sendTransaction,
} from '../transactions';
import { refreshFromClient } from './chainSnapshot';
import { armAutoLock, clearChainCache, sessionRam } from './state';
import { buildStatus } from './status';
import { verifyVaultPassword } from './vaultHandlers';

export async function handlePreviewSend(
  to: string,
  amountSats: number,
  includeFee: boolean,
  feeRate?: number
): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: new TxError('LOCKED').message };
  }

  const settings = await readSettings();
  const dailySpend = await readDailySpend();
  sessionRam.lastServerStatus = 'connecting';
  sessionRam.lastServerError = undefined;

  try {
    await requireElectrumTrustForChainOps(settings);
    const result = await previewSend({
      identity: sessionRam.identity,
      settings,
      sessionGeneration: sessionRam.sessionGeneration,
      to,
      amountSats,
      includeFee,
      feeRate,
      dailySpend,
      confirmedBalanceSats: sessionRam.cachedBalance?.confirmed,
    });

    // Keep estimate coherent with the UTXO/fee snapshot used for preview (P2.6).
    sessionRam.cachedBalance = result.balance;
    sessionRam.cachedUtxos = result.utxos;
    sessionRam.cachedFeeRates = result.feeRates;
    sessionRam.lastServerUrl = result.serverUrl;
    settleServerStatusAfterBatch();
    await armAutoLock(result.settings);

    return {
      ok: true,
      status: await buildStatus(result.settings),
      confirmation: result.confirmation,
      confirmationToken: result.confirmationToken,
    };
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
    if (!(err instanceof TxError)) {
      sessionRam.lastServerStatus = 'error';
      sessionRam.lastServerError = message;
    }
    return {
      ok: false,
      error: message,
      status: await buildStatus(),
    };
  }
}

export async function handleSend(
  confirmationToken: string,
  password: string,
  toConfirmSuffix: string,
  allowSpendLimitOnce?: boolean,
  acknowledgeLargeSend?: boolean
): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: new TxError('LOCKED').message };
  }

  // Password re-auth first — wrong password must not burn the confirmation token.
  const verified = await verifyVaultPassword(password);
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      remainingAttempts: verified.remainingAttempts,
      lockoutUntil: verified.lockoutUntil,
      status: await buildStatus(),
    };
  }

  const settings = await readSettings();
  sessionRam.lastServerStatus = 'connecting';
  sessionRam.lastServerError = undefined;

  try {
    await requireElectrumTrustForChainOps(settings);
    // Consume token only after successful password verify.
    const result = await sendTransaction({
      identity: sessionRam.identity,
      settings,
      sessionGeneration: sessionRam.sessionGeneration,
      network: settings.network,
      confirmationToken,
      toConfirmSuffix,
      allowSpendLimitOnce,
      acknowledgeLargeSend,
    });

    // Record debit against optional daily limit (local only; not telemetry).
    // Best-effort: broadcast already succeeded — accounting failure must not
    // invert send success (UI would show failure after money left).
    try {
      const dailySpend = await readDailySpend();
      await writeDailySpend(recordSpend(dailySpend, result.total));
    } catch {
      // Ignore storage errors after successful broadcast.
    }

    // Invalidate stale balance/history after broadcast.
    clearChainCache();
    sessionRam.lastServerUrl = result.serverUrl;
    settleServerStatusAfterBatch();
    await armAutoLock(result.settings);

    // Best-effort refresh so UI sees updated balance.
    try {
      if (getWatchClient()) {
        const viaWatch = await refreshViaWatch();
        if (viaWatch.ok) {
          return {
            ok: true,
            status: await buildStatus(viaWatch.settings),
            txid: result.txid,
          };
        }
      }
      const scripthash = sessionRam.identity.scripthash;
      const batch = await withElectrumRefreshBatch(
        result.settings,
        result.settings.network,
        (client) => refreshFromClient(client, scripthash)
      );
      sessionRam.cachedBalance = batch.value.balance;
      sessionRam.cachedHistory = batch.value.history;
      sessionRam.cachedFeeRates = batch.value.feeRates;
      sessionRam.cachedUtxos = batch.value.utxos;
      sessionRam.lastServerUrl = batch.serverUrl;
      settleServerStatusAfterBatch();
      return {
        ok: true,
        status: await buildStatus(batch.settings),
        txid: result.txid,
      };
    } catch {
      return {
        ok: true,
        status: await buildStatus(result.settings),
        txid: result.txid,
      };
    }
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
    if (!(err instanceof TxError)) {
      sessionRam.lastServerStatus = 'error';
      sessionRam.lastServerError = message;
    }
    return {
      ok: false,
      error: message,
      status: await buildStatus(),
    };
  }
}

export async function handleEstimateSend(
  amountSats: number,
  feeRate: number,
  includeFee: boolean,
  to?: string
): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: new TxError('LOCKED').message };
  }
  if (sessionRam.cachedUtxos === undefined) {
    return {
      ok: false,
      error: 'Refresh required before estimating. Pull the latest UTXOs first.',
      status: await buildStatus(),
    };
  }

  const settings = await readSettings();
  try {
    const estimate = estimateSpend({
      to,
      fromAddress: sessionRam.identity.address,
      amountSats,
      feeRate,
      utxos: sessionRam.cachedUtxos,
      networkType: settings.network,
      includeFee,
    });
    return {
      ok: true,
      status: await buildStatus(settings),
      estimate,
    };
  } catch (err) {
    return {
      ok: false,
      error: safeErrorMessage(err),
      status: await buildStatus(settings),
    };
  }
}
