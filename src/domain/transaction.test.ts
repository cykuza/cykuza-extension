import { describe, expect, it } from 'vitest';
import { unlockIdentity } from './keyring';
import { TxError } from './errors';
import {
  btcPerKbToSatsPerVbyte,
  buildAndSignTx,
  cyToSats,
  DUST_THRESHOLD,
  estimateFee,
  estimateVBytes,
  normalizeFeeRates,
  planSpend,
  satsToCy,
  type Utxo,
} from './transaction';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function utxo(value: number, vout = 0): Utxo {
  return {
    txid: 'a'.repeat(64),
    vout,
    value,
  };
}

describe('units', () => {
  it('converts CY ↔ sats', () => {
    expect(cyToSats(1)).toBe(100_000_000);
    expect(satsToCy(50_000_000)).toBe(0.5);
  });
});

describe('btcPerKbToSatsPerVbyte', () => {
  it('converts and floors up to integer sats/vB', () => {
    // 0.0001 CY/kB = 10_000 sats/kB = 10 sat/vB
    expect(btcPerKbToSatsPerVbyte(0.0001)).toBe(10);
    // 0.001 CY/kB = 100 sat/vB
    expect(btcPerKbToSatsPerVbyte(0.001)).toBe(100);
    // Matches ceil((rate * 1e8) / 1000)
    const rate = 0.00005;
    expect(btcPerKbToSatsPerVbyte(rate)).toBe(
      Math.max(Math.ceil((rate * 1e8) / 1000), 1)
    );
  });

  it('enforces minimum 1 for zero / negative / NaN', () => {
    expect(btcPerKbToSatsPerVbyte(0)).toBe(1);
    expect(btcPerKbToSatsPerVbyte(-1)).toBe(1);
    expect(btcPerKbToSatsPerVbyte(Number.NaN)).toBe(1);
  });
});

describe('normalizeFeeRates', () => {
  it('converts Electrum estimatefee pair and ensures standard >= slow', () => {
    expect(normalizeFeeRates(0.0001, 0.001)).toEqual({
      slow: 10,
      standard: 100,
      estimated: true,
    });
    // When "standard" estimate is slower than slow, bump standard.
    expect(normalizeFeeRates(0.001, 0.0001)).toEqual({
      slow: 100,
      standard: 100,
      estimated: true,
    });
  });

  it('uses minimum 1 for invalid estimates and marks estimated false', () => {
    expect(normalizeFeeRates(0, -1)).toEqual({
      slow: 1,
      standard: 1,
      estimated: false,
    });
    expect(normalizeFeeRates(-1, -1)).toEqual({
      slow: 1,
      standard: 1,
      estimated: false,
    });
  });

  it('marks estimated false when only one Electrum value is usable', () => {
    expect(normalizeFeeRates(-1, 0.0001)).toEqual({
      slow: 1,
      standard: 10,
      estimated: false,
    });
  });
});

describe('estimateVBytes', () => {
  it('matches P2WPKH heuristic 10 + 68*in + 31*out', () => {
    expect(estimateVBytes(1, 2)).toBe(Math.ceil(10 + 68 + 62));
    expect(estimateVBytes(2, 1)).toBe(Math.ceil(10 + 136 + 31));
    expect(estimateVBytes(3, 2)).toBe(Math.ceil(10 + 204 + 62));
  });
});

describe('planSpend fee fixtures', () => {
  const from = 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59';
  const to = 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59';

  it('selects sequential UTXOs until enough (Electrum order, not largest-first)', () => {
    const utxos = [utxo(1000, 0), utxo(50_000, 1), utxo(100_000, 2)];
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: 40_000,
      feeRate: 1,
      utxos,
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: false,
    });
    // 1000 alone is not enough; needs first two.
    expect(plan.selectedUtxos).toHaveLength(2);
    expect(plan.selectedUtxos[0]!.vout).toBe(0);
    expect(plan.selectedUtxos[1]!.vout).toBe(1);
  });

  it('1-in 2-out fee at 1 sat/vB', () => {
    const vbytes = estimateVBytes(1, 2);
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: 10_000,
      feeRate: 1,
      utxos: [utxo(100_000)],
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: false,
    });
    expect(plan.estimatedFee).toBe(vbytes);
    expect(plan.amountSats).toBe(10_000);
    expect(plan.hasChange).toBe(true);
    expect(plan.fee).toBe(vbytes);
    expect(plan.total).toBe(10_000 + plan.fee);
  });

  it('includeFee=false: fee on top', () => {
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: 20_000,
      feeRate: 2,
      utxos: [utxo(100_000)],
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: false,
    });
    expect(plan.amountSats).toBe(20_000);
    expect(plan.total).toBe(20_000 + plan.fee);
    expect(plan.includeFee).toBe(false);
  });

  it('includeFee=true: fee deducted from amount', () => {
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: 20_000,
      feeRate: 2,
      utxos: [utxo(100_000)],
      networkType: 'mainnet',
      includeFee: true,
      validateAddresses: false,
    });
    expect(plan.amountSats).toBe(20_000 - plan.estimatedFee);
    expect(plan.total).toBe(20_000);
    expect(plan.includeFee).toBe(true);
  });

  it('omits dust change ≤ 546 and absorbs into fee', () => {
    // 1-in 2-out @ 1 sat/vB = 141 vB → fee 141
    // amount 1000, totalIn = 1000 + 141 + 500 = 1641 → change 500 ≤ dust
    const fee2out = estimateVBytes(1, 2); // 141
    const dust = 500;
    const amount = 1000;
    const totalIn = amount + fee2out + dust;
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: amount,
      feeRate: 1,
      utxos: [utxo(totalIn)],
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: false,
    });
    expect(plan.estimatedFee).toBe(fee2out);
    expect(plan.hasChange).toBe(false);
    expect(plan.change).toBe(0);
    expect(plan.fee).toBe(fee2out + dust);
    expect(dust).toBeLessThanOrEqual(DUST_THRESHOLD);
  });

  it('keeps change when > 546', () => {
    const fee2out = estimateVBytes(1, 2);
    const change = 547;
    const amount = 10_000;
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: amount,
      feeRate: 1,
      utxos: [utxo(amount + fee2out + change)],
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: false,
    });
    expect(plan.hasChange).toBe(true);
    expect(plan.change).toBe(change);
    expect(plan.fee).toBe(fee2out);
  });

  it('throws NO_UTXOS', () => {
    expect(() =>
      planSpend({
        toAddress: to,
        fromAddress: from,
        amountSats: 1000,
        feeRate: 1,
        utxos: [],
        networkType: 'mainnet',
        validateAddresses: false,
      })
    ).toThrow(TxError);
    try {
      planSpend({
        toAddress: to,
        fromAddress: from,
        amountSats: 1000,
        feeRate: 1,
        utxos: [],
        networkType: 'mainnet',
        validateAddresses: false,
      });
    } catch (e) {
      expect((e as TxError).code).toBe('NO_UTXOS');
      expect((e as TxError).message).toBe('No spendable UTXOs');
    }
  });

  it('throws INSUFFICIENT', () => {
    expect(() =>
      planSpend({
        toAddress: to,
        fromAddress: from,
        amountSats: 100_000,
        feeRate: 1,
        utxos: [utxo(1000)],
        networkType: 'mainnet',
        includeFee: false,
        validateAddresses: false,
      })
    ).toThrow(/Insufficient balance/);
  });

  it('throws AMOUNT_TOO_SMALL when includeFee and amount ≤ fee', () => {
    expect(() =>
      planSpend({
        toAddress: to,
        fromAddress: from,
        amountSats: 50,
        feeRate: 10,
        utxos: [utxo(100_000)],
        networkType: 'mainnet',
        includeFee: true,
        validateAddresses: false,
      })
    ).toThrow(/too small to cover the fee/);
  });

  it('enforces min feeRate 1', () => {
    const plan = planSpend({
      toAddress: to,
      fromAddress: from,
      amountSats: 10_000,
      feeRate: 0,
      utxos: [utxo(100_000)],
      networkType: 'mainnet',
      validateAddresses: false,
    });
    expect(plan.feeRate).toBe(1);
    expect(plan.estimatedFee).toBe(estimateVBytes(1, 2));
  });
});

describe('estimateFee soft wrapper', () => {
  it('returns zeros for empty utxos', () => {
    expect(
      estimateFee({ amountSats: 1000, feeRate: 1, utxos: [] })
    ).toEqual({ estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 });
  });
});

describe('buildAndSignTx', () => {
  it('signs a P2WPKH tx; fee equals sumIn − sumOut', async () => {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const to = identity.address; // self-send
    const amount = 10_000;
    const utxos = [utxo(100_000)];
    const { hex, fee } = buildAndSignTx({
      toAddress: to,
      fromAddress: identity.address,
      amountSats: amount,
      feeRate: 1,
      utxos,
      networkType: 'mainnet',
      keyPair: identity.keyPair,
      includeFee: false,
    });
    expect(hex.length).toBeGreaterThan(0);
    expect(fee).toBeGreaterThan(0);
    expect(100_000 - amount - fee).toBeGreaterThan(DUST_THRESHOLD);
  });
});
