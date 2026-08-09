/**
 * Operational privacy: strip host / URL / IP literals from strings that
 * may reach UI, status.error, or logs. Domain-only — no chrome.* APIs.
 */

const MAX_SAFE_MESSAGE_LEN = 120;

/** Scheme://… URLs (wss, ws, https, http). */
const URL_RE = /\b(?:wss?|https?):\/\/[^\s"'<>]+/gi;

/**
 * Dotted hostnames optionally followed by :port (e.g. electrum.example.com:50004).
 * Reserved / mock TLDs are still redacted when embedded in free-form error text —
 * callers should prefer typed ElectrumError messages that never include hosts.
 */
const HOST_PORT_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?\b/gi;

/** localhost with optional port (no dots — missed by HOST_PORT_RE). */
const LOCALHOST_RE = /\blocalhost(?::\d{1,5})?\b/gi;

/**
 * Single-label host:port (e.g. electrum:50001). Port is required to avoid
 * redacting ordinary English words like "error" / "failed".
 */
const SINGLE_LABEL_HOST_PORT_RE =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?:\d{1,5}\b/gi;

/** IPv4 literals, optionally with :port. */
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;

/**
 * Replace URL / host / IP literals with a stable placeholder.
 * Idempotent on already-redacted text.
 */
export function redactUrls(text: string): string {
  if (!text) return text;
  return text
    .replace(URL_RE, '[redacted]')
    .replace(HOST_PORT_RE, '[redacted]')
    .replace(IPV4_RE, '[redacted]')
    .replace(LOCALHOST_RE, '[redacted]')
    .replace(SINGLE_LABEL_HOST_PORT_RE, '[redacted]');
}

function clipSafe(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '[redacted]') return 'Unexpected error';
  return trimmed.length > MAX_SAFE_MESSAGE_LEN
    ? `${trimmed.slice(0, MAX_SAFE_MESSAGE_LEN)}…`
    : trimmed;
}

/**
 * Stable, host-free message for any thrown value.
 * Prefer typed domain errors (TxError / ElectrumError) when available.
 * Always run redactUrls — even on typed errors — so a mistakenly
 * host-bearing custom message cannot reach the UI.
 */
export function safeErrorMessage(err: unknown): string {
  // Duck-typing avoids import cycles with errors.ts / settings / permissions.
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string };
    if (
      e.name === 'TxError' ||
      e.name === 'ElectrumError' ||
      e.name === 'ElectrumUnconfiguredError' ||
      e.name === 'HostPermissionRequiredError'
    ) {
      if (typeof e.message !== 'string' || !e.message) {
        return 'Unexpected error';
      }
      return clipSafe(redactUrls(e.message));
    }
  }
  if (err instanceof Error) {
    return clipSafe(redactUrls(err.message));
  }
  return 'Unexpected error';
}

/** Sanitize an Electrum RPC error message (may contain host from server). */
export function sanitizeElectrumRpcMessage(raw: string | undefined): string {
  const base = (raw && raw.trim()) || 'Electrum error';
  const redacted = redactUrls(base).trim() || 'Electrum error';
  return redacted.length > MAX_SAFE_MESSAGE_LEN
    ? `${redacted.slice(0, MAX_SAFE_MESSAGE_LEN)}…`
    : redacted;
}
