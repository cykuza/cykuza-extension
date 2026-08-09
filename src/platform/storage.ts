import {
  parseVaultCiphertext,
  type VaultCiphertext,
} from '../domain/vault';
import {
  defaultSettings,
  normalizeSettings,
  type WalletSettings,
} from '../domain/settings';
import {
  defaultLockoutState,
  type LockoutState,
} from '../domain/lockout';
import {
  defaultDailySpendState,
  normalizeDailySpend,
  type DailySpendState,
} from '../domain/dailySpend';

/** Storage key names — platform concern, not messaging protocol. */
export const STORAGE_KEYS = {
  vault: 'vault_ciphertext',
  settings: 'wallet_settings',
  lockout: 'unlock_lockout',
  dailySpend: 'daily_spend',
} as const;

export type LocalStorageArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

/** Thin adapter over chrome.storage.local (ciphertext vault + settings). */
export function localStorage(): LocalStorageArea {
  return chrome.storage.local;
}

export async function getLocalValue<T>(
  key: string
): Promise<T | undefined> {
  const data = await localStorage().get(key);
  return data[key] as T | undefined;
}

export async function setLocalValue(
  key: string,
  value: unknown
): Promise<void> {
  await localStorage().set({ [key]: value });
}

export async function removeLocalKeys(keys: string[]): Promise<void> {
  await localStorage().remove(keys);
}

/**
 * Distinguish absent vs present-but-unparseable vault storage (P1.5).
 * Corrupt/unknown envelopes must not be treated as "no vault" (create overwrite).
 */
export type VaultReadResult =
  | { state: 'absent' }
  | { state: 'ok'; vault: VaultCiphertext }
  | { state: 'corrupt' };

export async function readVaultState(): Promise<VaultReadResult> {
  const raw = await getLocalValue<unknown>(STORAGE_KEYS.vault);
  if (raw === undefined) return { state: 'absent' };
  const vault = parseVaultCiphertext(raw);
  if (!vault) return { state: 'corrupt' };
  return { state: 'ok', vault };
}

/** Parsed vault only; undefined when absent or corrupt. Prefer readVaultState for existence checks. */
export async function readVault(): Promise<VaultCiphertext | undefined> {
  const result = await readVaultState();
  return result.state === 'ok' ? result.vault : undefined;
}

export async function writeVault(vault: VaultCiphertext): Promise<void> {
  await setLocalValue(STORAGE_KEYS.vault, vault);
}

export async function clearVault(): Promise<void> {
  await removeLocalKeys([STORAGE_KEYS.vault]);
}

export async function readSettings(): Promise<WalletSettings> {
  const raw = await getLocalValue<unknown>(STORAGE_KEYS.settings);
  return normalizeSettings(raw ?? defaultSettings());
}

export async function writeSettings(settings: WalletSettings): Promise<void> {
  await setLocalValue(STORAGE_KEYS.settings, normalizeSettings(settings));
}

export async function readLockout(): Promise<LockoutState> {
  const raw = await getLocalValue<LockoutState>(STORAGE_KEYS.lockout);
  if (
    !raw ||
    typeof raw.failedAttempts !== 'number' ||
    (raw.lockoutUntil !== null && typeof raw.lockoutUntil !== 'number')
  ) {
    return defaultLockoutState();
  }
  return {
    failedAttempts: raw.failedAttempts,
    lockoutUntil: raw.lockoutUntil,
  };
}

export async function writeLockout(state: LockoutState): Promise<void> {
  await setLocalValue(STORAGE_KEYS.lockout, state);
}

export async function clearLockoutStorage(): Promise<void> {
  await removeLocalKeys([STORAGE_KEYS.lockout]);
}

export async function readDailySpend(): Promise<DailySpendState> {
  const raw = await getLocalValue<unknown>(STORAGE_KEYS.dailySpend);
  return normalizeDailySpend(raw ?? defaultDailySpendState());
}

export async function writeDailySpend(state: DailySpendState): Promise<void> {
  await setLocalValue(STORAGE_KEYS.dailySpend, normalizeDailySpend(state));
}

export async function clearDailySpendStorage(): Promise<void> {
  await removeLocalKeys([STORAGE_KEYS.dailySpend]);
}
