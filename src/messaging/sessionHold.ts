/**
 * Popup ↔ SW Port for unlocked session lifetime (MV3 RAM identity).
 * Separate from chain watch — Electrum subscribe is optional; session hold is not.
 */

export const SESSION_HOLD_PORT = 'cykuza-session-hold' as const;

export type SessionHoldHandle = {
  stop: () => void;
};

export function connectSessionHold(): SessionHoldHandle {
  const port = chrome.runtime.connect({ name: SESSION_HOLD_PORT });
  return {
    stop: () => {
      try {
        port.disconnect();
      } catch {
        // ignore
      }
    },
  };
}
