import type { WalletStatus } from '../../messaging/protocol';
import {
  BUILTIN_ELECTRUM_RISK_MESSAGE,
} from '../../domain/electrum/selfHost';

export type TrustBanner = {
  tone: 'warn' | 'danger';
  message: string;
  /** When true, UI offers the packaged self-host Electrum guide. */
  offerSelfHostGuide?: boolean;
};

type TrustStatus = Pick<
  WalletStatus,
  'serverStatus' | 'electrumTrust' | 'network' | 'serverKind' | 'electrum'
>;

/** True when build-time default Electrum hosts are in use or listed. */
export function usesBuiltinElectrum(status: TrustStatus): boolean {
  if (status.serverKind === 'builtin') return true;
  return (status.electrum?.endpoints ?? []).some((e) => e.kind === 'default');
}

/**
 * Trust / Electrum advisory for Home and Send.
 * Blocking levels first; then a soft warn when shared built-in defaults apply.
 */
export function trustBanner(status: TrustStatus): TrustBanner | null {
  if (status.serverStatus === 'unconfigured') {
    return {
      tone: 'danger',
      message:
        status.network === 'testnet'
          ? 'Testnet has no official Electrum servers. Open Settings and add a custom wss:// endpoint.'
          : 'No Electrum endpoints configured. Open Settings and add a custom wss:// endpoint.',
      offerSelfHostGuide: true,
    };
  }
  if (status.electrumTrust === 'verify_off') {
    return {
      tone: 'danger',
      message:
        'Dual-server verify is required when two or more Electrum endpoints are configured. Enable it in Settings before Refresh or Send.',
    };
  }
  if (status.electrumTrust === 'degraded') {
    return {
      tone: 'danger',
      message:
        'Dual-server verify needs two permitted Electrum hosts. Grant access in Settings before Refresh or Send.',
    };
  }
  if (status.electrumTrust === 'single') {
    return {
      tone: 'warn',
      message:
        'Only one Electrum endpoint is configured. The server can see your addresses and may lie about balances — add a second host and enable verify for stronger protection.',
      offerSelfHostGuide: true,
    };
  }
  if (usesBuiltinElectrum(status)) {
    return {
      tone: 'warn',
      message: BUILTIN_ELECTRUM_RISK_MESSAGE,
      offerSelfHostGuide: true,
    };
  }
  return null;
}
