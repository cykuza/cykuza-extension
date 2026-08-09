import { DEFAULT_AUTO_LOCK_MINUTES } from '../domain/settings';

/** Auto-lock alarm name. Delay comes from wallet settings. */
export const AUTO_LOCK_ALARM = 'cykuza-auto-lock';
export const AUTO_LOCK_MINUTES = DEFAULT_AUTO_LOCK_MINUTES;

export function clearAutoLockAlarm(): void {
  void chrome.alarms.clear(AUTO_LOCK_ALARM);
}

export function scheduleAutoLockAlarm(
  delayMinutes: number = AUTO_LOCK_MINUTES
): void {
  const minutes = Math.max(1, delayMinutes);
  void chrome.alarms.clear(AUTO_LOCK_ALARM);
  void chrome.alarms.create(AUTO_LOCK_ALARM, {
    delayInMinutes: minutes,
  });
}

export function onAlarm(
  listener: (alarm: chrome.alarms.Alarm) => void
): void {
  chrome.alarms.onAlarm.addListener(listener);
}
