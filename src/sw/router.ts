import { parseWalletRequest, WalletResponseSchema } from '../messaging/protocol';
import { SESSION_HOLD_PORT } from '../messaging/sessionHold';
import { CHAIN_WATCH_PORT } from '../messaging/watchProtocol';
import { bindWatchPort } from './electrumWatch';
import { applyAutoLockAlarm, handleWalletRequest } from './session';
import { bindSessionHoldPort } from './sessionHold';
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
 * Popup Ports: session hold (unlocked RAM) and Electrum watch (chain).
 */
export function registerPortHandlers(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== chrome.runtime.id) {
      try {
        port.disconnect();
      } catch {
        // ignore
      }
      return;
    }
    if (port.name === CHAIN_WATCH_PORT) {
      bindWatchPort(port);
      return;
    }
    if (port.name === SESSION_HOLD_PORT) {
      bindSessionHoldPort(port);
    }
  });
}

/**
 * Auto-lock: wipe in-memory identity when the alarm fires.
 * `applyAutoLockAlarm` enforces idle-lock policy.
 */
export function registerAlarmHandlers(): void {
  onAlarm((alarm) => {
    if (alarm.name === AUTO_LOCK_ALARM) {
      void applyAutoLockAlarm();
    }
  });
}
