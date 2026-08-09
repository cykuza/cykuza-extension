import { afterEach, describe, expect, it } from 'vitest';
import { TxError } from '../domain/errors';
import { planSpend, type SpendPlan } from '../domain/transaction';
import {
  clearConfirmations,
  CONFIRMATION_TTL_MS,
  confirmationFromPlan,
  peekConfirmation,
  pendingConfirmationCount,
  storeConfirmation,
  takeConfirmation,
} from './confirmations';

function samplePlan(): SpendPlan {
  return planSpend({
    toAddress: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
    fromAddress: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
    amountSats: 10_000,
    feeRate: 1,
    utxos: [{ txid: 'a'.repeat(64), vout: 0, value: 100_000 }],
    networkType: 'mainnet',
    includeFee: false,
    validateAddresses: false,
  });
}

const defaultFlags = {
  spendLimitExceeded: false,
  largeSend: false,
  dailySpendRemainingSats: null as number | null,
};

afterEach(() => {
  clearConfirmations();
});

describe('confirmation tokens', () => {
  it('stores a one-time token bound to session/network/address', () => {
    const plan = samplePlan();
    const { token, confirmation } = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    expect(token).toHaveLength(64);
    expect(confirmation).toEqual(confirmationFromPlan(plan, defaultFlags));
    expect(confirmation).not.toHaveProperty('hex');
    expect(confirmation).not.toHaveProperty('keyPair');
    expect(Object.keys(confirmation).sort()).toEqual(
      [
        'amountSats',
        'dailySpendRemainingSats',
        'fee',
        'includeFee',
        'largeSend',
        'spendLimitExceeded',
        'to',
        'total',
      ].sort()
    );
    expect(pendingConfirmationCount()).toBe(1);
  });

  it('replaces previous pending confirmation', () => {
    const plan = samplePlan();
    const first = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    const second = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      spendLimitExceeded: true,
      largeSend: true,
      dailySpendRemainingSats: 0,
    });
    expect(first.token).not.toBe(second.token);
    expect(pendingConfirmationCount()).toBe(1);
    expect(peekConfirmation(first.token)).toBeUndefined();
    expect(peekConfirmation(second.token)).toBeDefined();
    expect(peekConfirmation(second.token)?.spendLimitExceeded).toBe(true);
    expect(peekConfirmation(second.token)?.largeSend).toBe(true);
  });

  it('takeConfirmation is one-shot', () => {
    const plan = samplePlan();
    const { token } = storeConfirmation({
      plan,
      sessionGeneration: 3,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    const taken = takeConfirmation({
      token,
      sessionGeneration: 3,
      network: 'mainnet',
      address: plan.fromAddress,
    });
    expect(taken.plan.amountSats).toBe(plan.amountSats);
    expect(pendingConfirmationCount()).toBe(0);

    expect(() =>
      takeConfirmation({
        token,
        sessionGeneration: 3,
        network: 'mainnet',
        address: plan.fromAddress,
      })
    ).toThrow(TxError);
  });

  it('rejects expired tokens', () => {
    const plan = samplePlan();
    const now = 1_000_000;
    const { token } = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
      now,
    });
    expect(() =>
      takeConfirmation({
        token,
        sessionGeneration: 1,
        network: 'mainnet',
        address: plan.fromAddress,
        now: now + CONFIRMATION_TTL_MS + 1,
      })
    ).toThrow(/expired/i);
  });

  it('rejects mismatched session generation / network / address', () => {
    const plan = samplePlan();
    const { token } = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });

    expect(() =>
      takeConfirmation({
        token,
        sessionGeneration: 2,
        network: 'mainnet',
        address: plan.fromAddress,
      })
    ).toThrow(TxError);

    const again = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    expect(() =>
      takeConfirmation({
        token: again.token,
        sessionGeneration: 1,
        network: 'testnet',
        address: plan.fromAddress,
      })
    ).toThrow(TxError);

    const third = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    expect(() =>
      takeConfirmation({
        token: third.token,
        sessionGeneration: 1,
        network: 'mainnet',
        address: 'cy1qdifferent',
      })
    ).toThrow(TxError);
  });

  it('clearConfirmations wipes all', () => {
    const plan = samplePlan();
    storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: plan.fromAddress,
      ...defaultFlags,
    });
    clearConfirmations();
    expect(pendingConfirmationCount()).toBe(0);
  });
});
