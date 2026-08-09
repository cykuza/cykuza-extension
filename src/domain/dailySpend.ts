/**
 * Local daily spend tracking for optional SW-enforced limits.
 * Not telemetry — day key + sats only, on-device.
 */

export interface DailySpendState {
  /** Local calendar day as YYYY-MM-DD. */
  dayKey: string;
  usedSats: number;
}

export function defaultDailySpendState(now: number = Date.now()): DailySpendState {
  return { dayKey: localDayKey(now), usedSats: 0 };
}

/** Local calendar day key (not UTC) so “daily” matches user timezone. */
export function localDayKey(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeDailySpend(
  raw: unknown,
  now: number = Date.now()
): DailySpendState {
  const today = localDayKey(now);
  if (!raw || typeof raw !== 'object') {
    return { dayKey: today, usedSats: 0 };
  }
  const obj = raw as { dayKey?: unknown; usedSats?: unknown };
  const dayKey =
    typeof obj.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dayKey)
      ? obj.dayKey
      : today;
  const usedSats =
    typeof obj.usedSats === 'number' &&
    Number.isFinite(obj.usedSats) &&
    obj.usedSats >= 0
      ? Math.floor(obj.usedSats)
      : 0;

  if (dayKey !== today) {
    return { dayKey: today, usedSats: 0 };
  }
  return { dayKey, usedSats };
}

/** Used sats for the current local day (0 after rollover). */
export function usedSatsToday(
  state: DailySpendState,
  now: number = Date.now()
): number {
  return normalizeDailySpend(state, now).usedSats;
}

/**
 * Whether adding `additionalSats` would exceed an optional limit.
 * `limitSats === null` means disabled — never exceeds.
 */
export function wouldExceedLimit(
  limitSats: number | null,
  state: DailySpendState,
  additionalSats: number,
  now: number = Date.now()
): boolean {
  if (limitSats === null || limitSats <= 0) return false;
  const used = usedSatsToday(state, now);
  const add =
    typeof additionalSats === 'number' &&
    Number.isFinite(additionalSats) &&
    additionalSats > 0
      ? Math.floor(additionalSats)
      : 0;
  return used + add > limitSats;
}

/** Remaining sats under the limit for today; null when limit disabled. */
export function remainingSatsToday(
  limitSats: number | null,
  state: DailySpendState,
  now: number = Date.now()
): number | null {
  if (limitSats === null || limitSats <= 0) return null;
  const used = usedSatsToday(state, now);
  return Math.max(0, limitSats - used);
}

export function recordSpend(
  state: DailySpendState,
  amountSats: number,
  now: number = Date.now()
): DailySpendState {
  const current = normalizeDailySpend(state, now);
  const add =
    typeof amountSats === 'number' &&
    Number.isFinite(amountSats) &&
    amountSats > 0
      ? Math.floor(amountSats)
      : 0;
  return {
    dayKey: current.dayKey,
    usedSats: current.usedSats + add,
  };
}
