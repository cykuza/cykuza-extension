/**
 * Popup Port that keeps the MV3 service worker alive while the vault is unlocked.
 * Distinct from Electrum watch (chain subscribe) — this Port is session lifetime.
 */

let holdPort: chrome.runtime.Port | null = null;

export function bindSessionHoldPort(port: chrome.runtime.Port): void {
  if (holdPort && holdPort !== port) {
    try {
      holdPort.disconnect();
    } catch {
      // ignore
    }
  }
  holdPort = port;
  port.onDisconnect.addListener(() => {
    if (holdPort === port) holdPort = null;
  });
}

export function releaseSessionHold(): void {
  if (!holdPort) return;
  const port = holdPort;
  holdPort = null;
  try {
    port.disconnect();
  } catch {
    // ignore
  }
}
