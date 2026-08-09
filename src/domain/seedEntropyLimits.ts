/**
 * Seed entropy modes and dice/hex minima — no hashing / bitcoinjs.
 * Generation lives in seedEntropy.ts (SW / create path).
 */

export type WordCount = 12 | 24;
export type EntropyMode = 'csprng' | 'mixed' | 'user';

/** Minimum d6 rolls when dice is the primary (`user`) contribution for 12 words (~128 bits). */
export const DICE_MIN_USER_12 = 50;
/** Minimum d6 rolls when dice is the primary (`user`) contribution for 24 words (~256 bits). */
export const DICE_MIN_USER_24 = 100;
/** Minimum d6 rolls when mixing with CSPRNG. */
export const DICE_MIN_MIXED = 20;
/** Minimum hex-decoded bytes when mixing with CSPRNG. */
export const HEX_MIN_MIXED = 8;

/** Dice roll floor for the given mode and word count. */
export function diceMinFor(mode: EntropyMode, wordCount: WordCount): number {
  if (mode === 'mixed') return DICE_MIN_MIXED;
  return wordCount === 12 ? DICE_MIN_USER_12 : DICE_MIN_USER_24;
}

export function hexMinBytes(mode: EntropyMode, wordCount: WordCount): number {
  if (mode === 'user') return wordCount === 12 ? 16 : 32;
  return HEX_MIN_MIXED;
}
