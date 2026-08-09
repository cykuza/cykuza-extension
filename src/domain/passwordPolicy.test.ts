import { describe, expect, it } from 'vitest';
import {
  assertNewPassword,
  countPasswordClasses,
  evaluateNewPassword,
  MIN_PASSWORD_LENGTH,
  passwordClasses,
  passwordStrength,
} from './passwordPolicy';

describe('passwordPolicy', () => {
  it('exports MIN_PASSWORD_LENGTH = 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('rejects trimmed length 11', () => {
    const r = evaluateNewPassword('a'.repeat(11));
    expect(r.ok).toBe(false);
    expect(r.trimmedLength).toBe(11);
    expect(r.strength).toBe('Weak');
    expect(r.error).toBe('Password must be at least 12 characters.');
  });

  it('accepts trimmed length 12', () => {
    const r = evaluateNewPassword('a'.repeat(12));
    expect(r.ok).toBe(true);
    expect(r.trimmedLength).toBe(12);
    expect(r.error).toBeUndefined();
  });

  it('uses trim only for the length gate (padding spaces)', () => {
    // 10 letters + leading/trailing spaces → trimmed length 10 → reject
    const short = evaluateNewPassword('  abcdefghij  ');
    expect(short.ok).toBe(false);
    expect(short.trimmedLength).toBe(10);

    // 12 letters with padding → trimmed length 12 → accept
    const ok = evaluateNewPassword('  abcdefghijkl  ');
    expect(ok.ok).toBe(true);
    expect(ok.trimmedLength).toBe(12);
  });

  it('allows digit-only passwords of length >= 12 as Weak', () => {
    const r = evaluateNewPassword('123456789012');
    expect(r.ok).toBe(true);
    expect(r.classCount).toBe(1);
    expect(r.classes.digit).toBe(true);
    expect(r.strength).toBe('Weak');
  });

  it('detects all four character classes', () => {
    const classes = passwordClasses('Aa1!');
    expect(classes).toEqual({
      lowercase: true,
      uppercase: true,
      digit: true,
      special: true,
    });
    expect(countPasswordClasses(classes)).toBe(4);
  });

  it('maps class count to Weak / OK / Strong when length ok', () => {
    expect(passwordStrength(12, 0)).toBe('Weak');
    expect(passwordStrength(12, 1)).toBe('Weak');
    expect(passwordStrength(12, 2)).toBe('OK');
    expect(passwordStrength(12, 3)).toBe('OK');
    expect(passwordStrength(12, 4)).toBe('Strong');
  });

  it('forces Weak when below min length regardless of classes', () => {
    expect(passwordStrength(11, 4)).toBe('Weak');
  });

  it('rates mixed passwords correctly via evaluateNewPassword', () => {
    // 2 classes → OK
    const ok = evaluateNewPassword('abcdefghij12');
    expect(ok.ok).toBe(true);
    expect(ok.classCount).toBe(2);
    expect(ok.strength).toBe('OK');

    // 4 classes → Strong
    const strong = evaluateNewPassword('Abcdefghij1!');
    expect(strong.ok).toBe(true);
    expect(strong.classCount).toBe(4);
    expect(strong.strength).toBe('Strong');
  });

  it('assertNewPassword mirrors the hard gate', () => {
    expect(assertNewPassword('short')).toEqual({
      ok: false,
      error: 'Password must be at least 12 characters.',
    });
    expect(assertNewPassword('123456789012')).toEqual({ ok: true });
  });
});
