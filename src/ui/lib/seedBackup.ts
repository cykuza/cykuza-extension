import type { WalletStatus } from '../../messaging/protocol';
import type { WalletStage } from '../stages';

type BackupStatus = Pick<
  WalletStatus,
  'hasVault' | 'seedBackupConfirmed' | 'vaultCorrupt' | 'locked'
>;

/** True when a sealed vault must still complete seed backup + quiz. */
export function isSeedBackupPending(
  status: Pick<WalletStatus, 'hasVault' | 'seedBackupConfirmed' | 'vaultCorrupt'>
): boolean {
  return (
    status.hasVault === true &&
    status.seedBackupConfirmed === false &&
    status.vaultCorrupt !== true
  );
}

/**
 * Canonical popup stage implied by SW status.
 * Backup is a first-class destination — not a caller-side override of `ready`.
 */
export function stageFromStatus(status: BackupStatus): WalletStage {
  if (!status.hasVault) return 'idle';
  if (isSeedBackupPending(status) && !status.locked) return 'mnemonic-display';
  return 'ready';
}

/** Post-setup screens may restore only for an unlocked, finished, healthy vault. */
export function canResumePopup(status: BackupStatus): boolean {
  return (
    status.vaultCorrupt !== true &&
    !status.locked &&
    stageFromStatus(status) === 'ready'
  );
}
