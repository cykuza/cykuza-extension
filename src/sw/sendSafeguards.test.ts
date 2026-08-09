/**
 * SW send-safeguard enforcement (suffix / daily limit / large send).
 * Reproduces failures that UI-only checks would miss.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDailySpendState, recordSpend } from '../domain/dailySpend';
import { TxError } from '../domain/errors';
import { unlockIdentity } from '../domain/keyring';
import { defaultSettings } from '../domain/settings';
import { addressConfirmSuffix } from '../domain/settings';
import {
  clearConfirmations,
  peekConfirmation,
  storeConfirmation,
} from './confirmations';
import { sendTransaction } from './transactions';
import { planSpend } from '../domain/transaction';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

vi.mock('./electrumRuntime', () => ({
  withElectrumBatch: vi.fn(async (_settings, _network, fn) => {
    const client = {
      broadcast: async (hex: string) => {
        expect(hex.length).toBeGreaterThan(0);
        return 'ee'.repeat(32);
      },
    };
    return {
      value: await fn(client),
      serverUrl: 'wss://mock.example:50004',
      settings: _settings,
    };
  }),
  withElectrumBroadcastBatch: vi.fn(async (_settings, _network, hex: string) => {
    expect(hex.length).toBeGreaterThan(0);
    return {
      value: 'ee'.repeat(32),
      serverUrl: 'wss://mock.example:50004',
      version: ['ElectrumX', '1.4'] as [string, string],
      settings: _settings,
    };
  }),
  withElectrumRefreshBatch: vi.fn(async (_settings, _network, fn) => {
    const client = {
      getBalance: async () => ({ confirmed: 200_000, unconfirmed: 0 }),
      listUnspent: async () => [
        { tx_hash: 'aa'.repeat(32), tx_pos: 0, value: 200_000, height: 1 },
      ],
      estimateFee: async () => 0.00001,
    };
    return {
      value: await fn(client),
      serverUrl: 'wss://mock.example:50004',
      version: ['ElectrumX', '1.4'] as [string, string],
      settings: _settings,
    };
  }),
}));

afterEach(() => {
  clearConfirmations();
});

describe('sendTransaction safeguards', () => {
  async function setupPending(opts: {
    spendLimitExceeded?: boolean;
    largeSend?: boolean;
    amountSats?: number;
  }) {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const plan = planSpend({
      toAddress: identity.address,
      fromAddress: identity.address,
      amountSats: opts.amountSats ?? 10_000,
      feeRate: 1,
      utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 200_000 }],
      networkType: 'mainnet',
      includeFee: false,
      validateAddresses: true,
    });
    const { token } = storeConfirmation({
      plan,
      sessionGeneration: 1,
      network: 'mainnet',
      address: identity.address,
      spendLimitExceeded: opts.spendLimitExceeded ?? false,
      largeSend: opts.largeSend ?? false,
      dailySpendRemainingSats: null,
    });
    return { identity, plan, token };
  }

  it('rejects wrong address suffix without burning the confirmation token', async () => {
    const { identity, token } = await setupPending({});
    await expect(
      sendTransaction({
        identity,
        settings: defaultSettings(),
        sessionGeneration: 1,
        network: 'mainnet',
        confirmationToken: token,
        toConfirmSuffix: 'XXXXXX',
      })
    ).rejects.toMatchObject({ code: 'ADDRESS_CONFIRM_MISMATCH' });
    expect(peekConfirmation(token)).toBeDefined();
  });

  it('rejects spend without allowSpendLimitOnce when limit exceeded', async () => {
    const { identity, token, plan } = await setupPending({
      spendLimitExceeded: true,
    });
    await expect(
      sendTransaction({
        identity,
        settings: defaultSettings(),
        sessionGeneration: 1,
        network: 'mainnet',
        confirmationToken: token,
        toConfirmSuffix: addressConfirmSuffix(plan.toAddress),
      })
    ).rejects.toMatchObject({ code: 'SPEND_LIMIT_OVERRIDE_REQUIRED' });
  });

  it('rejects large send without acknowledgeLargeSend', async () => {
    const { identity, token, plan } = await setupPending({ largeSend: true });
    await expect(
      sendTransaction({
        identity,
        settings: defaultSettings(),
        sessionGeneration: 1,
        network: 'mainnet',
        confirmationToken: token,
        toConfirmSuffix: addressConfirmSuffix(plan.toAddress),
      })
    ).rejects.toMatchObject({ code: 'LARGE_SEND_ACK_REQUIRED' });
  });

  it('succeeds when suffix + required acks are present', async () => {
    const { identity, token, plan } = await setupPending({
      spendLimitExceeded: true,
      largeSend: true,
    });
    const result = await sendTransaction({
      identity,
      settings: defaultSettings(),
      sessionGeneration: 1,
      network: 'mainnet',
      confirmationToken: token,
      toConfirmSuffix: addressConfirmSuffix(plan.toAddress),
      allowSpendLimitOnce: true,
      acknowledgeLargeSend: true,
    });
    expect(result.txid).toBe('ee'.repeat(32));
    expect(result.total).toBe(plan.total);
  });
});

describe('daily spend recording helpers used by send', () => {
  it('recordSpend after allow-once still accumulates', () => {
    const now = Date.now();
    let state = defaultDailySpendState(now);
    state = recordSpend(state, 40_000, now);
    expect(state.usedSats).toBe(40_000);
    state = recordSpend(state, 10_000, now);
    expect(state.usedSats).toBe(50_000);
  });

  it('TxError messages stay host-free', () => {
    expect(new TxError('SPEND_LIMIT_OVERRIDE_REQUIRED').message).not.toMatch(
      /wss:\/\//
    );
    expect(new TxError('ADDRESS_CONFIRM_MISMATCH').message).not.toMatch(
      /cy1/
    );
  });
});
