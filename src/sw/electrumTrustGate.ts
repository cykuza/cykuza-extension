/**
 * SW gate: resolve Electrum trust for the active network and fail closed
 * before refresh / preview / broadcast when policy blocks chain ops.
 */

import {
  assertElectrumTrustAllowsChainOps,
  assessElectrumTrust,
  type ElectrumTrustLevel,
} from '../domain/electrumTrust';
import {
  resolveElectrumServers,
  type WalletSettings,
} from '../domain/settings';
import { filterPermittedUrls } from '../platform/permissions';

export async function resolveElectrumTrustLevel(
  settings: WalletSettings
): Promise<ElectrumTrustLevel> {
  const configured = resolveElectrumServers(settings);
  const permitted = await filterPermittedUrls(configured);
  return assessElectrumTrust({
    configuredCount: configured.length,
    permittedCount: permitted.length,
    verifyEnabled: settings.verifyWithSecondServer === true,
  });
}

/** Throws ElectrumTrustBlockedError when degraded or verify_off. */
export async function requireElectrumTrustForChainOps(
  settings: WalletSettings
): Promise<ElectrumTrustLevel> {
  const level = await resolveElectrumTrustLevel(settings);
  assertElectrumTrustAllowsChainOps(level);
  return level;
}
