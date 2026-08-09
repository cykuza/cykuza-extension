export const MAX_UNLOCK_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutState {
  failedAttempts: number;
  /** Epoch ms when lockout ends; null if not locked out. */
  lockoutUntil: number | null;
}

export function defaultLockoutState(): LockoutState {
  return { failedAttempts: 0, lockoutUntil: null };
}

export interface LockoutCheck {
  lockedOut: boolean;
  remainingMs: number;
  failedAttempts: number;
}

/** Pure check against current clock. Expired lockouts appear unlocked. */
export function checkLockout(
  state: LockoutState,
  now: number = Date.now()
): LockoutCheck {
  if (state.lockoutUntil !== null && now < state.lockoutUntil) {
    return {
      lockedOut: true,
      remainingMs: state.lockoutUntil - now,
      failedAttempts: state.failedAttempts,
    };
  }
  // Expired lockout: treat as clear for the check view.
  if (state.lockoutUntil !== null && now >= state.lockoutUntil) {
    return {
      lockedOut: false,
      remainingMs: 0,
      failedAttempts: 0,
    };
  }
  return {
    lockedOut: false,
    remainingMs: 0,
    failedAttempts: state.failedAttempts,
  };
}

/**
 * Record a failed unlock attempt.
 * Clears expired lockout first, then increments; at MAX attempts starts a new lockout.
 */
export function recordFailedAttempt(
  state: LockoutState,
  now: number = Date.now()
): LockoutState {
  const check = checkLockout(state, now);
  if (check.lockedOut) {
    return {
      failedAttempts: state.failedAttempts,
      lockoutUntil: state.lockoutUntil,
    };
  }

  // Start fresh after an expired lockout.
  const baseAttempts =
    state.lockoutUntil !== null && now >= state.lockoutUntil
      ? 0
      : state.failedAttempts;
  const failedAttempts = baseAttempts + 1;

  if (failedAttempts >= MAX_UNLOCK_ATTEMPTS) {
    return {
      failedAttempts,
      lockoutUntil: now + LOCKOUT_DURATION_MS,
    };
  }
  return { failedAttempts, lockoutUntil: null };
}

export function clearLockout(): LockoutState {
  return defaultLockoutState();
}

/** Remaining attempts before lockout (0 if already locked out). */
export function remainingAttempts(
  state: LockoutState,
  now: number = Date.now()
): number {
  const check = checkLockout(state, now);
  if (check.lockedOut) return 0;
  return Math.max(0, MAX_UNLOCK_ATTEMPTS - check.failedAttempts);
}
