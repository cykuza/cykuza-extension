/**
 * Unlock failure copy.
 * Wrong vault password and wrong BIP39 passphrase share one user-facing phrase
 * so unlock does not oracle which factor failed.
 */

/** Stable message shown after a failed unlock attempt (not lockout). */
export const UNLOCK_FAILED = 'Unlock failed';

export function unlockFailedWithAttempts(remaining: number): string {
  const n = Math.max(0, Math.floor(remaining));
  return `${UNLOCK_FAILED}. ${n} attempt${n === 1 ? '' : 's'} remaining.`;
}
