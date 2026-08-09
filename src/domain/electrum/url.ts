/**
 * Strict wss:// URL validation for Electrum endpoints.
 * Rejects ws://, http(s)://, and non-origin forms.
 * Error messages never echo the input URL (operational privacy).
 */

export function parseWssUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Electrum URL is required');
  }
  if (trimmed.startsWith('ws://')) {
    throw new Error(
      'Use wss:// Electrum endpoints to avoid MITM. ws:// is rejected.'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid Electrum URL');
  }
  if (parsed.protocol !== 'wss:') {
    throw new Error('Electrum URL must be wss://');
  }
  if (!parsed.hostname) {
    throw new Error('Invalid Electrum URL');
  }
  // Normalize to origin form (no path/query/hash).
  const port = parsed.port ? `:${parsed.port}` : '';
  return `wss://${parsed.hostname}${port}`;
}
