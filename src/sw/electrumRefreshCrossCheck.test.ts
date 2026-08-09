import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectrumError } from '../domain/errors';
import {
  defaultSettings,
  type WalletSettings,
} from '../domain/settings';
import type { Utxo } from '../domain/transaction';

const PRIMARY = 'wss://primary.example:50004';
const SECONDARY = 'wss://secondary.example:50004';
const BUILTIN = 'wss://builtin.example:50004';

const filterPermittedUrls = vi.fn();
const connectWithFailover = vi.fn();
const writeSettings = vi.fn();

const primaryConnectAndProbe = vi.fn();
const secondaryConnectAndProbe = vi.fn();
const primaryDisconnect = vi.fn();
const secondaryDisconnect = vi.fn();
const primaryBroadcast = vi.fn();
const secondaryBroadcast = vi.fn();

let clientCtorCount = 0;

vi.mock('../platform/permissions', () => ({
  filterPermittedUrls: (...args: unknown[]) => filterPermittedUrls(...args),
}));

vi.mock('../domain/electrum/client', () => {
  class MockElectrumClient {
    connectAndProbe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    broadcast: ReturnType<typeof vi.fn>;
    constructor() {
      clientCtorCount += 1;
      if (clientCtorCount % 2 === 1) {
        this.connectAndProbe = primaryConnectAndProbe;
        this.disconnect = primaryDisconnect;
        this.broadcast = primaryBroadcast;
      } else {
        this.connectAndProbe = secondaryConnectAndProbe;
        this.disconnect = secondaryDisconnect;
        this.broadcast = secondaryBroadcast;
      }
    }
  }
  return {
    ElectrumClient: MockElectrumClient,
    connectWithFailover: (...args: unknown[]) => connectWithFailover(...args),
  };
});

vi.mock('../platform/storage', () => ({
  writeSettings: (...args: unknown[]) => writeSettings(...args),
}));

function settingsWith(
  endpoints: Array<{ kind: 'default' | 'custom'; url: string }>,
  opts: {
    activeUrl?: string | null;
    verifyWithSecondServer?: boolean;
  } = {}
): WalletSettings {
  const base = defaultSettings();
  return {
    ...base,
    verifyWithSecondServer: opts.verifyWithSecondServer ?? true,
    electrum: {
      ...base.electrum,
      mainnet: {
        endpoints,
        activeUrl: opts.activeUrl ?? null,
      },
    },
  };
}

const matchingSnapshot = {
  balance: { confirmed: 50_000, unconfirmed: 0 },
  history: [] as Array<{ tx_hash: string; height: number }>,
  feeRates: { slow: 1, standard: 2, estimated: true },
  utxos: [{ txid: 'aa', vout: 0, value: 50_000 }] as Utxo[],
};

describe('withElectrumRefreshBatch cross-check', () => {
  beforeEach(() => {
    filterPermittedUrls.mockReset();
    connectWithFailover.mockReset();
    writeSettings.mockReset();
    primaryConnectAndProbe.mockReset();
    secondaryConnectAndProbe.mockReset();
    primaryDisconnect.mockReset();
    secondaryDisconnect.mockReset();
    primaryBroadcast.mockReset();
    secondaryBroadcast.mockReset();
    clientCtorCount = 0;
    primaryConnectAndProbe.mockResolvedValue(['ElectrumX', '1.4']);
    secondaryConnectAndProbe.mockResolvedValue(['ElectrumX', '1.4']);
    primaryBroadcast.mockResolvedValue('ee'.repeat(32));
    secondaryBroadcast.mockResolvedValue('ee'.repeat(32));
  });

  it('match: returns primary value, persists sticky primary, disconnects both', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY]);

    const fn = vi.fn(async () => ({ ...matchingSnapshot }));
    const result = await withElectrumRefreshBatch(settings, 'mainnet', fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.value.balance.confirmed).toBe(50_000);
    expect(result.serverUrl).toBe(PRIMARY);
    expect(writeSettings).toHaveBeenCalled();
    const written = writeSettings.mock.calls[0]![0] as WalletSettings;
    expect(written.electrum.mainnet.activeUrl).toBe(PRIMARY);
    expect(primaryDisconnect).toHaveBeenCalled();
    expect(secondaryDisconnect).toHaveBeenCalled();
    expect(connectWithFailover).not.toHaveBeenCalled();
  });

  it('mismatch: SERVERS_DISAGREE, no sticky write, host-free message', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY]);

    let call = 0;
    const fn = vi.fn(async () => {
      call += 1;
      if (call === 1) return { ...matchingSnapshot };
      return {
        ...matchingSnapshot,
        balance: { confirmed: 1, unconfirmed: 0 },
        utxos: [{ txid: 'aa', vout: 0, value: 1 }] as Utxo[],
      };
    });

    await expect(
      withElectrumRefreshBatch(settings, 'mainnet', fn)
    ).rejects.toMatchObject({
      name: 'ElectrumError',
      code: 'SERVERS_DISAGREE',
      message: 'Servers disagree — check Electrum config',
    });
    expect(writeSettings).not.toHaveBeenCalled();
    expect(primaryDisconnect).toHaveBeenCalled();
    expect(secondaryDisconnect).toHaveBeenCalled();
  });

  it('one permitted of two configured: falls back to single-server path', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY]);

    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: PRIMARY,
      version: ['ElectrumX', '1.4'],
    });

    const fn = vi.fn(async () => ({ ...matchingSnapshot }));
    const result = await withElectrumRefreshBatch(settings, 'mainnet', fn);

    expect(connectWithFailover).toHaveBeenCalledWith([PRIMARY]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.serverUrl).toBe(PRIMARY);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('verify off with ≥2 permitted: single-server path', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith(
      [
        { kind: 'custom', url: PRIMARY },
        { kind: 'custom', url: SECONDARY },
      ],
      { verifyWithSecondServer: false }
    );
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY]);

    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: PRIMARY,
      version: ['ElectrumX', '1.4'],
    });

    const fn = vi.fn(async () => ({ ...matchingSnapshot }));
    await withElectrumRefreshBatch(settings, 'mainnet', fn);

    expect(connectWithFailover).toHaveBeenCalledWith([PRIMARY, SECONDARY]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(primaryConnectAndProbe).not.toHaveBeenCalled();
  });

  it('secondary connect fail: VERIFY_FAILED, no sticky write', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY]);
    secondaryConnectAndProbe.mockRejectedValue(
      new ElectrumError('CONNECT_FAILED')
    );

    await expect(
      withElectrumRefreshBatch(settings, 'mainnet', async () => matchingSnapshot)
    ).rejects.toMatchObject({
      code: 'VERIFY_FAILED',
      message: 'Could not verify with second server',
    });
    expect(writeSettings).not.toHaveBeenCalled();
    expect(primaryDisconnect).toHaveBeenCalled();
    expect(secondaryDisconnect).toHaveBeenCalled();
  });

  it('primary connect fail rotates to next pair (P1.2)', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const TERTIARY = 'wss://tertiary.example:50004';
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
      { kind: 'custom', url: TERTIARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY, TERTIARY]);

    // Pair 1 (PRIMARY, SECONDARY): primary connect fails → rotate.
    // Pair 2 (SECONDARY, TERTIARY): both connect.
    let primaryProbes = 0;
    primaryConnectAndProbe.mockImplementation(async () => {
      primaryProbes += 1;
      if (primaryProbes === 1) {
        throw new ElectrumError('CONNECT_FAILED');
      }
      return ['ElectrumX', '1.4'];
    });
    secondaryConnectAndProbe.mockResolvedValue(['ElectrumX', '1.4']);

    const fn = vi.fn(async () => ({ ...matchingSnapshot }));
    const result = await withElectrumRefreshBatch(settings, 'mainnet', fn);

    expect(result.serverUrl).toBe(SECONDARY);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(writeSettings).toHaveBeenCalled();
  });

  it('dual broadcast mismatch: SERVERS_DISAGREE (P1.1)', async () => {
    const { withElectrumBroadcastBatch } = await import('./electrumRuntime');
    const settings = settingsWith([
      { kind: 'custom', url: PRIMARY },
      { kind: 'custom', url: SECONDARY },
    ]);
    filterPermittedUrls.mockResolvedValue([PRIMARY, SECONDARY]);
    primaryBroadcast.mockResolvedValue('aa'.repeat(32));
    secondaryBroadcast.mockResolvedValue('bb'.repeat(32));

    await expect(
      withElectrumBroadcastBatch(settings, 'mainnet', 'deadbeef')
    ).rejects.toMatchObject({ code: 'SERVERS_DISAGREE' });
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('single endpoint unchanged (single path)', async () => {
    const { withElectrumRefreshBatch } = await import('./electrumRuntime');
    const settings = settingsWith([{ kind: 'default', url: BUILTIN }]);
    filterPermittedUrls.mockResolvedValue([BUILTIN]);

    const client = { disconnect: vi.fn() };
    connectWithFailover.mockResolvedValue({
      client,
      serverUrl: BUILTIN,
      version: ['ElectrumX', '1.4'],
    });

    const result = await withElectrumRefreshBatch(
      settings,
      'mainnet',
      async () => matchingSnapshot
    );
    expect(result.serverUrl).toBe(BUILTIN);
    expect(connectWithFailover).toHaveBeenCalledWith([BUILTIN]);
  });
});
