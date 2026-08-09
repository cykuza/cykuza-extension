import { describe, expect, it, vi } from 'vitest';

const { BUILTIN_A, BUILTIN_B, BUILTINS } = vi.hoisted(() => {
  const a = 'wss://builtin-a.example:50004';
  const b = 'wss://builtin-b.example:50004';
  return { BUILTIN_A: a, BUILTIN_B: b, BUILTINS: [a, b] as const };
});

vi.mock('./electrum/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./electrum/defaults')>();
  return {
    ...actual,
    DEFAULT_ELECTRUM_MAINNET: BUILTINS,
    isDefaultElectrumUrl: (url: string) =>
      (BUILTINS as readonly string[]).includes(url),
  };
});

import { DEFAULT_ELECTRUM_MAINNET } from './electrum/defaults';
import { unlockIdentity } from './keyring';
import {
  addAddressBookEntry,
  addCustomEndpoint,
  defaultSettings,
  ElectrumUnconfiguredError,
  getConnectCandidates,
  isLargeSend,
  matchesAddressConfirmSuffix,
  normalizeSettings,
  orderUrlsForConnect,
  publicElectrumView,
  removeAddressBookEntry,
  removeEndpoint,
  reorderEndpoint,
  resolveElectrumServers,
  setActiveUrl,
  setDailySpendLimit,
  setVerifyWithSecondServer,
} from './settings';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('normalizeSettings', () => {
  it('returns build-time defaults for empty input', () => {
    const s = normalizeSettings(null);
    expect(s.version).toBe(6);
    expect(s.network).toBe('mainnet');
    expect(s.autoLockMinutes).toBe(5);
    expect(s.lockWhenPopupCloses).toBe(true);
    expect(s.explorerTxTemplate).toBeNull();
    expect(s.verifyWithSecondServer).toBe(true);
    expect(s.addressBook).toEqual([]);
    expect(s.dailySpendLimitSats).toBeNull();
    expect(resolveElectrumServers(s, 'mainnet')).toEqual([...BUILTINS]);
    expect(resolveElectrumServers(s, 'testnet')).toEqual([]);
  });

  it('migrates legacy v1 customServers (mainnet custom replaces defaults)', () => {
    const s = normalizeSettings({
      version: 1,
      network: 'mainnet',
      customServers: {
        mainnet: ['wss://custom.example:50004'],
        testnet: ['wss://test.example:50004'],
      },
      autoLockMinutes: 10,
      termsAccepted: true,
    });
    expect(s.version).toBe(6);
    expect(s.termsAccepted).toBe(true);
    expect(s.lockWhenPopupCloses).toBe(false);
    expect(s.explorerTxTemplate).toBeNull();
    expect(s.addressBook).toEqual([]);
    expect(s.dailySpendLimitSats).toBeNull();
    expect(resolveElectrumServers(s, 'mainnet')).toEqual([
      'wss://custom.example:50004',
    ]);
    expect(resolveElectrumServers(s, 'testnet')).toEqual([
      'wss://test.example:50004',
    ]);
  });

  it('keeps a valid explorerTxTemplate and drops invalid', () => {
    const good = normalizeSettings({
      explorerTxTemplate: 'https://explorer.example/tx/{txid}',
    });
    expect(good.explorerTxTemplate).toBe(
      'https://explorer.example/tx/{txid}'
    );

    const bad = normalizeSettings({
      explorerTxTemplate: 'http://explorer.example/tx/{txid}',
    });
    expect(bad.explorerTxTemplate).toBeNull();

    const v2 = normalizeSettings({
      version: 2,
      network: 'mainnet',
      autoLockMinutes: 10,
      termsAccepted: false,
    });
    expect(v2.version).toBe(6);
    expect(v2.explorerTxTemplate).toBeNull();
    expect(v2.lockWhenPopupCloses).toBe(false);
  });

  it('v3 settings without lockWhenPopupCloses migrate to off', () => {
    const s = normalizeSettings({
      version: 3,
      network: 'mainnet',
      autoLockMinutes: 10,
      termsAccepted: true,
    });
    expect(s.version).toBe(6);
    expect(s.autoLockMinutes).toBe(10);
    expect(s.lockWhenPopupCloses).toBe(false);
  });

  it('preserves explicit lockWhenPopupCloses boolean', () => {
    const on = normalizeSettings({
      version: 3,
      lockWhenPopupCloses: true,
      autoLockMinutes: 10,
    });
    expect(on.lockWhenPopupCloses).toBe(true);

    const off = normalizeSettings({
      version: 4,
      lockWhenPopupCloses: false,
    });
    expect(off.lockWhenPopupCloses).toBe(false);
  });

  it('v4 settings migrate to empty address book and null spend limit', () => {
    const s = normalizeSettings({
      version: 4,
      network: 'mainnet',
      autoLockMinutes: 5,
      lockWhenPopupCloses: true,
      termsAccepted: true,
    });
    expect(s.version).toBe(6);
    expect(s.addressBook).toEqual([]);
    expect(s.dailySpendLimitSats).toBeNull();
    expect(s.verifyWithSecondServer).toBe(true);
  });

  it('v5 settings without verifyWithSecondServer migrate to on', () => {
    const s = normalizeSettings({
      version: 5,
      network: 'mainnet',
      autoLockMinutes: 5,
      lockWhenPopupCloses: true,
      termsAccepted: true,
      addressBook: [],
      dailySpendLimitSats: null,
    });
    expect(s.version).toBe(6);
    expect(s.verifyWithSecondServer).toBe(true);
  });

  it('preserves explicit verifyWithSecondServer boolean', () => {
    expect(
      normalizeSettings({
        version: 6,
        verifyWithSecondServer: false,
      }).verifyWithSecondServer
    ).toBe(false);
    expect(
      normalizeSettings({
        version: 6,
        verifyWithSecondServer: true,
      }).verifyWithSecondServer
    ).toBe(true);
  });

  it('strips unknown keys from settings blobs', () => {
    const s = normalizeSettings({
      version: 6,
      autoLockMinutes: 5,
      lockWhenPopupCloses: true,
      termsAccepted: true,
      unexpectedSecret: 'drop-me',
    });
    expect(s).not.toHaveProperty('unexpectedSecret');
    expect(Object.keys(s).sort()).toEqual([
      'addressBook',
      'autoLockMinutes',
      'dailySpendLimitSats',
      'electrum',
      'explorerTxTemplate',
      'lockWhenPopupCloses',
      'network',
      'termsAccepted',
      'verifyWithSecondServer',
      'version',
    ]);
  });

  it('keeps valid address book entries and drops invalid', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const s = normalizeSettings({
      addressBook: [
        { label: 'Alice', address: id.address, network: 'mainnet' },
        { label: '', address: id.address, network: 'mainnet' },
        { label: 'Bad', address: 'not-an-address', network: 'mainnet' },
        { label: 'Wrong net', address: id.address, network: 'testnet' },
        { label: 'Dup', address: id.address, network: 'mainnet' },
      ],
      dailySpendLimitSats: 50_000,
    });
    expect(s.addressBook).toEqual([
      { label: 'Alice', address: id.address, network: 'mainnet' },
    ]);
    expect(s.dailySpendLimitSats).toBe(50_000);
  });

  it('strips non-wss URLs', () => {
    const s = normalizeSettings({
      electrum: {
        mainnet: {
          endpoints: [
            { kind: 'custom', url: 'ws://bad.example:50004' },
            { kind: 'custom', url: 'wss://good.example:50004' },
          ],
          activeUrl: null,
        },
        testnet: { endpoints: [], activeUrl: null },
      },
    });
    expect(resolveElectrumServers(s, 'mainnet')).toEqual([
      'wss://good.example:50004',
    ]);
  });

  it('restores mainnet build-time defaults when endpoints empty', () => {
    const s = normalizeSettings({
      electrum: {
        mainnet: { endpoints: [], activeUrl: null },
        testnet: { endpoints: [], activeUrl: null },
      },
    });
    expect(resolveElectrumServers(s, 'mainnet')).toEqual([...BUILTINS]);
  });
});

describe('testnet isolation', () => {
  it('never falls back to mainnet defaults', () => {
    const s = defaultSettings();
    s.network = 'testnet';
    expect(resolveElectrumServers(s)).toEqual([]);
    expect(() => getConnectCandidates(s)).toThrow(ElectrumUnconfiguredError);
  });

  it('uses only custom testnet endpoints', () => {
    let s = defaultSettings();
    s = addCustomEndpoint(s, 'testnet', 'wss://test.example:50004');
    expect(resolveElectrumServers(s, 'testnet')).toEqual([
      'wss://test.example:50004',
    ]);
    expect(getConnectCandidates(s, 'testnet')).toEqual([
      'wss://test.example:50004',
    ]);
  });
});

describe('endpoint mutations', () => {
  it('add / remove / reorder custom endpoints', () => {
    let s = defaultSettings();
    s = addCustomEndpoint(s, 'mainnet', 'wss://a.example:50004');
    s = addCustomEndpoint(s, 'mainnet', 'wss://b.example:50004');
    expect(s.electrum.mainnet.endpoints.map((e) => e.url)).toEqual([
      ...BUILTINS,
      'wss://a.example:50004',
      'wss://b.example:50004',
    ]);

    s = reorderEndpoint(s, 'mainnet', 'wss://b.example:50004', 'up');
    const urls = s.electrum.mainnet.endpoints.map((e) => e.url);
    const bIndex = urls.indexOf('wss://b.example:50004');
    const aIndex = urls.indexOf('wss://a.example:50004');
    expect(bIndex).toBeLessThan(aIndex);

    s = removeEndpoint(s, 'mainnet', 'wss://a.example:50004');
    expect(s.electrum.mainnet.endpoints.some((e) => e.url === 'wss://a.example:50004')).toBe(
      false
    );
  });

  it('rejects ws:// on add', () => {
    const s = defaultSettings();
    expect(() => addCustomEndpoint(s, 'mainnet', 'ws://x.example:50004')).toThrow(
      /wss:\/\//
    );
  });

  it('sticky activeUrl ordering', () => {
    let s = defaultSettings();
    s = setActiveUrl(s, 'mainnet', BUILTIN_B);
    expect(
      orderUrlsForConnect([...DEFAULT_ELECTRUM_MAINNET], s.electrum.mainnet.activeUrl)
    ).toEqual([BUILTIN_B, BUILTIN_A]);
  });
});

describe('publicElectrumView', () => {
  it('reports configured=false for empty testnet', () => {
    const view = publicElectrumView(defaultSettings(), 'testnet');
    expect(view.configured).toBe(false);
    expect(view.endpoints).toEqual([]);
  });
});

describe('address book + spend helpers', () => {
  it('add / remove address book entries', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    let s = defaultSettings();
    s = addAddressBookEntry(s, {
      label: 'Friend',
      address: id.address,
      network: 'mainnet',
    });
    expect(s.addressBook).toHaveLength(1);
    s = removeAddressBookEntry(s, 'mainnet', id.address);
    expect(s.addressBook).toHaveLength(0);
  });

  it('setDailySpendLimit null disables', () => {
    let s = setDailySpendLimit(defaultSettings(), 12_000);
    expect(s.dailySpendLimitSats).toBe(12_000);
    s = setDailySpendLimit(s, null);
    expect(s.dailySpendLimitSats).toBeNull();
    s = setDailySpendLimit(s, 0);
    expect(s.dailySpendLimitSats).toBeNull();
  });

  it('setVerifyWithSecondServer toggles', () => {
    let s = setVerifyWithSecondServer(defaultSettings(), false);
    expect(s.verifyWithSecondServer).toBe(false);
    s = setVerifyWithSecondServer(s, true);
    expect(s.verifyWithSecondServer).toBe(true);
  });

  it('isLargeSend uses half of confirmed balance', () => {
    expect(isLargeSend(50_001, 100_000)).toBe(true);
    expect(isLargeSend(50_000, 100_000)).toBe(false);
    expect(isLargeSend(1, 0)).toBe(false);
  });

  it('matchesAddressConfirmSuffix requires exact last 6', () => {
    const addr = 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59';
    expect(matchesAddressConfirmSuffix(addr, '25r59')).toBe(false);
    expect(matchesAddressConfirmSuffix(addr, 'g25r59')).toBe(true);
    expect(matchesAddressConfirmSuffix(addr, 'G25r59')).toBe(false);
  });
});
