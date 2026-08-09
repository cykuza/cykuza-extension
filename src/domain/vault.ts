import { argon2id } from 'hash-wasm';
import { wipeBytes, type SecretKind } from './keyring';

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** Argon2id parameters tuned for interactive unlock on modern devices. */
const ARGON2 = {
  memorySize: 64 * 1024, // 64 MiB
  iterations: 3,
  parallelism: 1,
  hashLength: KEY_LENGTH,
} as const;

/** Legacy sealed vault (pre–BIP39 passphrase). Still opened; never silently rewritten. */
export interface VaultCiphertextV1 {
  version: 1;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 ciphertext inclusive of GCM tag (Web Crypto format) */
  ciphertext: string;
}

/**
 * Vault format v2 — legacy passphrase envelopes (8-hex seedFingerprint in payload).
 * Still opened; migrated to v3 on successful unlock when passphraseRequired.
 */
export interface VaultCiphertextV2 {
  version: 2;
  salt: string;
  iv: string;
  ciphertext: string;
  passphraseRequired: boolean;
}

/**
 * Vault format v3 — new seals.
 * Envelope fields match v2; passphrase wallets store a 32-hex seedFingerprint.
 */
export interface VaultCiphertextV3 {
  version: 3;
  salt: string;
  iv: string;
  ciphertext: string;
  passphraseRequired: boolean;
}

export type VaultCiphertext =
  | VaultCiphertextV1
  | VaultCiphertextV2
  | VaultCiphertextV3;

/** Plaintext sealed inside the vault (never persisted unencrypted). */
export interface VaultPayload {
  kind: SecretKind;
  secret: string;
  /**
   * Present when passphraseRequired — SHA256(BIP39 seed) truncated to 8 (legacy)
   * or 32 hex chars (v3+). Used to distinguish wrong BIP39 passphrase after decrypt.
   */
  seedFingerprint?: string;
}

export interface SealVaultOptions {
  /** When true, payload must include seedFingerprint. Default false. */
  passphraseRequired?: boolean;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveRawKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    hashLength: ARGON2.hashLength,
    outputType: 'binary',
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importAesKey(
  raw: Uint8Array,
  extractable: boolean
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/** Legacy (v2) passphrase verifier length. */
export const SEED_FINGERPRINT_LEGACY_RE = /^[0-9a-f]{8}$/;
/** Current (v3+) passphrase verifier — 16 bytes as hex. */
export const SEED_FINGERPRINT_RE = /^[0-9a-f]{32}$/;
const SEED_FINGERPRINT_ANY_RE = /^[0-9a-f]{8}$|^[0-9a-f]{32}$/;

/**
 * Parse and whitelist vault payload JSON.
 * Rejects foreign keys (including any `passphrase` field).
 */
export function parseVaultPayload(
  plaintext: string,
  opts?: { passphraseRequired?: boolean }
): VaultPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error('Invalid password or corrupted vault');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid password or corrupted vault');
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (key !== 'kind' && key !== 'secret' && key !== 'seedFingerprint') {
      throw new Error('Invalid password or corrupted vault');
    }
  }
  if (!('kind' in obj) || !('secret' in obj)) {
    throw new Error('Invalid password or corrupted vault');
  }
  const kind = obj.kind;
  const secret = obj.secret;
  if (
    (kind !== 'mnemonic' && kind !== 'privateKey') ||
    typeof secret !== 'string' ||
    secret.length === 0
  ) {
    throw new Error('Invalid password or corrupted vault');
  }

  const passphraseRequired = opts?.passphraseRequired === true;
  if (passphraseRequired) {
    const fp = obj.seedFingerprint;
    if (typeof fp !== 'string' || !SEED_FINGERPRINT_ANY_RE.test(fp)) {
      throw new Error('Invalid password or corrupted vault');
    }
    return { kind, secret, seedFingerprint: fp };
  }

  if ('seedFingerprint' in obj) {
    throw new Error('Invalid password or corrupted vault');
  }
  return { kind, secret };
}

/** True when envelope declares BIP39 passphrase is required at unlock. */
export function vaultPassphraseRequired(vault: VaultCiphertext): boolean {
  return (
    (vault.version === 2 || vault.version === 3) &&
    vault.passphraseRequired === true
  );
}

/**
 * Whitelist parse of on-disk vault envelope (no decrypt).
 * Returns undefined for missing/invalid shapes so callers can fail closed.
 */
export function parseVaultCiphertext(raw: unknown): VaultCiphertext | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.version;
  const salt = obj.salt;
  const iv = obj.iv;
  const ciphertext = obj.ciphertext;
  if (
    typeof salt !== 'string' ||
    salt.length === 0 ||
    typeof iv !== 'string' ||
    iv.length === 0 ||
    typeof ciphertext !== 'string' ||
    ciphertext.length === 0
  ) {
    return undefined;
  }
  if (version === 1) {
    return { version: 1, salt, iv, ciphertext };
  }
  if (version === 2) {
    if (typeof obj.passphraseRequired !== 'boolean') {
      return undefined;
    }
    return {
      version: 2,
      salt,
      iv,
      ciphertext,
      passphraseRequired: obj.passphraseRequired,
    };
  }
  if (version === 3) {
    if (typeof obj.passphraseRequired !== 'boolean') {
      return undefined;
    }
    return {
      version: 3,
      salt,
      iv,
      ciphertext,
      passphraseRequired: obj.passphraseRequired,
    };
  }
  return undefined;
}

/**
 * Encrypt secret material with Argon2id + AES-256-GCM.
 * New seals are always format v3. Password verification = successful decrypt.
 */
export async function sealVault(
  payload: VaultPayload,
  password: string,
  options?: SealVaultOptions
): Promise<VaultCiphertextV3> {
  const passphraseRequired = options?.passphraseRequired === true;
  if (passphraseRequired) {
    if (
      typeof payload.seedFingerprint !== 'string' ||
      !SEED_FINGERPRINT_RE.test(payload.seedFingerprint)
    ) {
      throw new Error('Passphrase wallet requires seedFingerprint');
    }
  } else if (payload.seedFingerprint !== undefined) {
    throw new Error('seedFingerprint only allowed when passphraseRequired');
  }

  const toSeal: VaultPayload = passphraseRequired
    ? {
        kind: payload.kind,
        secret: payload.secret,
        seedFingerprint: payload.seedFingerprint,
      }
    : { kind: payload.kind, secret: payload.secret };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const rawKey = await deriveRawKey(password, salt);
  let encoded: Uint8Array | undefined;
  try {
    const key = await importAesKey(rawKey, false);
    encoded = new TextEncoder().encode(JSON.stringify(toSeal));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(encoded)
    );
    return {
      version: 3,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(encrypted)),
      passphraseRequired,
    };
  } finally {
    wipeBytes(rawKey);
    wipeBytes(encoded);
  }
}

export async function openVault(
  vault: VaultCiphertext,
  password: string
): Promise<VaultPayload> {
  if (vault.version !== 1 && vault.version !== 2 && vault.version !== 3) {
    throw new Error('Unsupported vault version');
  }
  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  const ciphertext = fromBase64(vault.ciphertext);
  const rawKey = await deriveRawKey(password, salt);
  try {
    const key = await importAesKey(rawKey, false);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    );
    const plaintext = new TextDecoder().decode(decrypted);
    const passphraseRequired = vaultPassphraseRequired(vault);
    return parseVaultPayload(plaintext, { passphraseRequired });
  } catch (err) {
    throw new Error('Invalid password or corrupted vault', { cause: err });
  } finally {
    wipeBytes(rawKey);
    wipeBytes(salt);
    wipeBytes(iv);
    wipeBytes(ciphertext);
  }
}
