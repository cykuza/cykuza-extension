/**
 * Session teardown: stop UI Ports, then wipe RAM.
 * Lives outside state.ts so electrumWatch can import sessionRam without a cycle.
 */

import { idleAutoLockApplies } from '../../domain/settings';
import { clearAutoLockAlarm } from '../../platform/alarms';
import { readSettings } from '../../platform/storage';
import { stopWatch } from '../electrumWatch';
import { releaseSessionHold } from '../sessionHold';
import { wipeSessionRam } from './state';

/**
 * Wipe in-memory identity and clear auto-lock alarm.
 * Does not touch persisted vault/settings.
 */
export async function teardownSession(): Promise<void> {
  stopWatch({ disconnectPort: true });
  releaseSessionHold();
  clearAutoLockAlarm();
  wipeSessionRam();
}

/** Alarm path: same idle-lock policy as `armAutoLock`. */
export async function applyAutoLockAlarm(): Promise<void> {
  const settings = await readSettings();
  if (!idleAutoLockApplies(settings)) return;
  await teardownSession();
}
