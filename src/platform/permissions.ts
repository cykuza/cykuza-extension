/**
 * Host permission helpers for custom Electrum servers.
 *
 * Ownership contract (MV3):
 * - electrum-grant page: sole chrome.permissions.request() caller (user gesture)
 * - Popup Network: contains() only; if missing → open grant tab; if present → RPC
 * - Service worker: contains / remove only — NEVER request()
 *
 * Built-in mainnet defaults use install-time host_permissions (no prompt).
 */

import {
  isDefaultElectrumUrl,
  toHostPermissionPattern,
} from '../domain/electrum/defaults';
import { parseWssUrl } from '../domain/electrum/url';

/** Thrown when SW needs a host grant that has not been obtained yet. */
export class HostPermissionRequiredError extends Error {
  readonly code = 'host_permission_required' as const;

  constructor(
    message = 'Allow this Electrum host from the Cykuza grant tab first.'
  ) {
    super(message);
    this.name = 'HostPermissionRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Grant-page APIs (must run as the first await inside a user-gesture click)
// ---------------------------------------------------------------------------

/**
 * Request exact origin access for a custom wss:// Electrum URL.
 * Call only from the electrum-grant page Continue click (first await).
 * Built-in defaults always succeed without prompting.
 *
 * Intentionally skips a contains() pre-check: an extra await before
 * chrome.permissions.request would drop the MV3 user gesture.
 */
export async function requestHostPermission(wssUrl: string): Promise<boolean> {
  const normalized = parseWssUrl(wssUrl);
  if (isDefaultElectrumUrl(normalized)) return true;
  const origins = [toHostPermissionPattern(normalized)];
  return chrome.permissions.request({ origins });
}

/**
 * Drop a host permission for a custom origin (e.g. temporary grant after Test).
 * remove() does not require a user gesture. Built-in defaults are never removed.
 */
export async function releaseHostPermission(wssUrl: string): Promise<void> {
  let normalized: string;
  try {
    normalized = parseWssUrl(wssUrl);
  } catch {
    return;
  }
  if (isDefaultElectrumUrl(normalized)) return;
  try {
    await chrome.permissions.remove({
      origins: [toHostPermissionPattern(normalized)],
    });
  } catch {
    // Best-effort remove — permission may already be absent.
  }
}

// ---------------------------------------------------------------------------
// Shared / SW-safe APIs (contains + remove only — never request)
// ---------------------------------------------------------------------------

export async function hasHostPermission(wssUrl: string): Promise<boolean> {
  const normalized = parseWssUrl(wssUrl);
  if (isDefaultElectrumUrl(normalized)) return true;
  const origins = [toHostPermissionPattern(normalized)];
  return chrome.permissions.contains({ origins });
}

/**
 * Assert an existing host grant. SW-safe (contains only).
 * Throws HostPermissionRequiredError without embedding the hostname.
 */
export async function assertHostPermission(wssUrl: string): Promise<void> {
  const ok = await hasHostPermission(wssUrl);
  if (!ok) {
    throw new HostPermissionRequiredError();
  }
}

/**
 * Keep URLs that already have a host grant (or are built-in defaults).
 * Preserves input order. Ungranted custom origins are silently dropped.
 * SW-safe — never calls request().
 */
export async function filterPermittedUrls(
  urls: readonly string[]
): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (await hasHostPermission(url)) {
      out.push(url);
    }
  }
  return out;
}

/**
 * Remove host permission for a custom origin if no remaining URL still needs it.
 * `stillNeededUrls` should be all remaining custom (and default) wss URLs in settings.
 * remove() does not require a user gesture.
 */
export async function releaseHostPermissionIfUnused(
  wssUrl: string,
  stillNeededUrls: readonly string[]
): Promise<void> {
  let normalized: string;
  try {
    normalized = parseWssUrl(wssUrl);
  } catch {
    return;
  }
  if (isDefaultElectrumUrl(normalized)) return;

  const pattern = toHostPermissionPattern(normalized);
  const stillNeeded = stillNeededUrls.some((u) => {
    try {
      const other = parseWssUrl(u);
      if (isDefaultElectrumUrl(other)) return false;
      return toHostPermissionPattern(other) === pattern;
    } catch {
      return false;
    }
  });
  if (stillNeeded) return;

  try {
    await chrome.permissions.remove({ origins: [pattern] });
  } catch {
    // Best-effort remove — permission may already be absent.
  }
}
