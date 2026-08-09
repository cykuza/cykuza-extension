import { parseWalletRequest, WalletResponseSchema } from '../messaging/protocol';
import { CHAIN_WATCH_PORT } from '../messaging/watchProtocol';
import { bindWatchPort } from './electrumWatch';
import { handleWalletRequest, teardownSession } from './session';
import { AUTO_LOCK_ALARM, onAlarm } from '../platform/alarms';

function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

/**
 * Wire chrome.runtime.onMessage with sender check + Zod request/response.
 */
export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isTrustedSender(sender)) {
      sendResponse({ ok: false, error: 'Untrusted sender' });
      return false;
    }

    const parsed = parseWalletRequest(message);
    if (!parsed.success) {
      sendResponse({ ok: false, error: parsed.error });
      return false;
    }

    void handleWalletRequest(parsed.data)
      .then((response) => {
        const checked = WalletResponseSchema.safeParse(response);
        if (!checked.success) {
          sendResponse({ ok: false, error: 'Invalid response' });
          return;
        }
        sendResponse(checked.data);
      })
      .catch(() => {
        // Always close the async channel — a silent rejection leaves the
        // popup hung on "Loading…" forever.
        sendResponse({ ok: false, error: 'Request failed' });
      });

    // Keep the message channel open for async response.
    return true;
  });
}

/**
 * UI-scoped Electrum watch: popup connects a named Port; SW holds
 * scripthash.subscribe until the Port disconnects or the vault locks.
 */
export function registerWatchPort(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== CHAIN_WATCH_PORT) return;
    if (port.sender?.id !== chrome.runtime.id) {
      try {
        port.disconnect();
      } catch {
        // ignore
      }
      return;
    }
    bindWatchPort(port);
  });
}

/**
 * Auto-lock: wipe in-memory identity when the alarm fires.
 */
export function registerAlarmHandlers(): void {
  onAlarm((alarm) => {
    if (alarm.name === AUTO_LOCK_ALARM) {
      void teardownSession();
    }
  });
}
