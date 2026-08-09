/**
 * Session teardown: stop UI-scoped Electrum watch, then wipe RAM.
 * Lives outside state.ts so electrumWatch can import sessionRam without a cycle.
 */

import { clearAutoLockAlarm } from '../../platform/alarms';
import { stopWatch } from '../electrumWatch';
import { wipeSessionRam } from './state';

/**
 * Wipe in-memory identity and clear auto-lock alarm.
 * Does not touch persisted vault/settings.
 */
export async function teardownSession(): Promise<void> {
  stopWatch({ disconnectPort: true });
  clearAutoLockAlarm();
  wipeSessionRam();
}
