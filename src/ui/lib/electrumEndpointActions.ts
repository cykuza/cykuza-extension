/**
 * Post-grant Electrum endpoint actions (UI → walletRpc).
 * Permission request() lives only on the electrum-grant page;
 * these helpers assume the origin is already permitted (or built-in).
 */

import { walletRpc } from '../../messaging/client';
import { releaseHostPermission } from '../../platform/permissions';

export type AddCustomElectrumResult =
  | { ok: true; alreadyListed: true }
  | { ok: true; alreadyListed: false }
  | { ok: false; error: string };

export type TestElectrumResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

/** Append a custom endpoint when the host grant already exists. */
export async function addCustomElectrumEndpoint(
  url: string
): Promise<AddCustomElectrumResult> {
  const statusRes = await walletRpc({ type: 'getStatus' });
  if (!statusRes.ok) return { ok: false, error: statusRes.error };
  if (statusRes.status.locked) {
    return { ok: false, error: 'Unlock the wallet, then try Add again.' };
  }

  const existing = statusRes.status.electrum?.endpoints ?? [];
  if (existing.some((e) => e.url === url)) {
    return { ok: true, alreadyListed: true };
  }

  const res = await walletRpc({
    type: 'setElectrumConfig',
    network: statusRes.status.network,
    endpoints: [...existing, { kind: 'custom', url }],
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, alreadyListed: false };
}

/**
 * Probe an Electrum endpoint that is already permitted.
 * Releases a temporary grant when the URL is not in the saved list.
 */
export async function testElectrumEndpoint(
  url: string
): Promise<TestElectrumResult> {
  const statusRes = await walletRpc({ type: 'getStatus' });
  if (!statusRes.ok) return { ok: false, error: statusRes.error };

  const listed = (statusRes.status.electrum?.endpoints ?? []).some(
    (e) => e.url === url
  );
  const temporary = !listed;

  try {
    const res = await walletRpc({ type: 'testElectrum', url });
    if (!res.ok) return { ok: false, error: res.error };
    const ver = res.probe?.version?.[1] ?? res.probe?.version?.join(' / ');
    return {
      ok: true,
      detail: ver ? `Connection OK (protocol ${ver})` : 'Connection OK',
    };
  } finally {
    if (temporary) {
      await releaseHostPermission(url);
    }
  }
}
