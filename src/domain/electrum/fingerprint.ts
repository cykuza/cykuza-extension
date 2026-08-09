/**
 * Canonical chain fingerprint for Electrum dual-server cross-check.
 * Compares confirmed/unconfirmed balance + sorted UTXO set only.
 * Fee rates and history are excluded (race-prone, not spend-critical).
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { Utxo } from '../transaction';

export type BalanceSnapshot = {
  confirmed: number;
  unconfirmed: number;
};

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

/** Stable canonical payload: balance + UTXOs sorted by txid then vout. */
export function chainFingerprintCanonical(
  balance: BalanceSnapshot,
  utxos: readonly Utxo[]
): string {
  const sorted = [...utxos].sort((a, b) => {
    if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
    return a.vout - b.vout;
  });
  const utxoPart = sorted
    .map((u) => `${u.txid}:${u.vout}:${u.value}`)
    .join('|');
  return `c=${balance.confirmed};u=${balance.unconfirmed};utxo=${utxoPart}`;
}

/** SHA256 hex of the canonical chain fingerprint. */
export function chainFingerprint(
  balance: BalanceSnapshot,
  utxos: readonly Utxo[]
): string {
  const canonical = chainFingerprintCanonical(balance, utxos);
  const digest = bitcoin.crypto.sha256(
    new TextEncoder().encode(canonical)
  );
  return bytesToHex(Uint8Array.from(digest));
}
