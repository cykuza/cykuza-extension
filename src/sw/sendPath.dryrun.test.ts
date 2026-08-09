import { describe, expect, it, vi } from 'vitest';
import { unlockIdentity } from '../domain/keyring';
import {
  buildAndSignTx,
  mapElectrumUtxos,
  planSpend,
} from '../domain/transaction';
import {
  clearConfirmations,
  storeConfirmation,
  takeConfirmation,
} from '../sw/confirmations';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Dry-run of the full send path without a live Electrum socket:
 * listunspent (mock) → plan → confirmation token → password gate (simulated)
 * → consume token → PSBT → broadcast (mock).
 */
describe('send path dry-run', () => {
  it('preview → confirm token → sign → broadcast mock', async () => {
    clearConfirmations();
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');

    const electrumUtxos = [
      {
        tx_hash: '11'.repeat(32),
        tx_pos: 0,
        height: 100,
        value: 200_000,
      },
    ];
    const feeBtcPerKb = 0.0001; // → 10 sat/vB
    const broadcast = vi.fn(async (hex: string) => {
      expect(hex.length).toBeGreaterThan(0);
      return 'dd'.repeat(32);
    });

    // --- preview ---
    const utxos = mapElectrumUtxos(electrumUtxos);
    const feeRate = Math.max(Math.ceil((feeBtcPerKb * 1e8) / 1000), 1);
    expect(feeRate).toBe(10);

    const plan = planSpend({
      toAddress: identity.address,
      fromAddress: identity.address,
      amountSats: 50_000,
      feeRate,
      utxos,
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: true,
    });

    const { token, confirmation } = storeConfirmation({
      plan,
      sessionGeneration: 7,
      network: 'mainnet',
      address: identity.address,
      spendLimitExceeded: false,
      largeSend: false,
      dailySpendRemainingSats: null,
    });

    expect(confirmation.to).toBe(identity.address);
    expect(confirmation.amountSats).toBe(50_000);
    expect(confirmation.fee).toBeGreaterThan(0);
    expect(confirmation.total).toBe(confirmation.amountSats + confirmation.fee);
    expect(confirmation.includeFee).toBe(false);
    expect(confirmation.spendLimitExceeded).toBe(false);
    expect(confirmation.largeSend).toBe(false);
    // No secrets in DTO
    expect(JSON.stringify(confirmation)).not.toMatch(/private|mnemonic|hex/i);

    // --- simulated password success (no lockout increment) ---
    const passwordOk = true;
    expect(passwordOk).toBe(true);

    // --- send: consume token then sign ---
    const pending = takeConfirmation({
      token,
      sessionGeneration: 7,
      network: 'mainnet',
      address: identity.address,
    });

    const { hex, fee } = buildAndSignTx({
      plan: pending.plan,
      keyPair: identity.keyPair,
    });
    expect(fee).toBe(confirmation.fee);
    expect(hex.startsWith('02') || hex.startsWith('01000000')).toBe(true);

    const txid = await broadcast(hex);
    expect(broadcast).toHaveBeenCalledOnce();
    expect(txid).toBe('dd'.repeat(32));

    // Token is one-shot
    expect(() =>
      takeConfirmation({
        token,
        sessionGeneration: 7,
        network: 'mainnet',
        address: identity.address,
      })
    ).toThrow();
  });

  it('includeFee dry-run: recipient amount is reduced', async () => {
    clearConfirmations();
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const plan = planSpend({
      toAddress: identity.address,
      fromAddress: identity.address,
      amountSats: 50_000,
      feeRate: 5,
      utxos: [{ txid: '22'.repeat(32), vout: 0, value: 200_000 }],
      networkType: 'mainnet',
      includeFee: true,
      validateAddresses: true,
    });
    expect(plan.amountSats).toBe(50_000 - plan.estimatedFee);
    expect(plan.total).toBe(50_000);

    const { hex, fee } = buildAndSignTx({
      plan,
      keyPair: identity.keyPair,
    });
    expect(hex.length).toBeGreaterThan(0);
    expect(fee).toBe(plan.fee);
  });

  it('rejects network-mismatched recipient before planning', async () => {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const testId = await unlockIdentity(FIXTURE_MNEMONIC, 'testnet');
    expect(() =>
      planSpend({
        toAddress: testId.address,
        fromAddress: identity.address,
        amountSats: 10_000,
        feeRate: 1,
        utxos: [{ txid: '33'.repeat(32), vout: 0, value: 100_000 }],
        networkType: 'mainnet',
        validateAddresses: true,
      })
    ).toThrow(/Invalid address/);
  });
});
