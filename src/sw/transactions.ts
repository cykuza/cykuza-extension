/**
 * Preview + send orchestration for the service worker.
 *
 * Preview: listunspent + estimatefee → planSpend → one-time confirmation token.
 * Estimate: planSpend against cached UTXOs (no network, no token).
 * Send: verify password (no re-unlock) → consume token → enforce safeguards →
 * buildAndSignTx → broadcast → record daily spend.
 */

import {
  remainingSatsToday,
  wouldExceedLimit,
  type DailySpendState,
} from '../domain/dailySpend';
import { TxError } from '../domain/errors';
import type { ElectrumClient } from '../domain/electrum/client';
import type { UnlockedIdentity } from '../domain/keyring';
import type { NetworkType } from '../domain/network';
import {
  isLargeSend,
  matchesAddressConfirmSuffix,
  type WalletSettings,
} from '../domain/settings';
import {
  buildAndSignTx,
  mapElectrumUtxos,
  normalizeFeeRates,
  planSpend,
  type FeeRates,
  type Utxo,
} from '../domain/transaction';
import type { SendConfirmation, SendEstimate } from '../messaging/protocol';
import {
  clearConfirmations,
  peekConfirmation,
  storeConfirmation,
  takeConfirmation,
} from './confirmations';
import {
  withElectrumBroadcastBatch,
  withElectrumRefreshBatch,
} from './electrumRuntime';

export { clearConfirmations };

export interface PreviewSendResult {
  confirmation: SendConfirmation;
  confirmationToken: string;
  feeRate: number;
  serverUrl: string;
  settings: WalletSettings;
  /** Fresh chain snapshot from preview — SW writes these into sessionRam. */
  balance: { confirmed: number; unconfirmed: number };
  utxos: Utxo[];
  feeRates: FeeRates;
}

export interface SendResult {
  txid: string;
  fee: number;
  total: number;
  serverUrl: string;
  settings: WalletSettings;
}

async function fetchUtxosAndFee(
  client: ElectrumClient,
  scripthash: string
): Promise<{
  balance: { confirmed: number; unconfirmed: number };
  utxos: ReturnType<typeof mapElectrumUtxos>;
  feeRate: number;
  feeRates: FeeRates;
}> {
  const [balance, rawUtxos, slowRaw, standardRaw] = await Promise.all([
    client.getBalance(scripthash),
    client.listUnspent(scripthash),
    client.estimateFee(6),
    client.estimateFee(2),
  ]);
  const feeRates = normalizeFeeRates(slowRaw, standardRaw);
  return {
    balance,
    utxos: mapElectrumUtxos(rawUtxos),
    feeRate: feeRates.standard,
    feeRates,
  };
}

/**
 * Pure spend estimate against a UTXO snapshot. No network, no confirmation token.
 * When `to` is provided, address validation runs; otherwise planning skips it.
 */
export function estimateSpend(params: {
  to?: string;
  fromAddress: string;
  amountSats: number;
  feeRate: number;
  utxos: Utxo[];
  networkType: NetworkType;
  includeFee?: boolean;
}): SendEstimate {
  const to = params.to?.trim() ?? '';
  const validateAddresses = to.length > 0;
  const plan = planSpend({
    toAddress: to || params.fromAddress,
    fromAddress: params.fromAddress,
    amountSats: params.amountSats,
    feeRate: params.feeRate,
    utxos: params.utxos,
    networkType: params.networkType,
    includeFee: params.includeFee ?? false,
    validateAddresses,
  });
  return {
    amountSats: plan.amountSats,
    fee: plan.fee,
    total: plan.total,
    feeRate: plan.feeRate,
    changeSats: plan.change,
    hasChange: plan.hasChange,
  };
}

function confirmedFromUtxos(utxos: Utxo[]): number {
  return utxos.reduce((sum, u) => sum + u.value, 0);
}

export async function previewSend(params: {
  identity: UnlockedIdentity;
  settings: WalletSettings;
  sessionGeneration: number;
  to: string;
  amountSats: number;
  includeFee: boolean;
  feeRate?: number;
  dailySpend: DailySpendState;
  /** Optional override for large-send check (tests / cached balance). */
  confirmedBalanceSats?: number;
}): Promise<PreviewSendResult> {
  const {
    identity,
    settings,
    sessionGeneration,
    to,
    amountSats,
    includeFee,
    feeRate: requestedFeeRate,
    dailySpend,
  } = params;

  const batch = await withElectrumRefreshBatch(
    settings,
    settings.network,
    (client) => fetchUtxosAndFee(client, identity.scripthash)
  );

  const feeRate =
    requestedFeeRate !== undefined && requestedFeeRate >= 1
      ? Math.ceil(requestedFeeRate)
      : batch.value.feeRate;

  const plan = planSpend({
    toAddress: to.trim(),
    fromAddress: identity.address,
    amountSats,
    feeRate,
    utxos: batch.value.utxos,
    networkType: settings.network,
    includeFee,
    validateAddresses: true,
  });

  const confirmedBalance =
    params.confirmedBalanceSats ?? confirmedFromUtxos(batch.value.utxos);
  const spendLimitExceeded = wouldExceedLimit(
    settings.dailySpendLimitSats,
    dailySpend,
    plan.total
  );
  const largeSend = isLargeSend(plan.total, confirmedBalance);
  const dailySpendRemainingSats = remainingSatsToday(
    settings.dailySpendLimitSats,
    dailySpend
  );

  const { token, confirmation } = storeConfirmation({
    plan,
    sessionGeneration,
    network: settings.network,
    address: identity.address,
    spendLimitExceeded,
    largeSend,
    dailySpendRemainingSats,
  });

  return {
    confirmation,
    confirmationToken: token,
    feeRate,
    serverUrl: batch.serverUrl,
    settings: batch.settings,
    balance: batch.value.balance,
    utxos: batch.value.utxos,
    feeRates: batch.value.feeRates,
  };
}

export async function sendTransaction(params: {
  identity: UnlockedIdentity;
  settings: WalletSettings;
  sessionGeneration: number;
  network: NetworkType;
  confirmationToken: string;
  toConfirmSuffix: string;
  allowSpendLimitOnce?: boolean;
  acknowledgeLargeSend?: boolean;
}): Promise<SendResult> {
  const {
    identity,
    settings,
    sessionGeneration,
    network,
    confirmationToken,
    toConfirmSuffix,
    allowSpendLimitOnce,
    acknowledgeLargeSend,
  } = params;

  // Validate address confirm suffix before consuming the one-shot token (P1.4).
  const previewed = peekConfirmation(confirmationToken);
  if (!previewed) {
    throw new TxError('CONFIRMATION_INVALID');
  }
  if (
    !matchesAddressConfirmSuffix(previewed.plan.toAddress, toConfirmSuffix)
  ) {
    throw new TxError('ADDRESS_CONFIRM_MISMATCH');
  }

  const pending = takeConfirmation({
    token: confirmationToken,
    sessionGeneration,
    network,
    address: identity.address,
  });

  if (pending.spendLimitExceeded && allowSpendLimitOnce !== true) {
    throw new TxError('SPEND_LIMIT_OVERRIDE_REQUIRED');
  }
  if (pending.largeSend && acknowledgeLargeSend !== true) {
    throw new TxError('LARGE_SEND_ACK_REQUIRED');
  }

  // Sign with the immutable plan from preview — no re-selection.
  const { hex, fee } = buildAndSignTx({
    plan: pending.plan,
    keyPair: identity.keyPair,
  });

  const batch = await withElectrumBroadcastBatch(settings, network, hex);

  return {
    txid: batch.value,
    fee,
    total: pending.plan.total,
    serverUrl: batch.serverUrl,
    settings: batch.settings,
  };
}
