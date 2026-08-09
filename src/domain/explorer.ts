/**
 * Optional user-configured block-explorer tx URL template.
 * No built-in hosts — empty by default; never hardcode production explorers.
 */

const TXID_PLACEHOLDER = '{txid}';
const TXID_PROBE = '0000000000000000000000000000000000000000000000000000000000000000';
const TXID_HEX_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Normalize and validate an explorer tx template.
 * Requires https://, exactly one `{txid}` placeholder, no userinfo.
 *
 * Uses a hex probe in place of `{txid}` before `new URL()` so the braces are
 * not percent-encoded away.
 */
export function parseExplorerTxTemplate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Explorer URL is empty.');
  }
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    throw new Error('Explorer URL scheme is not allowed.');
  }
  if (!trimmed.startsWith('https://')) {
    throw new Error('Explorer URL must start with https://');
  }

  const count = trimmed.split(TXID_PLACEHOLDER).length - 1;
  if (count !== 1) {
    throw new Error('Explorer URL must contain exactly one {txid} placeholder.');
  }

  const probeUrl = trimmed.replace(TXID_PLACEHOLDER, TXID_PROBE);
  let parsed: URL;
  try {
    parsed = new URL(probeUrl);
  } catch {
    throw new Error('Invalid explorer URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Explorer URL must use https://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Explorer URL must not include credentials.');
  }

  // Restore the placeholder after URL normalization (origin / path cleanup).
  if (!parsed.href.includes(TXID_PROBE)) {
    throw new Error('Invalid explorer URL.');
  }
  return parsed.href.replace(TXID_PROBE, TXID_PLACEHOLDER);
}

/**
 * Build a concrete explorer URL for a txid, or null if template/txid invalid.
 */
export function buildExplorerTxUrl(
  template: string | null | undefined,
  txid: string
): string | null {
  if (!template) return null;
  if (!TXID_HEX_RE.test(txid)) return null;
  try {
    const normalized = parseExplorerTxTemplate(template);
    return normalized.replace(TXID_PLACEHOLDER, encodeURIComponent(txid));
  } catch {
    return null;
  }
}
