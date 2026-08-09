import { entropyToMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import * as bitcoin from 'bitcoinjs-lib';
import { wipeBytes } from './wipeBytes';
import {
  HEX_MIN_MIXED,
  diceMinFor,
  type EntropyMode,
  type WordCount,
} from './seedEntropyLimits';

export type { WordCount, EntropyMode } from './seedEntropyLimits';
export {
  DICE_MIN_USER_12,
  DICE_MIN_USER_24,
  DICE_MIN_MIXED,
  HEX_MIN_MIXED,
  diceMinFor,
} from './seedEntropyLimits';

export type GetRandomValuesFn = (array: Uint8Array) => Uint8Array;

export interface GenerateSeedMnemonicOpts {
  wordCount: WordCount;
  mode: EntropyMode;
  /** Digits `1`–`6` only (standard d6). */
  diceRolls?: string;
  /** Even-length hex string. */
  hexEntropy?: string;
  /** Test-only CSPRNG inject; production uses `crypto.getRandomValues`. */
  getRandomValues?: GetRandomValuesFn;
}

function entropyByteLength(wordCount: WordCount): number {
  return wordCount === 12 ? 16 : 32;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Mix rule (normative): finalEntropy = SHA256(csprngBytes ‖ userEntropyBytes)
 * truncated to 16 (12 words) or 32 (24 words) bytes.
 * Dice: hash-accumulate — validated roll string as UTF-8 (no biased 2.5-bit packing).
 * `csprng` mode uses getRandomValues bytes directly (no hash).
 * `user` mode uses SHA256(userEntropyBytes) truncated (no CSPRNG).
 */
function mixEntropy(
  csprngBytes: Uint8Array | null,
  userEntropyBytes: Uint8Array | null,
  byteLen: number
): Uint8Array {
  if (csprngBytes && !userEntropyBytes) {
    if (csprngBytes.length !== byteLen) {
      throw new Error('Invalid CSPRNG entropy length');
    }
    return Uint8Array.from(csprngBytes);
  }
  if (!csprngBytes && userEntropyBytes) {
    const digest = bitcoin.crypto.sha256(userEntropyBytes);
    try {
      return Uint8Array.from(digest.subarray(0, byteLen));
    } finally {
      wipeBytes(digest);
    }
  }
  if (csprngBytes && userEntropyBytes) {
    const combined = concatBytes([csprngBytes, userEntropyBytes]);
    try {
      const digest = bitcoin.crypto.sha256(combined);
      try {
        return Uint8Array.from(digest.subarray(0, byteLen));
      } finally {
        wipeBytes(digest);
      }
    } finally {
      wipeBytes(combined);
    }
  }
  throw new Error('Entropy mix requires CSPRNG and/or user entropy');
}

function requireGetRandomValues(
  inject?: GetRandomValuesFn
): GetRandomValuesFn {
  if (inject) return inject;
  const fn =
    typeof globalThis.crypto?.getRandomValues === 'function'
      ? globalThis.crypto.getRandomValues.bind(globalThis.crypto)
      : undefined;
  if (!fn) {
    throw new Error('CSPRNG unavailable: crypto.getRandomValues is required');
  }
  return fn as GetRandomValuesFn;
}

function fillCsprng(
  byteLen: number,
  inject?: GetRandomValuesFn
): Uint8Array {
  const getRandomValues = requireGetRandomValues(inject);
  const out = new Uint8Array(byteLen);
  getRandomValues(out);
  return out;
}

function parseDiceRolls(
  diceRolls: string,
  mode: EntropyMode,
  wordCount: WordCount
): Uint8Array {
  if (!/^[1-6]+$/.test(diceRolls)) {
    throw new Error('Invalid dice rolls: digits 1-6 only');
  }
  const min = diceMinFor(mode, wordCount);
  if (diceRolls.length < min) {
    throw new Error(`Insufficient dice rolls: need at least ${min}`);
  }
  return new TextEncoder().encode(diceRolls);
}

function parseHexEntropy(
  hexEntropy: string,
  mode: EntropyMode,
  wordCount: WordCount
): Uint8Array {
  const cleaned = hexEntropy.trim().toLowerCase().replace(/^0x/, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex entropy: even-length hex required');
  }
  if (!/^[0-9a-f]+$/.test(cleaned)) {
    throw new Error('Invalid hex entropy: hex digits only');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  if (mode === 'user') {
    const need = entropyByteLength(wordCount);
    if (out.length < need) {
      throw new Error('Insufficient hex entropy for word count');
    }
  } else if (out.length < HEX_MIN_MIXED) {
    throw new Error(`Insufficient hex entropy: need at least ${HEX_MIN_MIXED} bytes`);
  }
  return out;
}

function collectUserEntropy(
  mode: EntropyMode,
  wordCount: WordCount,
  diceRolls?: string,
  hexEntropy?: string
): Uint8Array {
  const hasDice = diceRolls !== undefined && diceRolls.length > 0;
  const hasHex = hexEntropy !== undefined && hexEntropy.length > 0;
  if (!hasDice && !hasHex) {
    throw new Error('User entropy required: provide dice rolls and/or hex');
  }
  const parts: Uint8Array[] = [];
  try {
    if (hasDice) {
      parts.push(parseDiceRolls(diceRolls!, mode, wordCount));
    }
    if (hasHex) {
      parts.push(parseHexEntropy(hexEntropy!, mode, wordCount));
    }
    return concatBytes(parts);
  } catch (err) {
    for (const p of parts) wipeBytes(p);
    throw err;
  } finally {
    for (const p of parts) wipeBytes(p);
  }
}

/**
 * Generate a BIP39 English mnemonic from CSPRNG and/or user entropy.
 * Never falls back to a software PRNG. Does not persist dice/hex.
 */
export function generateSeedMnemonic(opts: GenerateSeedMnemonicOpts): string {
  const { wordCount, mode, diceRolls, hexEntropy, getRandomValues } = opts;
  if (wordCount !== 12 && wordCount !== 24) {
    throw new Error('Unsupported word count');
  }
  const byteLen = entropyByteLength(wordCount);
  const hasDice = diceRolls !== undefined && diceRolls.length > 0;
  const hasHex = hexEntropy !== undefined && hexEntropy.length > 0;

  let csprngBytes: Uint8Array | null = null;
  let userBytes: Uint8Array | null = null;
  let finalEntropy: Uint8Array | null = null;

  try {
    if (mode === 'csprng') {
      if (hasDice || hasHex) {
        throw new Error('CSPRNG mode does not accept user entropy');
      }
      csprngBytes = fillCsprng(byteLen, getRandomValues);
      finalEntropy = mixEntropy(csprngBytes, null, byteLen);
    } else if (mode === 'mixed') {
      csprngBytes = fillCsprng(byteLen, getRandomValues);
      userBytes = collectUserEntropy(mode, wordCount, diceRolls, hexEntropy);
      finalEntropy = mixEntropy(csprngBytes, userBytes, byteLen);
    } else if (mode === 'user') {
      userBytes = collectUserEntropy(mode, wordCount, diceRolls, hexEntropy);
      finalEntropy = mixEntropy(null, userBytes, byteLen);
    } else {
      throw new Error('Unsupported entropy mode');
    }

    return entropyToMnemonic(finalEntropy, englishWordlist);
  } finally {
    wipeBytes(csprngBytes);
    wipeBytes(userBytes);
    wipeBytes(finalEntropy);
  }
}
