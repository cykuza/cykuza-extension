import { describe, expect, it } from 'vitest';
import { TxError } from '../domain/errors';
import { unlockIdentity } from '../domain/keyring';
import type { Utxo } from '../domain/transaction';
import { estimateSpend } from './transactions';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function utxo(value: number, vout = 0): Utxo {
  return {
    txid: 'aa'.repeat(32),
    vout,
    value,
  };
}

describe('estimateSpend', () => {
  it('estimates fee added on top when includeFee=false', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const estimate = estimateSpend({
      to: id.address,
      fromAddress: id.address,
      amountSats: 10_000,
      feeRate: 1,
      utxos: [utxo(50_000)],
      networkType: 'mainnet',
      includeFee: false,
    });
    expect(estimate.amountSats).toBe(10_000);
    expect(estimate.fee).toBeGreaterThan(0);
    expect(estimate.total).toBe(10_000 + estimate.fee);
    expect(estimate.feeRate).toBe(1);
  });

  it('deducts fee from amount when includeFee=true', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const estimate = estimateSpend({
      to: id.address,
      fromAddress: id.address,
      amountSats: 10_000,
      feeRate: 1,
      utxos: [utxo(50_000)],
      networkType: 'mainnet',
      includeFee: true,
    });
    expect(estimate.amountSats).toBe(10_000 - estimate.fee);
    expect(estimate.total).toBe(10_000);
  });

  it('throws INSUFFICIENT when UTXOs cannot cover spend', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    expect(() =>
      estimateSpend({
        to: id.address,
        fromAddress: id.address,
        amountSats: 100_000,
        feeRate: 1,
        utxos: [utxo(1_000)],
        networkType: 'mainnet',
        includeFee: false,
      })
    ).toThrow(TxError);
  });

  it('absorbs dust change into fee', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const estimate = estimateSpend({
      to: id.address,
      fromAddress: id.address,
      amountSats: 9_800,
      feeRate: 1,
      utxos: [utxo(10_000)],
      networkType: 'mainnet',
      includeFee: false,
    });
    if (estimate.hasChange) {
      expect(estimate.changeSats).toBeGreaterThan(546);
    } else {
      expect(estimate.changeSats).toBe(0);
      expect(estimate.fee).toBeGreaterThanOrEqual(estimate.feeRate);
    }
  });

  it('skips address validation when to is omitted', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const estimate = estimateSpend({
      fromAddress: id.address,
      amountSats: 5_000,
      feeRate: 2,
      utxos: [utxo(20_000)],
      networkType: 'mainnet',
      includeFee: false,
    });
    expect(estimate.amountSats).toBe(5_000);
    expect(estimate.feeRate).toBe(2);
  });
});
