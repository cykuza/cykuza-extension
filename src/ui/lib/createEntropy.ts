import {
  diceMinFor,
  hexMinBytes,
  type EntropyMode,
  type WordCount,
} from '../../domain/seedEntropyLimits';
import type { CreateEntropy } from '../stages';

export function hexByteCount(hex: string): number | null {
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, '');
  if (cleaned.length === 0) return 0;
  if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/.test(cleaned)) return null;
  return cleaned.length / 2;
}

/** True when mixed/user entropy inputs meet domain minima. */
export function userEntropyReady(
  mode: EntropyMode,
  wordCount: WordCount,
  diceRolls: string,
  hexEntropy: string
): boolean {
  if (mode === 'csprng') return true;
  const hasDice = diceRolls.length > 0;
  const hasHex = hexEntropy.trim().length > 0;
  if (!hasDice && !hasHex) return false;
  if (hasDice) {
    if (
      !/^[1-6]+$/.test(diceRolls) ||
      diceRolls.length < diceMinFor(mode, wordCount)
    ) {
      return false;
    }
  }
  if (hasHex) {
    const bytes = hexByteCount(hexEntropy);
    if (bytes === null || bytes < hexMinBytes(mode, wordCount)) return false;
  }
  return true;
}

/** Default create path — 24-word CSPRNG. */
export const DEFAULT_CREATE_ENTROPY: CreateEntropy = {
  wordCount: 24,
  mode: 'csprng',
};

export function buildCreateEntropy(opts: {
  advanced: boolean;
  wordCount: WordCount;
  mode: EntropyMode;
  diceRolls: string;
  hexEntropy: string;
}): CreateEntropy {
  if (!opts.advanced) return DEFAULT_CREATE_ENTROPY;
  return {
    wordCount: opts.wordCount,
    mode: opts.mode,
    ...(opts.mode !== 'csprng' && opts.diceRolls
      ? { diceRolls: opts.diceRolls }
      : {}),
    ...(opts.mode !== 'csprng' && opts.hexEntropy.trim()
      ? { hexEntropy: opts.hexEntropy.trim() }
      : {}),
  };
}

export { hexMinBytes };
