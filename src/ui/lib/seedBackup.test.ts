import { describe, expect, it } from 'vitest';
import {
  canResumePopup,
  isReadyOverlayStage,
  isSeedBackupPending,
  shouldHoldSession,
  stageFromStatus,
} from './seedBackup';
import type { WalletStage } from '../stages';

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

describe('stageFromStatus matrix', () => {
  const cases: Array<{
    name: string;
    status: {
      hasVault: boolean;
      locked: boolean;
      seedBackupConfirmed: boolean;
      vaultCorrupt?: boolean;
    };
    stage: WalletStage;
    resume: boolean;
    hold: boolean;
  }> = [
    {
      name: 'absent vault is idle',
      status: {
        hasVault: false,
        locked: true,
        seedBackupConfirmed: true,
      },
      stage: 'idle',
      resume: false,
      hold: false,
    },
    {
      name: 'absent vault unlocked is still idle',
      status: {
        hasVault: false,
        locked: false,
        seedBackupConfirmed: false,
      },
      stage: 'idle',
      resume: false,
      hold: false,
    },
    {
      name: 'locked unfinished create is unlock, not ready',
      status: {
        hasVault: true,
        locked: true,
        seedBackupConfirmed: false,
      },
      stage: 'unlock',
      resume: false,
      hold: false,
    },
    {
      name: 'locked finished vault is unlock',
      status: {
        hasVault: true,
        locked: true,
        seedBackupConfirmed: true,
      },
      stage: 'unlock',
      resume: false,
      hold: false,
    },
    {
      name: 'unlocked unfinished create is backup',
      status: {
        hasVault: true,
        locked: false,
        seedBackupConfirmed: false,
      },
      stage: 'mnemonic-display',
      resume: false,
      hold: true,
    },
    {
      name: 'unlocked finished vault is ready',
      status: {
        hasVault: true,
        locked: false,
        seedBackupConfirmed: true,
      },
      stage: 'ready',
      resume: true,
      hold: true,
    },
    {
      name: 'corrupt locked vault is ready, not unlock',
      status: {
        hasVault: true,
        locked: true,
        seedBackupConfirmed: false,
        vaultCorrupt: true,
      },
      stage: 'ready',
      resume: false,
      hold: false,
    },
    {
      name: 'corrupt unlocked vault is ready, not backup',
      status: {
        hasVault: true,
        locked: false,
        seedBackupConfirmed: true,
        vaultCorrupt: true,
      },
      stage: 'ready',
      resume: false,
      hold: false,
    },
    {
      name: 'corrupt unfinished vault is ready, not backup',
      status: {
        hasVault: true,
        locked: false,
        seedBackupConfirmed: false,
        vaultCorrupt: true,
      },
      stage: 'ready',
      resume: false,
      hold: false,
    },
  ];

  it.each(cases)('$name', ({ status, stage, resume, hold }) => {
    expect(stageFromStatus(status)).toBe(stage);
    expect(canResumePopup(status)).toBe(resume);
    expect(shouldHoldSession(status)).toBe(hold);
  });
});

describe('isReadyOverlayStage', () => {
  it('is true only for post-ready screens, not base mapper stages', () => {
    expect(isReadyOverlayStage('receive')).toBe(true);
    expect(isReadyOverlayStage('settings')).toBe(true);
    expect(isReadyOverlayStage('destroy')).toBe(true);
    expect(isReadyOverlayStage('ready')).toBe(false);
    expect(isReadyOverlayStage('unlock')).toBe(false);
    expect(isReadyOverlayStage('mnemonic-display')).toBe(false);
    expect(isReadyOverlayStage('idle')).toBe(false);
  });
});
