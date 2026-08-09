/**
 * Full-tab Electrum host-permission flow (custom wss:// only).
 * Chrome’s system dialog cannot be themed; this page owns the UX around it.
 */

export type ElectrumGrantAction = 'add' | 'test';

export type ElectrumGrantParams = {
  action: ElectrumGrantAction;
  url: string;
};

/** Packaged page path (WXT entrypoints/electrum-grant → electrum-grant.html). */
export const ELECTRUM_GRANT_PAGE = 'electrum-grant.html';

export function isElectrumGrantAction(
  value: string
): value is ElectrumGrantAction {
  return value === 'add' || value === 'test';
}

/** Host:port label for grant UI (user must see what Chrome will ask about). */
export function electrumGrantHostLabel(wssUrl: string): string {
  try {
    const u = new URL(wssUrl);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return 'unknown host';
  }
}

export function parseElectrumGrantSearch(
  search: string
): ElectrumGrantParams | null {
  const q = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  const action = q.get('action') ?? '';
  const url = q.get('url') ?? '';
  if (!isElectrumGrantAction(action) || !url.trim()) return null;
  return { action, url: url.trim() };
}

export function buildElectrumGrantSearch(
  params: ElectrumGrantParams
): string {
  const q = new URLSearchParams({
    action: params.action,
    url: params.url,
  });
  return `?${q.toString()}`;
}
