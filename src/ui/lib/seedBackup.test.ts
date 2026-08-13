import { describe, expect, it } from 'vitest';
import {
  canResumePopup,
  isSeedBackupPending,
  stageFromStatus,
} from './seedBackup';

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

describe('stageFromStatus', () => {
  it('routes unfinished create to mnemonic-display when unlocked', () => {
    expect(
      stageFromStatus({
        hasVault: true,
        locked: false,
        seedBackupConfirmed: false,
      })
    ).toBe('mnemonic-display');
  });

  it('keeps unfinished create on unlock when locked', () => {
    expect(
      stageFromStatus({
        hasVault: true,
        locked: true,
        seedBackupConfirmed: false,
      })
    ).toBe('ready');
  });

  it('maps confirmed vault to ready and absent vault to idle', () => {
    expect(
      stageFromStatus({
        hasVault: true,
        locked: false,
        seedBackupConfirmed: true,
      })
    ).toBe('ready');
    expect(
      stageFromStatus({
        hasVault: false,
        locked: true,
        seedBackupConfirmed: true,
      })
    ).toBe('idle');
  });
});

describe('canResumePopup', () => {
  it('allows resume only for an unlocked finished wallet', () => {
    expect(
      canResumePopup({
        hasVault: true,
        locked: false,
        seedBackupConfirmed: true,
      })
    ).toBe(true);
    expect(
      canResumePopup({
        hasVault: true,
        locked: false,
        seedBackupConfirmed: false,
      })
    ).toBe(false);
    expect(
      canResumePopup({
        hasVault: true,
        locked: true,
        seedBackupConfirmed: true,
      })
    ).toBe(false);
    expect(
      canResumePopup({
        hasVault: true,
        locked: false,
        seedBackupConfirmed: true,
        vaultCorrupt: true,
      })
    ).toBe(false);
  });
});
