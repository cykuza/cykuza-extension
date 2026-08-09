/**
 * End-to-end-ish session lifecycle through handleWalletRequest with
 * in-memory storage mocks — simulates create → lock → unlock → destroy
 * without a real browser / Electrum.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '../messaging/protocol';

type Store = Record<string, unknown>;

const memory: Store = {};

vi.mock('../platform/storage', () => ({
  readVaultState: async () => {
    const { parseVaultCiphertext } = await import('../domain/vault');
    if (!('vault_ciphertext' in memory)) return { state: 'absent' as const };
    const vault = parseVaultCiphertext(memory.vault_ciphertext);
    if (!vault) return { state: 'corrupt' as const };
    return { state: 'ok' as const, vault };
  },
  readVault: async () => {
    const { parseVaultCiphertext } = await import('../domain/vault');
    return parseVaultCiphertext(memory.vault_ciphertext);
  },
  writeVault: async (v: unknown) => {
    memory.vault_ciphertext = v;
  },
  clearVault: async () => {
    delete memory.vault_ciphertext;
  },
  readSettings: async () => {
    const { defaultSettings, normalizeSettings } = await import(
      '../domain/settings'
    );
    return normalizeSettings(memory.wallet_settings ?? defaultSettings());
  },
  writeSettings: async (s: unknown) => {
    memory.wallet_settings = s;
  },
  readLockout: async () => {
    const raw = memory.unlock_lockout as
      | { failedAttempts: number; lockoutUntil: number | null }
      | undefined;
    return raw ?? { failedAttempts: 0, lockoutUntil: null };
  },
  writeLockout: async (s: unknown) => {
    memory.unlock_lockout = s;
  },
  clearLockoutStorage: async () => {
    delete memory.unlock_lockout;
  },
  readDailySpend: async () => {
    const { normalizeDailySpend, defaultDailySpendState } = await import(
      '../domain/dailySpend'
    );
    return normalizeDailySpend(memory.daily_spend ?? defaultDailySpendState());
  },
  writeDailySpend: async (s: unknown) => {
    memory.daily_spend = s;
  },
  clearDailySpendStorage: async () => {
    delete memory.daily_spend;
  },
}));

vi.mock('../platform/alarms', () => ({
  clearAutoLockAlarm: vi.fn(),
  scheduleAutoLockAlarm: vi.fn(),
  AUTO_LOCK_ALARM: 'cykuza-auto-lock',
  onAlarm: vi.fn(),
}));

function req<T extends Record<string, unknown>>(body: T) {
  return { protocol: PROTOCOL_VERSION, ...body };
}

describe('session vault lifecycle (mocked storage)', () => {
  beforeEach(() => {
    for (const key of Object.keys(memory)) {
      delete memory[key];
    }
    vi.resetModules();
  });

  it('create → status unlocked → lock → unlock → destroy', async () => {
    const { handleWalletRequest } = await import('./session');
    const { teardownSession } = await import('./session/lifecycle');

    // Cold start locked, no vault.
    let res = await handleWalletRequest(req({ type: 'getStatus' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.hasVault).toBe(false);
    expect(res.status.locked).toBe(true);
    expect(res.status).not.toHaveProperty('serverUrl');

    // Accept terms then create.
    res = await handleWalletRequest(req({ type: 'acceptTerms' }));
    expect(res.ok).toBe(true);

    res = await handleWalletRequest(
      req({ type: 'create', password: 'correct horse battery' })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mnemonic?.split(' ')).toHaveLength(24);
    expect(res.status.hasVault).toBe(true);
    expect(res.status.locked).toBe(false);
    expect(res.status.address).toMatch(/^cy1/);
    expect(res.status.secretKind).toBe('mnemonic');
    const address = res.status.address!;
    const mnemonic = res.mnemonic!;

    // Ciphertext only in storage — no plaintext seed.
    expect(memory.vault_ciphertext).toBeTruthy();
    expect(JSON.stringify(memory)).not.toContain(mnemonic);

    // Lock clears RAM identity.
    res = await handleWalletRequest(req({ type: 'lock' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.locked).toBe(true);
    expect(res.status.address).toBeUndefined();
    expect(res.status.hasVault).toBe(true);

    // Wrong password increments lockout path (still has attempts).
    res = await handleWalletRequest(
      req({ type: 'unlock', password: 'wrong-password!!' })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.remainingAttempts).toBeLessThan(5);

    // Correct unlock restores same address.
    res = await handleWalletRequest(
      req({ type: 'unlock', password: 'correct horse battery' })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.locked).toBe(false);
    expect(res.status.address).toBe(address);

    // Destroy removes vault; terms may survive.
    res = await handleWalletRequest(req({ type: 'destroySession' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.hasVault).toBe(false);
    expect(res.status.locked).toBe(true);
    expect(memory.vault_ciphertext).toBeUndefined();
    expect(res.status.termsAccepted).toBe(true);

    // Simulate SW restart wipe.
    await teardownSession();
    res = await handleWalletRequest(req({ type: 'getStatus' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.locked).toBe(true);
    expect(res.status.hasVault).toBe(false);
  }, 20_000);

  it('rejects short passwords on create at the handler', async () => {
    const { handleWalletRequest } = await import('./session');
    const res = await handleWalletRequest(
      req({ type: 'create', password: 'short-pass' })
    );
    // Zod may reject before handler when going through router; here we call
    // handleWalletRequest directly with a typed bypass — password still gated.
    // If TypeScript narrows, cast via unknown.
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/at least 12/i);
    }
  });

  it('rejects create when protocol password fails Zod at parse layer', async () => {
    const { parseWalletRequest } = await import('../messaging/protocol');
    const parsed = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'create',
      password: '12345678901',
    });
    expect(parsed.success).toBe(false);
  });

  it('create with defaults is csprng 24 words', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const res = await handleWalletRequest(
      req({ type: 'create', password: 'correct horse battery' })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mnemonic?.split(' ')).toHaveLength(24);
    expect(res.status.address).toMatch(/^cy1/);
  });

  it('create with mixed entropy and 24 words', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const res = await handleWalletRequest(
      req({
        type: 'create',
        password: 'correct horse battery',
        wordCount: 24,
        entropyMode: 'mixed',
        diceRolls: '1'.repeat(20),
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mnemonic?.split(' ')).toHaveLength(24);
    expect(res.status.address).toMatch(/^cy1/);
    expect(JSON.stringify(memory)).not.toContain('1'.repeat(20));
  });

  it('create with insufficient mixed dice fails closed', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const res = await handleWalletRequest(
      req({
        type: 'create',
        password: 'correct horse battery',
        wordCount: 12,
        entropyMode: 'mixed',
        diceRolls: '1'.repeat(19),
      })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/dice|Insufficient/i);
    expect(res.error).not.toMatch(/1111111/);
    expect(memory.vault_ciphertext).toBeUndefined();
  });

  it('passphrase wallet: unlock failures share copy; storage never holds passphrase', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));

    const created = await handleWalletRequest(
      req({
        type: 'create',
        password: 'correct horse battery',
        passphrase: 'twenty-fifth-word',
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.status.passphraseRequired).toBe(true);
    expect(created.status.address).toMatch(/^cy1/);
    const address = created.status.address!;
    const mnemonic = created.mnemonic!;

    const vaultJson = JSON.stringify(memory);
    expect(vaultJson).not.toContain('twenty-fifth-word');
    expect(vaultJson).not.toContain(mnemonic);

    const vault = memory.vault_ciphertext as { version: number; passphraseRequired: boolean };
    expect(vault.version).toBe(3);
    expect(vault.passphraseRequired).toBe(true);

    await handleWalletRequest(req({ type: 'lock' }));

    const lockedStatus = await handleWalletRequest(req({ type: 'getStatus' }));
    expect(lockedStatus.ok).toBe(true);
    if (!lockedStatus.ok) return;
    expect(lockedStatus.status.passphraseRequired).toBe(true);
    expect(lockedStatus.status.locked).toBe(true);

    const wrongPassword = await handleWalletRequest(
      req({
        type: 'unlock',
        password: 'wrong-password!!',
        passphrase: 'twenty-fifth-word',
      })
    );
    expect(wrongPassword.ok).toBe(false);
    if (wrongPassword.ok) return;
    expect(wrongPassword.error).toMatch(/^Unlock failed\. \d+ attempts remaining\.$/);
    expect(wrongPassword.error).not.toMatch(/BIP39 passphrase/i);
    expect(wrongPassword.error).not.toMatch(/Invalid password/);

    const wrongPassphrase = await handleWalletRequest(
      req({
        type: 'unlock',
        password: 'correct horse battery',
        passphrase: 'not-the-passphrase',
      })
    );
    expect(wrongPassphrase.ok).toBe(false);
    if (wrongPassphrase.ok) return;
    // Same template as wrong password (no factor oracle); attempt counter may differ.
    expect(wrongPassphrase.error).toMatch(/^Unlock failed\. \d+ attempts remaining\.$/);
    expect(wrongPassphrase.error).not.toMatch(/BIP39 passphrase/i);
    expect(wrongPassphrase.error).not.toMatch(/Invalid password|password/i);

    const ok = await handleWalletRequest(
      req({
        type: 'unlock',
        password: 'correct horse battery',
        passphrase: 'twenty-fifth-word',
      })
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.status.address).toBe(address);
    expect(ok.status.passphraseRequired).toBe(true);
  }, 120_000);

  it('network switch rematerializes passphrase wallet without re-entering passphrase', async () => {
    const { handleWalletRequest } = await import('./session');
    const { sessionRam } = await import('./session/state');
    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const created = await handleWalletRequest(
      req({
        type: 'create',
        password: 'correct horse battery',
        passphrase: 'net-switch-pp',
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const mainAddress = created.status.address!;
    expect(created.status.secretKind).toBe('mnemonic');
    const genBefore = sessionRam.sessionGeneration;

    const switched = await handleWalletRequest(
      req({ type: 'setNetwork', network: 'testnet' })
    );
    expect(switched.ok).toBe(true);
    if (!switched.ok) return;
    expect(switched.status.locked).toBe(false);
    expect(switched.status.secretKind).toBe('mnemonic');
    expect(switched.status.address).toBeDefined();
    expect(switched.status.address).not.toBe(mainAddress);
    expect(switched.status.passphraseRequired).toBe(true);
    // P2.2: network switch bumps session generation via bumpSessionGeneration().
    expect(sessionRam.sessionGeneration).toBe(genBefore + 1);
  }, 120_000);

  it('corrupt vault blocks create and surfaces vaultCorrupt (P1.5)', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));

    memory.vault_ciphertext = { version: 99, salt: 'aa', iv: 'bb', ciphertext: 'cc' };

    let res = await handleWalletRequest(req({ type: 'getStatus' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.hasVault).toBe(true);
    expect(res.status.vaultCorrupt).toBe(true);

    res = await handleWalletRequest(
      req({ type: 'create', password: 'correct horse battery' })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/already exists/i);

    res = await handleWalletRequest(req({ type: 'destroySession' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.hasVault).toBe(false);
    expect(res.status.vaultCorrupt).toBeUndefined();
  });

  it('import kind mismatch wipes probe identity before returning', async () => {
    const keyring = await import('../domain/keyring');
    const wipeSpy = vi.spyOn(keyring, 'wipeIdentity');
    const { handleWalletRequest } = await import('./session');
    const { sessionRam } = await import('./session/state');

    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const res = await handleWalletRequest(
      req({
        type: 'import',
        kind: 'privateKey',
        secret: mnemonic,
        password: 'correct horse battery',
      })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Invalid private key/i);
    expect(wipeSpy).toHaveBeenCalled();
    expect(sessionRam.identity).toBeNull();
    expect(memory.vault_ciphertext).toBeUndefined();

    wipeSpy.mockRestore();
  });

  it('new install defaults: autoLock 5 min and lockWhenPopupCloses on', async () => {
    const { handleWalletRequest } = await import('./session');
    const res = await handleWalletRequest(req({ type: 'getStatus' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.autoLockMinutes).toBe(5);
    expect(res.status.lockWhenPopupCloses).toBe(true);
  });

  it('setLockWhenPopupCloses persists and appears on status', async () => {
    const { handleWalletRequest } = await import('./session');
    await handleWalletRequest(req({ type: 'acceptTerms' }));

    let res = await handleWalletRequest(
      req({ type: 'setLockWhenPopupCloses', enabled: false })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.lockWhenPopupCloses).toBe(false);

    const stored = memory.wallet_settings as { lockWhenPopupCloses?: boolean };
    expect(stored.lockWhenPopupCloses).toBe(false);

    res = await handleWalletRequest(
      req({ type: 'setLockWhenPopupCloses', enabled: true })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.lockWhenPopupCloses).toBe(true);
  });

  it('popupHidden re-arms auto-lock without tearing down the session', async () => {
    const alarms = await import('../platform/alarms');
    const { handleWalletRequest } = await import('./session');
    const { sessionRam } = await import('./session/state');

    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const created = await handleWalletRequest(
      req({ type: 'create', password: 'correct horse battery' })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(sessionRam.identity).not.toBeNull();

    vi.mocked(alarms.scheduleAutoLockAlarm).mockClear();

    const res = await handleWalletRequest(req({ type: 'popupHidden' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status.locked).toBe(false);
    expect(sessionRam.identity).not.toBeNull();
    expect(vi.mocked(alarms.scheduleAutoLockAlarm)).toHaveBeenCalled();
  }, 20_000);

  it('auto-lock alarm tears down the unlocked session', async () => {
    const alarms = await import('../platform/alarms');
    const { handleWalletRequest } = await import('./session');
    const { registerAlarmHandlers } = await import('./router');
    const { sessionRam } = await import('./session/state');

    const listeners: Array<(alarm: { name: string }) => void> = [];
    vi.mocked(alarms.onAlarm).mockImplementation((listener) => {
      listeners.push(listener);
    });

    registerAlarmHandlers();
    expect(listeners.length).toBeGreaterThan(0);

    await handleWalletRequest(req({ type: 'acceptTerms' }));
    const created = await handleWalletRequest(
      req({ type: 'create', password: 'correct horse battery' })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(sessionRam.identity).not.toBeNull();

    for (const listener of listeners) {
      listener({ name: alarms.AUTO_LOCK_ALARM });
    }

    // teardownSession is async void from the alarm handler — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionRam.identity).toBeNull();
    expect(vi.mocked(alarms.clearAutoLockAlarm)).toHaveBeenCalled();
  });
});
