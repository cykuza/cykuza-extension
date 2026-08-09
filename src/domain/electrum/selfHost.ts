/**
 * Shared Electrum risk copy and packaged self-host guide.
 *
 * Built-in defaults (when injected at build time) are convenience only —
 * never treated as a privacy or honesty guarantee.
 */

/** Packaged page under `public/` (opened via chrome.runtime.getURL). */
export const SELF_HOST_ELECTRUM_GUIDE = 'self-host-electrum.html';

/** Short advisory when the wallet is using build-time default Electrum hosts. */
export const BUILTIN_ELECTRUM_RISK_MESSAGE =
  'Built-in Electrum servers are shared for convenience. They can see addresses you query and may lie about balances, history, or fees.';

/** CTA label paired with BUILTIN_ELECTRUM_RISK_MESSAGE / trust banners. */
export const SELF_HOST_ELECTRUM_CTA = 'Set up your own Electrum server';
