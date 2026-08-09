/**
 * P0.3: after a successful broadcast, writeDailySpend failure must not
 * invert the send response to ok: false.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../domain/settings';

const writeDailySpend = vi.fn();
const readDailySpend = vi.fn(async () => ({ dayKey: '2020-01-01', usedSats: 0 }));
const readSettings = vi.fn(async () => defaultSettings());
const sendTransaction = vi.fn();
const verifyVaultPassword = vi.fn(async () => ({ ok: true as const }));
const withElectrumRefreshBatch = vi.fn();
const armAutoLock = vi.fn(async () => {});
const clearChainCache = vi.fn();
const buildStatus = vi.fn(async () => ({
  hasVault: true,
  locked: false,
  network: 'mainnet' as const,
  termsAccepted: true,
  autoLockMinutes: 5,
  lockWhenPopupCloses: true,
}));

vi.mock('../platform/storage', () => ({
  readDailySpend: () => readDailySpend(),
  writeDailySpend: (...args: unknown[]) => writeDailySpend(...args),
  readSettings: () => readSettings(),
}));

vi.mock('./transactions', () => ({
  sendTransaction: (...args: unknown[]) => sendTransaction(...args),
  previewSend: vi.fn(),
  estimateSpend: vi.fn(),
}));

vi.mock('./session/vaultHandlers', () => ({
  verifyVaultPassword: (...args: unknown[]) => verifyVaultPassword(...args),
}));

vi.mock('./electrumRuntime', () => ({
  withElectrumRefreshBatch: (...args: unknown[]) =>
    withElectrumRefreshBatch(...args),
}));

vi.mock('./electrumTrustGate', () => ({
  requireElectrumTrustForChainOps: vi.fn(async () => 'verified'),
}));

vi.mock('./session/state', () => ({
  sessionRam: {
    identity: { address: 'cy1test', scripthash: 'ab', kind: 'mnemonic' },
    sessionGeneration: 1,
    lastServerStatus: 'idle' as string,
    lastServerError: undefined as string | undefined,
    lastServerUrl: null as string | null,
    watchActive: false,
    cachedBalance: undefined,
    cachedHistory: undefined,
    cachedFeeRates: undefined,
    cachedUtxos: undefined,
  },
  armAutoLock: (...args: unknown[]) => armAutoLock(...args),
  clearChainCache: (...args: unknown[]) => clearChainCache(...args),
}));

vi.mock('./session/status', () => ({
  buildStatus: (...args: unknown[]) => buildStatus(...args),
}));

vi.mock('./session/chainSnapshot', () => ({
  refreshFromClient: vi.fn(),
}));

vi.mock('./electrumWatch', () => ({
  getWatchClient: vi.fn(() => null),
  refreshViaWatch: vi.fn(),
  settleServerStatusAfterBatch: vi.fn(),
}));

describe('handleSend after broadcast (P0.3)', () => {
  beforeEach(() => {
    vi.resetModules();
    writeDailySpend.mockReset();
    sendTransaction.mockReset();
    withElectrumRefreshBatch.mockReset();
    verifyVaultPassword.mockResolvedValue({ ok: true });
    readDailySpend.mockResolvedValue({ dayKey: '2020-01-01', usedSats: 0 });
    readSettings.mockResolvedValue(defaultSettings());
    buildStatus.mockResolvedValue({
      hasVault: true,
      locked: false,
      network: 'mainnet',
      termsAccepted: true,
      autoLockMinutes: 5,
      lockWhenPopupCloses: true,
    });
  });

  it('returns ok:true + txid when writeDailySpend throws after broadcast', async () => {
    const txid = 'ab'.repeat(32);
    sendTransaction.mockResolvedValue({
      txid,
      fee: 100,
      total: 10_100,
      serverUrl: 'wss://mock.example:50004',
      settings: defaultSettings(),
    });
    writeDailySpend.mockRejectedValue(new Error('quota exceeded'));
    withElectrumRefreshBatch.mockRejectedValue(new Error('refresh failed'));

    const { handleSend } = await import('./session/sendHandlers');
    const res = await handleSend('token', 'correct horse battery', 'abcdef');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.txid).toBe(txid);
    expect(writeDailySpend).toHaveBeenCalled();
  });
});
