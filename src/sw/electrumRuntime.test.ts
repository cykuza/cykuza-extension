import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSettings,
  type WalletSettings,
} from '../domain/settings';

const BUILTIN = 'wss://builtin.example:50004';

const filterPermittedUrls = vi.fn();
const assertHostPermission = vi.fn();
const connectWithFailover = vi.fn();
const writeSettings = vi.fn();

vi.mock('../platform/permissions', () => ({
  filterPermittedUrls: (...args: unknown[]) => filterPermittedUrls(...args),
  assertHostPermission: (...args: unknown[]) => assertHostPermission(...args),
  HostPermissionRequiredError: class HostPermissionRequiredError extends Error {
    readonly code = 'host_permission_required' as const;
    constructor(
      message = 'Allow this Electrum host from the Cykuza grant tab first.'
    ) {
      super(message);
      this.name = 'HostPermissionRequiredError';
    }
  },
}));

vi.mock('../domain/electrum/client', () => ({
  connectWithFailover: (...args: unknown[]) => connectWithFailover(...args),
}));

vi.mock('../platform/storage', () => ({
  writeSettings: (...args: unknown[]) => writeSettings(...args),
}));

function settingsWith(
  endpoints: Array<{ kind: 'default' | 'custom'; url: string }>,
  activeUrl: string | null = null
): WalletSettings {
  const base = defaultSettings();
  return {
    ...base,
    electrum: {
      ...base.electrum,
      mainnet: { endpoints, activeUrl },
    },
  };
}

describe('withElectrumBatch permission filter', () => {
  beforeEach(() => {
    filterPermittedUrls.mockReset();
    assertHostPermission.mockReset();
    connectWithFailover.mockReset();
    writeSettings.mockReset();
  });

  it('connects only to permitted URLs when some custom lack grant', async () => {
    const { withElectrumBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: 'wss://ungranted.example:50004' },
      { kind: 'default', url: BUILTIN },
      { kind: 'custom', url: 'wss://granted.example:50004' },
    ]);

    filterPermittedUrls.mockResolvedValue([BUILTIN, 'wss://granted.example:50004']);

    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: BUILTIN,
      version: ['ElectrumX', '1.4'],
    });

    const result = await withElectrumBatch(settings, 'mainnet', async () => 42);

    expect(filterPermittedUrls).toHaveBeenCalled();
    expect(connectWithFailover).toHaveBeenCalledWith([
      BUILTIN,
      'wss://granted.example:50004',
    ]);
    expect(result.value).toBe(42);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('throws UX error when no candidates are permitted', async () => {
    const { withElectrumBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: 'wss://only.example:50004' },
    ]);
    filterPermittedUrls.mockResolvedValue([]);

    await expect(
      withElectrumBatch(settings, 'mainnet', async () => null)
    ).rejects.toThrow(
      'No permitted Electrum servers. Open Settings and grant access (or add a server).'
    );
    expect(connectWithFailover).not.toHaveBeenCalled();
  });

  it('skips sticky activeUrl when it lacks grant', async () => {
    const { withElectrumBatch } = await import('./electrumRuntime');
    const sticky = 'wss://sticky.example:50004';
    const fallback = BUILTIN;
    const settings = settingsWith(
      [
        { kind: 'custom', url: sticky },
        { kind: 'default', url: fallback },
      ],
      sticky
    );

    // getConnectCandidates puts sticky first; filter drops it.
    filterPermittedUrls.mockImplementation(async (urls: string[]) =>
      urls.filter((u) => u !== sticky)
    );

    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: fallback,
      version: ['ElectrumX', '1.4'],
    });

    await withElectrumBatch(settings, 'mainnet', async () => 'ok');

    const passed = connectWithFailover.mock.calls[0]![0] as string[];
    expect(passed).not.toContain(sticky);
    expect(passed).toContain(fallback);
  });
});

describe('probeElectrumUrl permission assert (P2.1)', () => {
  beforeEach(() => {
    assertHostPermission.mockReset();
    connectWithFailover.mockReset();
  });

  it('rejects without grant and does not connect', async () => {
    const { HostPermissionRequiredError } = await import(
      '../platform/permissions'
    );
    const { probeElectrumUrl } = await import('./electrumRuntime');
    assertHostPermission.mockRejectedValue(new HostPermissionRequiredError());

    await expect(
      probeElectrumUrl('wss://ungranted.example:50004')
    ).rejects.toThrow(HostPermissionRequiredError);
    expect(connectWithFailover).not.toHaveBeenCalled();
  });

  it('connects after assert succeeds', async () => {
    const { probeElectrumUrl } = await import('./electrumRuntime');
    assertHostPermission.mockResolvedValue(undefined);
    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: 'wss://granted.example:50004',
      version: ['ElectrumX', '1.4'],
    });

    const result = await probeElectrumUrl('wss://granted.example:50004');
    expect(assertHostPermission).toHaveBeenCalledWith(
      'wss://granted.example:50004'
    );
    expect(connectWithFailover).toHaveBeenCalledWith([
      'wss://granted.example:50004',
    ]);
    expect(result.serverUrl).toBe('wss://granted.example:50004');
    expect(client.disconnect).toHaveBeenCalled();
  });
});
