import { describe, expect, it } from 'vitest';
import {
  assessElectrumTrust,
  assertElectrumTrustAllowsChainOps,
  electrumTrustBlocksChainOps,
  electrumTrustMessage,
  ElectrumTrustBlockedError,
} from './electrumTrust';

describe('assessElectrumTrust', () => {
  it('returns unconfigured / single / verified / verify_off / degraded', () => {
    expect(
      assessElectrumTrust({
        configuredCount: 0,
        permittedCount: 0,
        verifyEnabled: true,
      })
    ).toBe('unconfigured');
    expect(
      assessElectrumTrust({
        configuredCount: 1,
        permittedCount: 1,
        verifyEnabled: false,
      })
    ).toBe('single');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 2,
        verifyEnabled: true,
      })
    ).toBe('verified');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 2,
        verifyEnabled: false,
      })
    ).toBe('verify_off');
    expect(
      assessElectrumTrust({
        configuredCount: 2,
        permittedCount: 1,
        verifyEnabled: true,
      })
    ).toBe('degraded');
  });
});

describe('electrumTrustBlocksChainOps', () => {
  it('blocks degraded and verify_off only', () => {
    expect(electrumTrustBlocksChainOps('degraded')).toBe(true);
    expect(electrumTrustBlocksChainOps('verify_off')).toBe(true);
    expect(electrumTrustBlocksChainOps('verified')).toBe(false);
    expect(electrumTrustBlocksChainOps('single')).toBe(false);
    expect(electrumTrustBlocksChainOps('unconfigured')).toBe(false);
  });
});

describe('assertElectrumTrustAllowsChainOps', () => {
  it('throws ElectrumTrustBlockedError with host-free message', () => {
    expect(() => assertElectrumTrustAllowsChainOps('degraded')).toThrow(
      ElectrumTrustBlockedError
    );
    expect(electrumTrustMessage('degraded')).toMatch(/permitted/i);
    expect(electrumTrustMessage('verify_off')).toMatch(/Verify with second server/);
  });
});
