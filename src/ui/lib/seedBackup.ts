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

const READY_OVERLAY_STAGES = new Set<WalletStage>([
  'receive',
  'send',
  'settings',
  'server-config',
  'security',
  'explorer',
  'about',
  'mnemonic-view',
  'private-key-view',
  'address-book',
  'daily-spend',
  'destroy',
]);

/**
 * Canonical popup stage implied by SW status.
 * Unlock and backup are first-class destinations — not caller-side overrides of `ready`.
 */
export function stageFromStatus(status: BackupStatus): WalletStage {
  if (!status.hasVault) return 'idle';
  if (status.vaultCorrupt) return 'ready';
  if (status.locked) return 'unlock';
  if (isSeedBackupPending(status)) return 'mnemonic-display';
  return 'ready';
}

/** Post-ready screens (Receive, Settings, …). Ignored unless mapper says `ready`. */
export function isReadyOverlayStage(stage: WalletStage): boolean {
  return READY_OVERLAY_STAGES.has(stage);
}

/** Post-setup screens may restore only for an unlocked, finished, healthy vault. */
export function canResumePopup(status: BackupStatus): boolean {
  return (
    status.vaultCorrupt !== true &&
    !status.locked &&
    stageFromStatus(status) === 'ready'
  );
}

/**
 * Unlocked popup session (backup or ready). Independent of Electrum watch.
 */
export function shouldHoldSession(status: BackupStatus): boolean {
  return (
    stageFromStatus(status) === 'mnemonic-display' || canResumePopup(status)
  );
}
