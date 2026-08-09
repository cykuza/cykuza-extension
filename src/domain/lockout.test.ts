import { describe, expect, it } from 'vitest';
import {
  checkLockout,
  clearLockout,
  defaultLockoutState,
  LOCKOUT_DURATION_MS,
  MAX_UNLOCK_ATTEMPTS,
  recordFailedAttempt,
  remainingAttempts,
} from './lockout';

describe('lockout', () => {
  const t0 = 1_700_000_000_000;

  it('allows attempts 1–4 without lockout', () => {
    let state = defaultLockoutState();
    for (let i = 1; i < MAX_UNLOCK_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, t0 + i);
      const check = checkLockout(state, t0 + i);
      expect(check.lockedOut).toBe(false);
      expect(state.failedAttempts).toBe(i);
      expect(remainingAttempts(state, t0 + i)).toBe(MAX_UNLOCK_ATTEMPTS - i);
    }
  });

  it('locks for 15 minutes on the 5th failure', () => {
    let state = defaultLockoutState();
    for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, t0);
    }
    const check = checkLockout(state, t0);
    expect(check.lockedOut).toBe(true);
    expect(check.remainingMs).toBe(LOCKOUT_DURATION_MS);
    expect(state.lockoutUntil).toBe(t0 + LOCKOUT_DURATION_MS);
    expect(remainingAttempts(state, t0)).toBe(0);
  });

  it('keeps lockout active until expiry', () => {
    let state = defaultLockoutState();
    for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, t0);
    }
    const mid = checkLockout(state, t0 + LOCKOUT_DURATION_MS - 1);
    expect(mid.lockedOut).toBe(true);

    const after = checkLockout(state, t0 + LOCKOUT_DURATION_MS);
    expect(after.lockedOut).toBe(false);
    expect(after.failedAttempts).toBe(0);
  });

  it('does not increment while locked out', () => {
    let state = defaultLockoutState();
    for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, t0);
    }
    const again = recordFailedAttempt(state, t0 + 1000);
    expect(again.failedAttempts).toBe(MAX_UNLOCK_ATTEMPTS);
    expect(again.lockoutUntil).toBe(state.lockoutUntil);
  });

  it('resets after successful clear', () => {
    let state = defaultLockoutState();
    state = recordFailedAttempt(state, t0);
    state = recordFailedAttempt(state, t0);
    expect(state.failedAttempts).toBe(2);
    state = clearLockout();
    expect(state).toEqual(defaultLockoutState());
    expect(remainingAttempts(state, t0)).toBe(MAX_UNLOCK_ATTEMPTS);
  });

  it('starts a fresh counter after expired lockout', () => {
    let state = defaultLockoutState();
    for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, t0);
    }
    const afterExpiry = t0 + LOCKOUT_DURATION_MS + 1;
    state = recordFailedAttempt(state, afterExpiry);
    expect(state.failedAttempts).toBe(1);
    expect(state.lockoutUntil).toBeNull();
  });
});
