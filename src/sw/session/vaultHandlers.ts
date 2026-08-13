import {
  unlockIdentity,
  validateMnemonic,
  wipeIdentity,
  WrongBip39PassphraseError,
  WRONG_BIP39_PASSPHRASE,
  seedFingerprintFromMnemonic,
  type UnlockedIdentity,
} from '../../domain/keyring';
import {
  checkLockout,
  clearLockout,
  recordFailedAttempt,
  remainingAttempts,
} from '../../domain/lockout';
import { assertNewPassword } from '../../domain/passwordPolicy';
import { parseExplorerTxTemplate } from '../../domain/explorer';
import { safeErrorMessage } from '../../domain/redact';
import {
  generateSeedMnemonic,
  type EntropyMode,
  type WordCount,
} from '../../domain/seedEntropy';
import {
  setAddressBook,
  setDailySpendLimit,
  setSeedBackupConfirmed,
  setVerifyWithSecondServer,
  type WalletSettings,
} from '../../domain/settings';
import { unlockFailedWithAttempts } from '../../domain/unlockErrors';
import {
  openVault,
  sealVault,
  vaultPassphraseRequired,
  type VaultPayload,
} from '../../domain/vault';
import type { WalletResponse } from '../../messaging/protocol';
import {
  clearDailySpendStorage,
  clearLockoutStorage,
  clearVault,
  readLockout,
  readSettings,
  readVaultState,
  writeLockout,
  writeSettings,
  writeVault,
} from '../../platform/storage';
import { armAutoLock, sessionRam } from './state';
import { teardownSession } from './lifecycle';
import { buildStatus } from './status';

async function requireNoVault(): Promise<void> {
  const result = await readVaultState();
  if (result.state !== 'absent') {
    throw new Error('Vault already exists. End session first.');
  }
}

async function persistSeedBackupConfirmed(
  confirmed: boolean
): Promise<WalletSettings> {
  const settings = await readSettings();
  const next = setSeedBackupConfirmed(settings, confirmed);
  if (next.seedBackupConfirmed === settings.seedBackupConfirmed) {
    return settings;
  }
  await writeSettings(next);
  return next;
}

function normalizeOptionalPassphrase(
  passphrase: string | undefined
): string | undefined {
  if (passphrase === undefined) return undefined;
  // Empty string means "no passphrase" (same as omit).
  if (passphrase.length === 0) return undefined;
  return passphrase;
}

async function persistAndUnlock(
  payload: VaultPayload,
  password: string,
  opts: { passphraseRequired: boolean; passphrase?: string }
): Promise<UnlockedIdentity> {
  const settings = await readSettings();
  const sealed = await sealVault(payload, password, {
    passphraseRequired: opts.passphraseRequired,
  });
  await writeVault(sealed);
  await writeLockout(clearLockout());

  await teardownSession();
  const unlocked = await unlockIdentity(payload.secret, settings.network, {
    passphrase: opts.passphrase ?? '',
    expectedSeedFingerprint: payload.seedFingerprint,
  });
  if (unlocked.kind !== payload.kind) {
    wipeIdentity(unlocked);
    throw new Error('Secret kind mismatch');
  }
  sessionRam.identity = unlocked;
  await armAutoLock(settings);
  return unlocked;
}

export interface CreateWalletOpts {
  password: string;
  wordCount: WordCount;
  entropyMode: EntropyMode;
  diceRolls?: string;
  hexEntropy?: string;
  passphrase?: string;
}

export async function handleCreate(
  opts: CreateWalletOpts
): Promise<WalletResponse> {
  try {
    await requireNoVault();
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }
  const policy = assertNewPassword(opts.password);
  if (!policy.ok) {
    return { ok: false, error: policy.error };
  }

  let mnemonic: string;
  try {
    mnemonic = generateSeedMnemonic({
      wordCount: opts.wordCount,
      mode: opts.entropyMode,
      diceRolls: opts.diceRolls,
      hexEntropy: opts.hexEntropy,
    });
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }

  const passphrase = normalizeOptionalPassphrase(opts.passphrase);
  const passphraseRequired = passphrase !== undefined;
  let payload: VaultPayload = { kind: 'mnemonic', secret: mnemonic };
  if (passphraseRequired) {
    const seedFingerprint = await seedFingerprintFromMnemonic(
      mnemonic,
      passphrase
    );
    payload = { ...payload, seedFingerprint };
  }

  // Flag first so a sealed vault can never look like a finished setup.
  await persistSeedBackupConfirmed(false);
  await persistAndUnlock(payload, opts.password, {
    passphraseRequired,
    passphrase,
  });
  return {
    ok: true,
    status: await buildStatus(),
    mnemonic,
  };
}

export async function handleImport(
  password: string,
  secret: string,
  kind: 'mnemonic' | 'privateKey',
  passphraseRaw?: string
): Promise<WalletResponse> {
  try {
    await requireNoVault();
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }
  const policy = assertNewPassword(password);
  if (!policy.ok) {
    return { ok: false, error: policy.error };
  }

  const passphrase = normalizeOptionalPassphrase(passphraseRaw);
  if (kind === 'privateKey' && passphrase !== undefined) {
    return {
      ok: false,
      error: 'BIP39 passphrase applies only to mnemonic wallets',
    };
  }

  const settings = await readSettings();
  if (kind === 'mnemonic') {
    if (!validateMnemonic(secret)) {
      return {
        ok: false,
        error: 'Invalid mnemonic: expected 12 or 24 BIP39 words',
      };
    }
  }

  // Materialize first to validate before sealing.
  let probe: UnlockedIdentity | null = null;
  try {
    probe = await unlockIdentity(secret, settings.network, {
      passphrase: passphrase ?? '',
    });
    if (probe.kind !== kind) {
      wipeIdentity(probe);
      probe = null;
      return {
        ok: false,
        error:
          kind === 'mnemonic'
            ? 'Invalid mnemonic: expected 12 or 24 BIP39 words'
            : 'Invalid private key (WIF or 64-char hex)',
      };
    }
    const passphraseRequired = kind === 'mnemonic' && passphrase !== undefined;
    let payload: VaultPayload = { kind: probe.kind, secret: probe.secret };
    if (passphraseRequired) {
      payload = {
        ...payload,
        seedFingerprint: await seedFingerprintFromMnemonic(
          probe.secret,
          passphrase
        ),
      };
    }
    wipeIdentity(probe);
    probe = null;
    await persistAndUnlock(payload, password, {
      passphraseRequired,
      passphrase,
    });
    await persistSeedBackupConfirmed(true);
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    wipeIdentity(probe);
    return { ok: false, error: safeErrorMessage(err) };
  }
}

async function failUnlockAttempt(
  lockout: Awaited<ReturnType<typeof readLockout>>,
  _reason?: string
): Promise<WalletResponse> {
  const next = recordFailedAttempt(lockout, Date.now());
  await writeLockout(next);
  const nextCheck = checkLockout(next);
  if (nextCheck.lockedOut) {
    return {
      ok: false,
      error: 'Too many failed attempts. Try again later.',
      remainingAttempts: 0,
      lockoutUntil: next.lockoutUntil,
    };
  }
  const left = remainingAttempts(next);
  return {
    ok: false,
    // Same copy for wrong vault password and wrong BIP39 passphrase (no factor oracle).
    error: unlockFailedWithAttempts(left),
    remainingAttempts: left,
    lockoutUntil: null,
  };
}

export async function handleUnlock(
  password: string,
  passphraseRaw?: string
): Promise<WalletResponse> {
  const vaultState = await readVaultState();
  if (vaultState.state === 'absent') {
    return { ok: false, error: 'No vault found' };
  }
  if (vaultState.state === 'corrupt') {
    return {
      ok: false,
      error:
        'Vault data is corrupt. End session in Settings to start over.',
      status: await buildStatus(),
    };
  }
  const vault = vaultState.vault;

  let lockout = await readLockout();
  const now = Date.now();
  const check = checkLockout(lockout, now);

  if (check.lockedOut) {
    return {
      ok: false,
      error: 'Too many failed attempts. Try again later.',
      remainingAttempts: 0,
      lockoutUntil: lockout.lockoutUntil,
    };
  }

  // Clear expired lockout before attempting.
  if (lockout.lockoutUntil !== null && now >= lockout.lockoutUntil) {
    lockout = clearLockout();
    await writeLockout(lockout);
  }

  const needsPassphrase = vaultPassphraseRequired(vault);
  const passphrase = normalizeOptionalPassphrase(passphraseRaw);

  let payload: VaultPayload;
  try {
    payload = await openVault(vault, password);
  } catch {
    return failUnlockAttempt(lockout, 'Invalid password');
  }

  try {
    if (needsPassphrase) {
      if (passphrase === undefined) {
        payload.secret = '';
        return failUnlockAttempt(lockout, WRONG_BIP39_PASSPHRASE);
      }
      if (!payload.seedFingerprint) {
        payload.secret = '';
        return failUnlockAttempt(lockout, WRONG_BIP39_PASSPHRASE);
      }
    } else if (passphrase !== undefined) {
      // Non-passphrase vault: ignore stray passphrase (do not fail).
    }

    const settings = await readSettings();
    await teardownSession();
    const unlocked = await unlockIdentity(payload.secret, settings.network, {
      passphrase: needsPassphrase ? passphrase ?? '' : '',
      expectedSeedFingerprint: needsPassphrase
        ? payload.seedFingerprint
        : undefined,
    });
    if (unlocked.kind !== payload.kind) {
      wipeIdentity(unlocked);
      throw new Error('Secret kind mismatch');
    }
    sessionRam.identity = unlocked;

    // Auth-gated migration: v2 passphrase wallets → v3 with 32-hex fingerprint.
    if (
      vault.version === 2 &&
      needsPassphrase &&
      passphrase !== undefined &&
      unlocked.kind === 'mnemonic'
    ) {
      try {
        const seedFingerprint = await seedFingerprintFromMnemonic(
          payload.secret,
          passphrase
        );
        const migrated = await sealVault(
          {
            kind: payload.kind,
            secret: payload.secret,
            seedFingerprint,
          },
          password,
          { passphraseRequired: true }
        );
        await writeVault(migrated);
      } catch {
        // Unlock already succeeded; leave v2 on disk if re-seal fails.
      }
    }

    await writeLockout(clearLockout());
    await armAutoLock(settings);
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    if (
      err instanceof WrongBip39PassphraseError ||
      (err instanceof Error && err.message === WRONG_BIP39_PASSPHRASE)
    ) {
      return failUnlockAttempt(lockout, WRONG_BIP39_PASSPHRASE);
    }
    // Unexpected derive failure after successful decrypt — treat as passphrase path
    // when passphrase was required; otherwise surface as invalid password.
    if (needsPassphrase) {
      return failUnlockAttempt(lockout, WRONG_BIP39_PASSPHRASE);
    }
    return failUnlockAttempt(lockout, 'Invalid password');
  } finally {
    payload.secret = '';
  }
}

/**
 * Verify vault password without re-deriving identity or tearing down the session.
 * Shares lockout state with unlock. Success clears failed attempts (no false lockout).
 * Optionally returns the decrypted payload (caller must wipe).
 */
export async function verifyVaultPassword(
  password: string,
  options?: { returnPayload?: boolean }
): Promise<
  | { ok: true; payload?: VaultPayload }
  | {
      ok: false;
      error: string;
      remainingAttempts?: number;
      lockoutUntil?: number | null;
    }
> {
  const vaultState = await readVaultState();
  if (vaultState.state === 'absent') {
    return { ok: false, error: 'No vault found' };
  }
  if (vaultState.state === 'corrupt') {
    return {
      ok: false,
      error:
        'Vault data is corrupt. End session in Settings to start over.',
    };
  }
  const vault = vaultState.vault;

  let lockout = await readLockout();
  const now = Date.now();
  const check = checkLockout(lockout, now);

  if (check.lockedOut) {
    return {
      ok: false,
      error: 'Too many failed attempts. Try again later.',
      remainingAttempts: 0,
      lockoutUntil: lockout.lockoutUntil,
    };
  }

  if (lockout.lockoutUntil !== null && now >= lockout.lockoutUntil) {
    lockout = clearLockout();
    await writeLockout(lockout);
  }

  try {
    const payload = await openVault(vault, password);
    await writeLockout(clearLockout());
    if (options?.returnPayload) {
      return { ok: true, payload };
    }
    // Best-effort wipe — we only needed decrypt success, not the secret.
    payload.secret = '';
    return { ok: true };
  } catch {
    const next = recordFailedAttempt(lockout, Date.now());
    await writeLockout(next);
    const nextCheck = checkLockout(next);
    if (nextCheck.lockedOut) {
      return {
        ok: false,
        error: 'Too many failed attempts. Try again later.',
        remainingAttempts: 0,
        lockoutUntil: next.lockoutUntil,
      };
    }
    const left = remainingAttempts(next);
    return {
      ok: false,
      error: `Invalid password. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
      remainingAttempts: left,
      lockoutUntil: null,
    };
  }
}

export async function handleAcceptTerms(): Promise<WalletResponse> {
  const settings = await readSettings();
  settings.termsAccepted = true;
  await writeSettings(settings);
  return { ok: true, status: await buildStatus() };
}

export async function handleLock(): Promise<WalletResponse> {
  await teardownSession();
  return { ok: true, status: await buildStatus() };
}

/**
 * Popup hide: reset the idle auto-lock countdown when the setting is on.
 * Does not wipe identity — immediate teardown breaks Chrome permission prompts
 * and brief focus switches; plaintext dwell stays bounded by autoLockMinutes.
 */
export async function handlePopupHidden(): Promise<WalletResponse> {
  const settings = await readSettings();
  if (sessionRam.identity && settings.lockWhenPopupCloses) {
    await armAutoLock(settings);
  }
  return { ok: true, status: await buildStatus(settings) };
}

export async function handleDestroy(): Promise<WalletResponse> {
  await teardownSession();
  await clearVault();
  await clearLockoutStorage();
  await clearDailySpendStorage();
  // Settings (including termsAccepted / electrum config) intentionally survive destroy.
  return { ok: true, status: await buildStatus() };
}

export async function handleSetAutoLock(
  minutes: number
): Promise<WalletResponse> {
  const settings = await readSettings();
  const next: WalletSettings = {
    ...settings,
    autoLockMinutes: Math.min(Math.max(Math.floor(minutes), 1), 1440),
  };
  await writeSettings(next);
  if (sessionRam.identity) {
    await armAutoLock(next);
  }
  return { ok: true, status: await buildStatus(next) };
}

export async function handleSetLockWhenPopupCloses(
  enabled: boolean
): Promise<WalletResponse> {
  const settings = await readSettings();
  const next: WalletSettings = {
    ...settings,
    lockWhenPopupCloses: enabled,
  };
  await writeSettings(next);
  return { ok: true, status: await buildStatus(next) };
}

export async function handleSetExplorer(
  template: string | null
): Promise<WalletResponse> {
  const settings = await readSettings();
  let explorerTxTemplate: string | null = null;
  if (template !== null) {
    try {
      explorerTxTemplate = parseExplorerTxTemplate(template);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid explorer URL',
        status: await buildStatus(settings),
      };
    }
  }
  const next: WalletSettings = {
    ...settings,
    explorerTxTemplate,
  };
  await writeSettings(next);
  return { ok: true, status: await buildStatus(next) };
}

export async function handleSetAddressBook(
  entries: { label: string; address: string; network: 'mainnet' | 'testnet' }[]
): Promise<WalletResponse> {
  const settings = await readSettings();
  const next = setAddressBook(settings, entries);
  await writeSettings(next);
  return { ok: true, status: await buildStatus(next) };
}

export async function handleSetDailySpendLimit(
  limitSats: number | null
): Promise<WalletResponse> {
  const settings = await readSettings();
  const next = setDailySpendLimit(settings, limitSats);
  await writeSettings(next);
  return { ok: true, status: await buildStatus(next) };
}

export async function handleSetVerifyWithSecondServer(
  enabled: boolean
): Promise<WalletResponse> {
  const settings = await readSettings();
  const next = setVerifyWithSecondServer(settings, enabled);
  await writeSettings(next);
  return { ok: true, status: await buildStatus(next) };
}

export async function handlePendingBackupMnemonic(): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: 'Wallet is locked' };
  }
  const settings = await readSettings();
  if (settings.seedBackupConfirmed) {
    return {
      ok: false,
      error: 'Seed backup already confirmed',
      status: await buildStatus(settings),
    };
  }
  if (sessionRam.identity.kind !== 'mnemonic') {
    return {
      ok: false,
      error: 'This wallet has no recovery phrase to confirm.',
      status: await buildStatus(settings),
    };
  }
  await armAutoLock(settings);
  return {
    ok: true,
    status: await buildStatus(settings),
    mnemonic: sessionRam.identity.secret,
  };
}

export async function handleConfirmSeedBackup(): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: 'Wallet is locked' };
  }
  const next = await persistSeedBackupConfirmed(true);
  return { ok: true, status: await buildStatus(next) };
}

export async function handleRevealSecret(
  password: string,
  kind: 'mnemonic' | 'privateKey'
): Promise<WalletResponse> {
  if (!sessionRam.identity) {
    return { ok: false, error: 'Wallet is locked' };
  }

  const verified = await verifyVaultPassword(password, { returnPayload: true });
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      remainingAttempts: verified.remainingAttempts,
      lockoutUntil: verified.lockoutUntil,
      status: await buildStatus(),
    };
  }

  try {
    if (kind === 'mnemonic') {
      if (!verified.payload || verified.payload.kind !== 'mnemonic') {
        return {
          ok: false,
          error:
            'This wallet was imported from a private key; no mnemonic is available.',
          status: await buildStatus(),
        };
      }
      const secret = verified.payload.secret;
      await armAutoLock();
      return {
        ok: true,
        status: await buildStatus(),
        secret,
      };
    }

    // Private key (WIF) — available for both mnemonic and PK wallets.
    const wif = sessionRam.identity.keyPair.toWIF();
    await armAutoLock();
    return {
      ok: true,
      status: await buildStatus(),
      secret: wif,
    };
  } finally {
    if (verified.payload) {
      verified.payload.secret = '';
    }
  }
}
