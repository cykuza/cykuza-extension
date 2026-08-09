/**
 * P2.6: after preview, sessionRam must hold the UTXO/fee snapshot used for
 * planning so estimateSend stays coherent (no stale/missing cache).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../domain/settings';

const previewSend = vi.fn();
const readDailySpend = vi.fn(async () => ({
  dayKey: '2020-01-01',
  usedSats: 0,
}));
const readSettings = vi.fn(async () => defaultSettings());
const armAutoLock = vi.fn(async () => {});
const buildStatus = vi.fn(async () => ({
  hasVault: true,
  locked: false,
  network: 'mainnet' as const,
  termsAccepted: true,
  autoLockMinutes: 5,
  lockWhenPopupCloses: true,
}));

const sessionRam = {
  identity: {
    address: 'cy1test',
    scripthash: 'ab',
    kind: 'mnemonic' as const,
  },
  sessionGeneration: 1,
  lastServerStatus: 'idle' as string,
  lastServerError: undefined as string | undefined,
  lastServerUrl: null as string | null,
  watchActive: false,
  cachedBalance: undefined as
    | { confirmed: number; unconfirmed: number }
    | undefined,
  cachedHistory: undefined,
  cachedFeeRates: undefined as
    | { slow: number; standard: number; estimated: boolean }
    | undefined,
  cachedUtxos: undefined as
    | Array<{ txid: string; vout: number; value: number }>
    | undefined,
};

vi.mock('../platform/storage', () => ({
  readDailySpend: () => readDailySpend(),
  readSettings: () => readSettings(),
  writeDailySpend: vi.fn(),
}));

vi.mock('./transactions', () => ({
  previewSend: (...args: unknown[]) => previewSend(...args),
  sendTransaction: vi.fn(),
  estimateSpend: vi.fn(),
}));

vi.mock('./session/state', () => ({
  sessionRam,
  armAutoLock: (...args: unknown[]) => armAutoLock(...args),
  clearChainCache: vi.fn(),
}));

vi.mock('./session/status', () => ({
  buildStatus: (...args: unknown[]) => buildStatus(...args),
}));

vi.mock('./session/vaultHandlers', () => ({
  verifyVaultPassword: vi.fn(),
}));

vi.mock('./session/chainSnapshot', () => ({
  refreshFromClient: vi.fn(),
}));

vi.mock('./electrumWatch', () => ({
  getWatchClient: vi.fn(() => null),
  refreshViaWatch: vi.fn(),
  settleServerStatusAfterBatch: vi.fn(() => {
    sessionRam.lastServerStatus = 'idle';
    sessionRam.lastServerError = undefined;
  }),
}));

vi.mock('./electrumRuntime', () => ({
  withElectrumRefreshBatch: vi.fn(),
}));

vi.mock('./electrumTrustGate', () => ({
  requireElectrumTrustForChainOps: vi.fn(async () => 'verified'),
}));

describe('handlePreviewSend cache write (P2.6)', () => {
  beforeEach(() => {
    vi.resetModules();
    previewSend.mockReset();
    armAutoLock.mockReset();
    sessionRam.cachedBalance = undefined;
    sessionRam.cachedUtxos = undefined;
    sessionRam.cachedFeeRates = undefined;
    sessionRam.lastServerStatus = 'idle';
    sessionRam.lastServerError = undefined;
    sessionRam.lastServerUrl = null;
    readSettings.mockResolvedValue(defaultSettings());
    readDailySpend.mockResolvedValue({ dayKey: '2020-01-01', usedSats: 0 });
  });

  it('writes utxos, feeRates, and balance into sessionRam after preview', async () => {
    const utxos = [{ txid: 'aa'.repeat(32), vout: 0, value: 200_000 }];
    const feeRates = { slow: 1, standard: 2, estimated: true };
    const balance = { confirmed: 200_000, unconfirmed: 0 };

    // Before fix: estimate would fail when cache is empty after preview.
    expect(sessionRam.cachedUtxos).toBeUndefined();

    previewSend.mockResolvedValue({
      confirmation: {
        to: 'cy1test',
        amountSats: 10_000,
        fee: 140,
        total: 10_140,
        includeFee: false,
        spendLimitExceeded: false,
        largeSend: false,
        dailySpendRemainingSats: null,
      },
      confirmationToken: 'tok',
      feeRate: 2,
      serverUrl: 'wss://mock.example:50004',
      settings: defaultSettings(),
      balance,
      utxos,
      feeRates,
    });

    const { handlePreviewSend } = await import('./session/sendHandlers');
    const res = await handlePreviewSend('cy1test', 10_000, false);

    expect(res.ok).toBe(true);
    expect(sessionRam.cachedUtxos).toEqual(utxos);
    expect(sessionRam.cachedFeeRates).toEqual(feeRates);
    expect(sessionRam.cachedBalance).toEqual(balance);
    expect(sessionRam.lastServerUrl).toBe('wss://mock.example:50004');
  });
});
