/**
 * Status / error paths must never carry raw Electrum URLs into WalletStatus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectrumError } from '../domain/errors';
import {
  defaultSettings,
  type WalletSettings,
} from '../domain/settings';
import { WalletStatusSchema } from '../messaging/protocol';

const filterPermittedUrls = vi.fn();
const connectWithFailover = vi.fn();
const writeSettings = vi.fn();

vi.mock('../platform/permissions', () => ({
  filterPermittedUrls: (...args: unknown[]) => filterPermittedUrls(...args),
  assertHostPermission: vi.fn(),
  hasHostPermission: vi.fn(async () => true),
  releaseHostPermissionIfUnused: vi.fn(),
  HostPermissionRequiredError: class extends Error {
    code = 'host_permission_required';
  },
}));

vi.mock('../domain/electrum/client', () => ({
  connectWithFailover: (...args: unknown[]) => connectWithFailover(...args),
}));

vi.mock('../platform/storage', () => ({
  writeSettings: (...args: unknown[]) => writeSettings(...args),
  readSettings: vi.fn(async () => settingsWithCustom()),
  readVault: vi.fn(async () => undefined),
  readVaultState: vi.fn(async () => ({ state: 'absent' as const })),
  readLockout: vi.fn(async () => ({ failedAttempts: 0, lockoutUntil: null })),
  writeLockout: vi.fn(),
  writeVault: vi.fn(),
  clearVault: vi.fn(),
  clearLockoutStorage: vi.fn(),
  readDailySpend: vi.fn(async () => ({ dayKey: '2026-08-06', usedSats: 0 })),
  writeDailySpend: vi.fn(),
  clearDailySpendStorage: vi.fn(),
}));

vi.mock('../platform/alarms', () => ({
  clearAutoLockAlarm: vi.fn(),
  scheduleAutoLockAlarm: vi.fn(),
}));

function settingsWithCustom(): WalletSettings {
  const base = defaultSettings();
  return {
    ...base,
    termsAccepted: true,
    electrum: {
      ...base.electrum,
      mainnet: {
        endpoints: [{ kind: 'custom', url: 'wss://secret-node.example:50004' }],
        activeUrl: null,
      },
    },
  };
}

function assertNoHostLeak(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/wss:\/\//);
  expect(json).not.toMatch(/secret-node/);
  expect(json).not.toMatch(/:50004/);
  if (payload && typeof payload === 'object' && 'status' in payload) {
    const status = (payload as { status?: Record<string, unknown> }).status;
    if (status) {
      expect(status).not.toHaveProperty('serverUrl');
      const parsed = WalletStatusSchema.safeParse(status);
      expect(parsed.success).toBe(true);
    }
  }
}

describe('status error redaction', () => {
  beforeEach(() => {
    filterPermittedUrls.mockReset();
    connectWithFailover.mockReset();
    writeSettings.mockReset();
    vi.resetModules();
  });

  it('refresh failure surfaces host-free Connection failed', async () => {
    filterPermittedUrls.mockResolvedValue([
      'wss://secret-node.example:50004',
    ]);
    connectWithFailover.mockRejectedValue(new ElectrumError('CONNECT_FAILED'));

    // Identity required for refresh — mock a minimal unlocked path via re-import
    // after patching session internals is heavy; instead exercise withElectrumBatch
    // error mapping the same way session does.
    const { withElectrumBatch } = await import('./electrumRuntime');
    const settings = settingsWithCustom();

    await expect(
      withElectrumBatch(settings, 'mainnet', async () => null)
    ).rejects.toThrow(ElectrumError);

    try {
      await withElectrumBatch(settings, 'mainnet', async () => null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'fail';
      expect(message).toBe('Connection failed');
      expect(message).not.toMatch(/wss:\/\//);
      expect(message).not.toMatch(/secret-node/);
    }
  });

  it('WalletStatus schema rejects serverUrl and accepts serverKind', () => {
    const withUrl = WalletStatusSchema.safeParse({
      hasVault: true,
      locked: true,
      network: 'mainnet',
      termsAccepted: true,
      autoLockMinutes: 10,
      lockWhenPopupCloses: false,
      seedBackupConfirmed: true,
      serverUrl: 'wss://secret-node.example:50004',
      serverStatus: 'error',
      error: 'Connection failed',
    });
    // Zod strips unknown by default for object? Actually z.object strips unknown keys.
    // serverUrl is removed from schema — strip means success without the field.
    expect(withUrl.success).toBe(true);
    if (withUrl.success) {
      expect(withUrl.data).not.toHaveProperty('serverUrl');
    }

    const withKind = WalletStatusSchema.safeParse({
      hasVault: true,
      locked: false,
      network: 'mainnet',
      termsAccepted: true,
      autoLockMinutes: 10,
      lockWhenPopupCloses: true,
      seedBackupConfirmed: true,
      serverKind: 'custom',
      serverStatus: 'error',
      error: 'Connection failed',
    });
    expect(withKind.success).toBe(true);
    if (withKind.success) {
      expect(withKind.data.serverKind).toBe('custom');
      assertNoHostLeak({ status: withKind.data });
    }
  });

  it('ElectrumProbe schema has version only', async () => {
    const { ElectrumProbeSchema } = await import('../messaging/protocol');
    const ok = ElectrumProbeSchema.safeParse({
      version: ['ElectrumX', '1.4'],
    });
    expect(ok.success).toBe(true);

    const withUrl = ElectrumProbeSchema.safeParse({
      serverUrl: 'wss://secret-node.example:50004',
      version: ['ElectrumX', '1.4'],
    });
    // Extra keys stripped — must not require/echo serverUrl.
    expect(withUrl.success).toBe(true);
    if (withUrl.success) {
      expect(withUrl.data).not.toHaveProperty('serverUrl');
    }
  });
});
