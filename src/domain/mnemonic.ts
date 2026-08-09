import {
  validateMnemonic as scureValidateMnemonic,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';

/** Collapse whitespace; BIP39 checksum validation expects a single-space join. */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ');
}

/** True only for valid 12- or 24-word English BIP39 phrases. */
export function validateMnemonic(mnemonic: string): boolean {
  const trimmed = normalizeMnemonic(mnemonic);
  const words = trimmed.split(' ');
  if (words.length !== 12 && words.length !== 24) return false;
  return scureValidateMnemonic(trimmed, englishWordlist);
}
