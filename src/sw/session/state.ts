/**
 * Service-worker session RAM and queue.
 *
 * Electrum lifecycle:
 *   - Batch: connect-on-demand for one-shot ops, then disconnect.
 *   - Watch: UI-scoped socket while a popup Port is connected (electrumWatch).
 * Session teardown lives in lifecycle.ts (owns stopWatch ordering).
 */

import {
  wipeIdentity,
  type UnlockedIdentity,
} from '../../domain/keyring';
import type { WalletSettings } from '../../domain/settings';
import type { FeeRates, Utxo } from '../../domain/transaction';
import { scheduleAutoLockAlarm } from '../../platform/alarms';
import { readSettings } from '../../platform/storage';
import type { ElectrumConnectionStatus } from '../electrumRuntime';
import { clearConfirmations } from '../transactions';

/** Shared SW RAM — handlers mutate fields; do not duplicate across modules. */
export const sessionRam = {
  identity: null as UnlockedIdentity | null,
  /**
   * Bumped on every lock / unlock / destroy / network re-derive so pending
   * confirmation tokens cannot outlive the session that created them.
   */
  sessionGeneration: 0,
  /** Last known Electrum snapshot for status. */
  lastServerUrl: null as string | null,
  lastServerStatus: 'idle' as ElectrumConnectionStatus,
  lastServerError: undefined as string | undefined,
  /**
   * True while UI-scoped Electrum watch holds an open subscribed socket.
   * Owned by electrumWatch; copied into WalletStatus.watchActive.
   */
  watchActive: false,
  cachedBalance: undefined as
    | { confirmed: number; unconfirmed: number }
    | undefined,
  cachedHistory: undefined as
    | Array<{ tx_hash: string; height: number }>
    | undefined,
  cachedFeeRates: undefined as FeeRates | undefined,
  /** UTXO snapshot for pure estimateSend — never exposed to UI. */
  cachedUtxos: undefined as Utxo[] | undefined,
};

/** Serialize mutations so concurrent unlock/create cannot race. */
let queue: Promise<unknown> = Promise.resolve();

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function clearChainCache(): void {
  sessionRam.lastServerUrl = null;
  sessionRam.lastServerStatus = 'idle';
  sessionRam.lastServerError = undefined;
  sessionRam.cachedBalance = undefined;
  sessionRam.cachedHistory = undefined;
  sessionRam.cachedFeeRates = undefined;
  sessionRam.cachedUtxos = undefined;
}

export function bumpSessionGeneration(): void {
  sessionRam.sessionGeneration += 1;
  clearConfirmations();
}

/** Wipe identity + chain cache. Caller must stop Electrum watch first. */
export function wipeSessionRam(): void {
  wipeIdentity(sessionRam.identity);
  sessionRam.identity = null;
  bumpSessionGeneration();
  clearChainCache();
  sessionRam.watchActive = false;
}

export async function armAutoLock(settings?: WalletSettings): Promise<void> {
  const s = settings ?? (await readSettings());
  scheduleAutoLockAlarm(s.autoLockMinutes);
}
