import { describe, expect, it } from 'vitest';
import {
  defaultDailySpendState,
  localDayKey,
  normalizeDailySpend,
  recordSpend,
  remainingSatsToday,
  usedSatsToday,
  wouldExceedLimit,
} from './dailySpend';

describe('dailySpend', () => {
  it('default state uses today with zero used', () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    const s = defaultDailySpendState(now);
    expect(s.dayKey).toBe(localDayKey(now));
    expect(s.usedSats).toBe(0);
  });

  it('null limit never exceeds', () => {
    const state = { dayKey: localDayKey(), usedSats: 1_000_000 };
    expect(wouldExceedLimit(null, state, 999_999_999)).toBe(false);
    expect(wouldExceedLimit(0, state, 1)).toBe(false);
    expect(remainingSatsToday(null, state)).toBeNull();
  });

  it('detects exceed against used + additional', () => {
    const now = Date.now();
    const state = { dayKey: localDayKey(now), usedSats: 80_000 };
    expect(wouldExceedLimit(100_000, state, 10_000, now)).toBe(false);
    expect(wouldExceedLimit(100_000, state, 20_001, now)).toBe(true);
    expect(wouldExceedLimit(100_000, state, 20_000, now)).toBe(false);
    expect(remainingSatsToday(100_000, state, now)).toBe(20_000);
  });

  it('day rollover resets used', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const stale = {
      dayKey: localDayKey(yesterday.getTime()),
      usedSats: 50_000,
    };
    const now = Date.now();
    expect(usedSatsToday(stale, now)).toBe(0);
    expect(wouldExceedLimit(10_000, stale, 5_000, now)).toBe(false);
    const recorded = recordSpend(stale, 7_000, now);
    expect(recorded.dayKey).toBe(localDayKey(now));
    expect(recorded.usedSats).toBe(7_000);
  });

  it('recordSpend accumulates on same day', () => {
    const now = Date.now();
    let state = defaultDailySpendState(now);
    state = recordSpend(state, 1_000, now);
    state = recordSpend(state, 2_500, now);
    expect(state.usedSats).toBe(3_500);
  });

  it('normalizeDailySpend strips invalid blobs', () => {
    expect(normalizeDailySpend(null).usedSats).toBe(0);
    expect(normalizeDailySpend({ dayKey: 'nope', usedSats: -1 }).usedSats).toBe(
      0
    );
    const now = Date.now();
    const ok = normalizeDailySpend(
      { dayKey: localDayKey(now), usedSats: 42.9 },
      now
    );
    expect(ok.usedSats).toBe(42);
  });
});
