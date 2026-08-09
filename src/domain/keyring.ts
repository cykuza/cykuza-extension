import { BIP32Factory } from 'bip32';
import { mnemonicToSeed } from '@scure/bip39';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairInterface } from 'ecpair';
import { getNetwork, type NetworkType } from './network';
import {
  generateSeedMnemonic,
  type WordCount,
} from './seedEntropy';
import { normalizeMnemonic, validateMnemonic } from './mnemonic';
import { wipeBytes } from './wipeBytes';

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

export const CYBERYEN_COIN_TYPE = 802;
export const DEFAULT_DERIVATION_PATH = `m/84'/${CYBERYEN_COIN_TYPE}'/0'/0/0`;
/** Default word count for newly generated mnemonics (256-bit entropy). */
export const MNEMONIC_WORD_COUNT = 24;
export const MNEMONIC_WORD_COUNTS = [12, 24] as const;
export type { WordCount };

/** Re-export for vault and other callers that historically imported from keyring. */
export { wipeBytes } from './wipeBytes';
export { normalizeMnemonic, validateMnemonic } from './mnemonic';

export type SecretKind = 'mnemonic' | 'privateKey';

/** Stable message — vault opened; BIP39 passphrase did not match sealed seed fingerprint. */
export const WRONG_BIP39_PASSPHRASE = 'Wrong BIP39 passphrase';

export class WrongBip39PassphraseError extends Error {
  constructor() {
    super(WRONG_BIP39_PASSPHRASE);
    this.name = 'WrongBip39PassphraseError';
  }
}

export interface UnlockedIdentity {
  kind: SecretKind;
  /** BIP39 mnemonic or WIF/hex private key — cleared on lock (string GC best-effort) */
  secret: string;
  address: string;
  keyPair: ECPairInterface;
  scripthash: string;
  derivationPath?: string;
}

export interface UnlockIdentityOptions {
  accountIndex?: number;
  /** BIP39 passphrase (25th word). Never stored; cleared after seed materialization. */
  passphrase?: string;
  /**
   * When set (passphrase wallets), SHA256(seed) fingerprint must match or
   * {@link WrongBip39PassphraseError} is thrown.
   */
  expectedSeedFingerprint?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function wipeIdentity(identity: UnlockedIdentity | null | undefined): void {
  if (!identity) return;
  const priv = identity.keyPair.privateKey;
  if (priv) wipeBytes(priv);
  identity.secret = '';
  identity.address = '';
  identity.scripthash = '';
  identity.derivationPath = undefined;
}

export function getDerivationPath(accountIndex = 0): string {
  return `m/84'/${CYBERYEN_COIN_TYPE}'/${accountIndex}'/0/0`;
}

/** CSPRNG BIP39 mnemonic (12 or 24 English words). */
export function generateMnemonic(wordCount: WordCount = MNEMONIC_WORD_COUNT): string {
  return generateSeedMnemonic({ mode: 'csprng', wordCount });
}

/**
 * Short non-secret preview fingerprint (first 8 hex of SHA256 of normalized mnemonic).
 * Does not log or return the mnemonic.
 */
export function mnemonicFingerprint(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  const bytes = new TextEncoder().encode(normalized);
  const digest = bitcoin.crypto.sha256(bytes);
  wipeBytes(bytes);
  const hex = bytesToHex(Uint8Array.from(digest).subarray(0, 4));
  wipeBytes(digest);
  return hex;
}

/** First 32 hex chars of SHA256(seed) — network-independent passphrase verifier (16 bytes). */
export function seedFingerprintFromBytes(seedBytes: Uint8Array): string {
  const digest = bitcoin.crypto.sha256(seedBytes);
  const hex = bytesToHex(Uint8Array.from(digest).subarray(0, 16));
  wipeBytes(digest);
  return hex;
}

/**
 * Compare a computed fingerprint to a stored verifier.
 * Legacy v2 wallets stored 8 hex chars; new seals store 32.
 */
export function seedFingerprintsMatch(
  computed: string,
  expected: string
): boolean {
  if (expected.length === 8) {
    return computed.slice(0, 8) === expected;
  }
  return computed === expected;
}

/**
 * Compute seed fingerprint for seal-time (passphrase wallets).
 * Wipes seed bytes before return.
 */
export async function seedFingerprintFromMnemonic(
  mnemonic: string,
  passphrase = ''
): Promise<string> {
  const normalized = normalizeMnemonic(mnemonic);
  const seedBytes = await mnemonicToSeed(normalized, passphrase);
  try {
    return seedFingerprintFromBytes(seedBytes);
  } finally {
    wipeBytes(seedBytes);
  }
}

/**
 * Derive the first receive address for preview. Wipes signing material before return.
 */
export async function previewReceiveAddress(
  mnemonic: string,
  networkType: NetworkType = 'mainnet',
  passphrase = ''
): Promise<string> {
  const identity = await unlockIdentity(mnemonic, networkType, {
    passphrase,
  });
  const address = identity.address;
  wipeIdentity(identity);
  return address;
}

/**
 * Rematerialize identity for a different network from already-derived private key bytes.
 * Preserves kind + secret (mnemonic) so passphrase is not needed after unlock.
 */
export function rematerializeForNetwork(
  identity: UnlockedIdentity,
  networkType: NetworkType
): UnlockedIdentity {
  const priv = identity.keyPair.privateKey;
  if (!priv) throw new Error('Failed to rematerialize: missing private key');
  const network = getNetwork(networkType);
  const keyPair = ECPair.fromPrivateKey(Uint8Array.from(priv), { network });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  if (!address) throw new Error('Failed to rematerialize address');
  return {
    kind: identity.kind,
    secret: identity.secret,
    address,
    keyPair,
    scripthash: addressToScriptHash(address, networkType),
    derivationPath: identity.derivationPath,
  };
}

export function addressToScriptHash(
  address: string,
  networkType: NetworkType = 'mainnet'
): string {
  const network = getNetwork(networkType);
  const payment = bitcoin.address.toOutputScript(address, network);
  const hash = bitcoin.crypto.sha256(payment);
  const reversed = Uint8Array.from(hash).reverse();
  return bytesToHex(reversed);
}

function keyPairFromPrivateKey(
  raw: string,
  networkType: NetworkType
): ECPairInterface {
  const network = getNetwork(networkType);
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return ECPair.fromPrivateKey(hexToBytes(trimmed), { network });
  }
  return ECPair.fromWIF(trimmed, network);
}

/**
 * Materialize signing identity from a mnemonic or private key.
 * Callers must wipe identity on lock via `wipeIdentity`.
 * BIP39 passphrase is never attached to the returned identity.
 */
export async function unlockIdentity(
  secret: string,
  networkType: NetworkType,
  options: UnlockIdentityOptions = {}
): Promise<UnlockedIdentity> {
  const accountIndex = options.accountIndex ?? 0;
  const passphrase = options.passphrase ?? '';
  const expectedSeedFingerprint = options.expectedSeedFingerprint;

  const trimmed = secret.trim();
  const normalizedMnemonic = normalizeMnemonic(trimmed);

  if (validateMnemonic(normalizedMnemonic)) {
    const seedBytes = await mnemonicToSeed(normalizedMnemonic, passphrase);
    try {
      if (expectedSeedFingerprint !== undefined) {
        const fp = seedFingerprintFromBytes(seedBytes);
        if (!seedFingerprintsMatch(fp, expectedSeedFingerprint)) {
          throw new WrongBip39PassphraseError();
        }
      }
      const network = getNetwork(networkType);
      const root = bip32.fromSeed(seedBytes, network);
      const derivationPath = getDerivationPath(accountIndex);
      const node = root.derivePath(derivationPath);
      if (!node.privateKey) throw new Error('Failed to derive private key');
      const keyPair = ECPair.fromPrivateKey(Uint8Array.from(node.privateKey), {
        network,
      });
      wipeBytes(node.privateKey);
      wipeBytes(node.chainCode);
      wipeBytes(root.privateKey);
      wipeBytes(root.chainCode);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network,
      });
      if (!address) throw new Error('Failed to derive address');
      return {
        kind: 'mnemonic',
        secret: normalizedMnemonic,
        address,
        keyPair,
        scripthash: addressToScriptHash(address, networkType),
        derivationPath,
      };
    } finally {
      wipeBytes(seedBytes);
    }
  }

  if (expectedSeedFingerprint !== undefined || passphrase.length > 0) {
    throw new Error('BIP39 passphrase applies only to mnemonic wallets');
  }

  // Reject near-mnemonics (wrong word count / invalid BIP39) before WIF attempt.
  const wordCount = normalizedMnemonic.split(' ').filter(Boolean).length;
  if (wordCount >= 11 && wordCount <= 24) {
    throw new Error('Invalid mnemonic: expected 12 or 24 BIP39 words');
  }

  const keyPair = keyPairFromPrivateKey(trimmed, networkType);
  const network = getNetwork(networkType);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  if (!address) throw new Error('Failed to derive address');
  return {
    kind: 'privateKey',
    secret: trimmed,
    address,
    keyPair,
    scripthash: addressToScriptHash(address, networkType),
  };
}
