/**
 * Password policy for Create / Import only.
 * Unlock / reveal / send must not use these rules — existing vaults may
 * have been sealed with shorter passwords.
 *
 * Hard gate: trimmed length >= MIN_PASSWORD_LENGTH.
 * Character classes drive the strength meter only — never block creation.
 *
 * Do not log or persist passwords. Callers must pass the exact string to
 * KDF (do not trim before seal/open).
 */

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordStrength = 'Weak' | 'OK' | 'Strong';

export interface PasswordClasses {
  lowercase: boolean;
  uppercase: boolean;
  digit: boolean;
  special: boolean;
}

export interface PasswordPolicyResult {
  ok: boolean;
  /** Length after trim — used for the hard gate and meter. */
  trimmedLength: number;
  classes: PasswordClasses;
  /** Class count 0–4 (lowercase / uppercase / digit / special). */
  classCount: number;
  strength: PasswordStrength;
  /** Present when ok === false. */
  error?: string;
}

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/
/** Non-alphanumeric printable / symbol — anything that is not letter or digit. */
const SPECIAL = /[^A-Za-z0-9]/;

export function passwordClasses(password: string): PasswordClasses {
  return {
    lowercase: LOWER.test(password),
    uppercase: UPPER.test(password),
    digit: DIGIT.test(password),
    special: SPECIAL.test(password),
  };
}

export function countPasswordClasses(classes: PasswordClasses): number {
  return (
    Number(classes.lowercase) +
    Number(classes.uppercase) +
    Number(classes.digit) +
    Number(classes.special)
  );
}

/**
 * Strength from trimmed length + character-class diversity.
 * Below min length → always Weak. Classes never flip ok to false.
 */
export function passwordStrength(
  trimmedLength: number,
  classCount: number
): PasswordStrength {
  if (trimmedLength < MIN_PASSWORD_LENGTH) return 'Weak';
  if (classCount <= 1) return 'Weak';
  if (classCount <= 3) return 'OK';
  return 'Strong';
}

/**
 * Evaluate a candidate vault password for Create / Import.
 * Uses password.trim().length for the hard rule; does not mutate password.
 */
export function evaluateNewPassword(password: string): PasswordPolicyResult {
  const trimmedLength = password.trim().length;
  const classes = passwordClasses(password);
  const classCount = countPasswordClasses(classes);
  const strength = passwordStrength(trimmedLength, classCount);

  if (trimmedLength < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      trimmedLength,
      classes,
      classCount,
      strength,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    trimmedLength,
    classes,
    classCount,
    strength,
  };
}

/** Hard gate only — same rule for UI, Zod refine, and SW. */
export function assertNewPassword(password: string): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  const result = evaluateNewPassword(password);
  if (!result.ok) {
    return { ok: false, error: result.error! };
  }
  return { ok: true };
}
