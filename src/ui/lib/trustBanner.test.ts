import { describe, expect, it } from 'vitest';
import { BUILTIN_ELECTRUM_RISK_MESSAGE } from '../../domain/electrum/selfHost';
import { trustBanner, usesBuiltinElectrum } from './trustBanner';

describe('usesBuiltinElectrum', () => {
  it('is true for active builtin serverKind', () => {
    expect(
      usesBuiltinElectrum({
        serverKind: 'builtin',
        electrum: {
          network: 'mainnet',
          endpoints: [],
          activeUrl: null,
          configured: true,
        },
      })
    ).toBe(true);
  });

  it('is true when a default endpoint is listed', () => {
    expect(
      usesBuiltinElectrum({
        serverKind: 'custom',
        electrum: {
          network: 'mainnet',
          endpoints: [
            { kind: 'default', url: 'wss://a.example:50004' },
            { kind: 'custom', url: 'wss://b.example:50004' },
          ],
          activeUrl: 'wss://b.example:50004',
          configured: true,
        },
      })
    ).toBe(true);
  });

  it('is false for custom-only', () => {
    expect(
      usesBuiltinElectrum({
        serverKind: 'custom',
        electrum: {
          network: 'mainnet',
          endpoints: [{ kind: 'custom', url: 'wss://b.example:50004' }],
          activeUrl: 'wss://b.example:50004',
          configured: true,
        },
      })
    ).toBe(false);
  });
});

describe('trustBanner', () => {
  it('offers self-host guide when unconfigured', () => {
    const banner = trustBanner({
      serverStatus: 'unconfigured',
      network: 'mainnet',
      electrumTrust: 'unconfigured',
    });
    expect(banner?.tone).toBe('danger');
    expect(banner?.offerSelfHostGuide).toBe(true);
  });

  it('offers self-host guide for single-server warn', () => {
    const banner = trustBanner({
      serverStatus: 'idle',
      network: 'mainnet',
      electrumTrust: 'single',
      serverKind: 'builtin',
    });
    expect(banner?.tone).toBe('warn');
    expect(banner?.offerSelfHostGuide).toBe(true);
  });

  it('warns about shared builtins when dual-verify is otherwise fine', () => {
    const banner = trustBanner({
      serverStatus: 'idle',
      network: 'mainnet',
      electrumTrust: 'verified',
      serverKind: 'builtin',
      electrum: {
        network: 'mainnet',
        endpoints: [
          { kind: 'default', url: 'wss://a.example:50004' },
          { kind: 'default', url: 'wss://b.example:50004' },
        ],
        activeUrl: 'wss://a.example:50004',
        configured: true,
      },
    });
    expect(banner).toEqual({
      tone: 'warn',
      message: BUILTIN_ELECTRUM_RISK_MESSAGE,
      offerSelfHostGuide: true,
    });
  });

  it('stays quiet for custom-only verified setups', () => {
    expect(
      trustBanner({
        serverStatus: 'idle',
        network: 'mainnet',
        electrumTrust: 'verified',
        serverKind: 'custom',
        electrum: {
          network: 'mainnet',
          endpoints: [
            { kind: 'custom', url: 'wss://a.example:50004' },
            { kind: 'custom', url: 'wss://b.example:50004' },
          ],
          activeUrl: 'wss://a.example:50004',
          configured: true,
        },
      })
    ).toBeNull();
  });
});
