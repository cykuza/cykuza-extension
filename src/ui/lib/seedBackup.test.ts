import { describe, expect, it } from 'vitest';
import { isSeedBackupPending } from './seedBackup';

describe('isSeedBackupPending', () => {
  it('is true only for a healthy vault that has not finished backup', () => {
    expect(
      isSeedBackupPending({
        hasVault: true,
        seedBackupConfirmed: false,
      })
    ).toBe(true);
    expect(
      isSeedBackupPending({
        hasVault: true,
        seedBackupConfirmed: true,
      })
    ).toBe(false);
    expect(
      isSeedBackupPending({
        hasVault: false,
        seedBackupConfirmed: false,
      })
    ).toBe(false);
    expect(
      isSeedBackupPending({
        hasVault: true,
        seedBackupConfirmed: false,
        vaultCorrupt: true,
      })
    ).toBe(false);
  });
});
