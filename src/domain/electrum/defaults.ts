/**
 * Build-time Electrum mainnet defaults.
 *
 * Official wss:// hosts are injected via CYKUZA_ELECTRUM_MAINNET_URLS (comma-separated)
 * at build time — never hardcoded in source. Empty env → [] (custom wss:// only),
 * same model as testnet.
 *
 * Chrome match patterns use https:// (official schemes). wss:// is not a
 * valid host_permissions scheme; custom wss access is requested at runtime
 * via optional_host_permissions with exact https://host:port/* patterns.
 */

import { parseWssUrl } from './url';

/**
 * Parse comma-separated wss:// URLs from env / CI secrets.
 * Empty / whitespace-only → []. Invalid entries throw (fail the build loudly).
 */
export function parseElectrumMainnetUrls(
  raw: string | undefined | null
): string[] {
  if (raw == null || !String(raw).trim()) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const url = parseWssUrl(trimmed);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/** Build-time mainnet defaults (empty when env unset). */
export const DEFAULT_ELECTRUM_MAINNET: readonly string[] =
  parseElectrumMainnetUrls(
    // Injected by wxt.config / vitest `define` (string literal after build).
    import.meta.env.CYKUZA_ELECTRUM_MAINNET_URLS as string | undefined
  );

export function isDefaultElectrumUrl(url: string): boolean {
  return (DEFAULT_ELECTRUM_MAINNET as readonly string[]).includes(url);
}

/** Convert a wss:// Electrum URL into a Chrome host permission match pattern. */
export function toHostPermissionPattern(wssUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(wssUrl);
  } catch {
    throw new Error('Invalid Electrum URL');
  }
  if (parsed.protocol !== 'wss:') {
    throw new Error('Electrum URL must be wss://');
  }
  const port = parsed.port ? `:${parsed.port}` : '';
  return `https://${parsed.hostname}${port}/*`;
}

export function toHostPermissionPatterns(urls: readonly string[]): string[] {
  return urls.map(toHostPermissionPattern);
}

/**
 * Declared optional host permission scope. Runtime requests use exact
 * https://host:port/* patterns derived from custom wss:// URLs.
 */
export const OPTIONAL_HOST_PERMISSIONS = ['https://*/*'] as const;
