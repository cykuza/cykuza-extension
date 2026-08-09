/**
 * Electrum server-trust policy.
 *
 * Dual-server verify is mandatory when ≥2 endpoints are configured.
 * Chain ops (refresh / preview / broadcast) fail closed when trust is
 * degraded or verify was turned off while multi-server.
 * Single-endpoint setups remain allowed (inherent hot-wallet Electrum trust).
 */

export const ELECTRUM_TRUST_LEVELS = [
  'unconfigured',
  'single',
  'verified',
  'verify_off',
  'degraded',
] as const;

export type ElectrumTrustLevel = (typeof ELECTRUM_TRUST_LEVELS)[number];

export interface ElectrumTrustInput {
  /** Endpoints listed in settings for the active network. */
  configuredCount: number;
  /** Endpoints that currently have host permission. */
  permittedCount: number;
  /** User setting: verifyWithSecondServer. */
  verifyEnabled: boolean;
}

/** Pure assessment — no I/O. */
export function assessElectrumTrust(input: ElectrumTrustInput): ElectrumTrustLevel {
  const configured = Math.max(0, Math.floor(input.configuredCount));
  const permitted = Math.max(0, Math.floor(input.permittedCount));

  if (configured === 0) return 'unconfigured';
  if (configured < 2) return 'single';

  if (!input.verifyEnabled) return 'verify_off';
  if (permitted < 2) return 'degraded';
  return 'verified';
}

/** Refresh / preview / send must not proceed. */
export function electrumTrustBlocksChainOps(level: ElectrumTrustLevel): boolean {
  return level === 'degraded' || level === 'verify_off';
}

/** Host-free UI / status.error phrases. */
export function electrumTrustMessage(level: ElectrumTrustLevel): string | undefined {
  switch (level) {
    case 'degraded':
      return 'Dual-server verify needs two permitted Electrum hosts. Grant access in Settings.';
    case 'verify_off':
      return 'Turn on “Verify with second server” — required when two or more Electrum endpoints are configured.';
    case 'unconfigured':
      return undefined; // ElectrumUnconfiguredError owns this copy
    case 'single':
    case 'verified':
      return undefined;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export class ElectrumTrustBlockedError extends Error {
  readonly level: ElectrumTrustLevel;
  readonly code = 'electrum_trust_blocked' as const;

  constructor(level: ElectrumTrustLevel) {
    const message =
      electrumTrustMessage(level) ?? 'Electrum trust policy blocked this action';
    super(message);
    this.name = 'ElectrumTrustBlockedError';
    this.level = level;
  }
}

export function assertElectrumTrustAllowsChainOps(level: ElectrumTrustLevel): void {
  if (electrumTrustBlocksChainOps(level)) {
    throw new ElectrumTrustBlockedError(level);
  }
}
