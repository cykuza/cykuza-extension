/**
 * Shared Electrum chain snapshot used by batch refresh and UI-scoped watch.
 */

import type { ElectrumClient } from '../../domain/electrum/client';
import {
  mapElectrumUtxos,
  normalizeFeeRates,
  type FeeRates,
  type Utxo,
} from '../../domain/transaction';

export async function refreshFromClient(
  client: ElectrumClient,
  scripthash: string
): Promise<{
  balance: { confirmed: number; unconfirmed: number };
  history: Array<{ tx_hash: string; height: number }>;
  feeRates: FeeRates;
  utxos: Utxo[];
}> {
  const [balance, history, slowRaw, standardRaw, rawUtxos] = await Promise.all([
    client.getBalance(scripthash),
    client.getHistory(scripthash),
    client.estimateFee(6),
    client.estimateFee(2),
    client.listUnspent(scripthash),
  ]);
  const feeRates = normalizeFeeRates(slowRaw, standardRaw);
  // Newest first for UI.
  const sorted = [...history].sort((a, b) => b.height - a.height);
  return {
    balance,
    history: sorted,
    feeRates,
    utxos: mapElectrumUtxos(rawUtxos),
  };
}
