import type { WalletStatus } from '../../messaging/protocol';

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
