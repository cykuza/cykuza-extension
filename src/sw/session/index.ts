import { safeErrorMessage } from '../../domain/redact';
import type { WalletRequest, WalletResponse } from '../../messaging/protocol';
import {
  handleRefresh,
  handleSetElectrumConfig,
  handleSetNetwork,
  handleTestElectrum,
} from './electrumHandlers';
import { teardownSession } from './lifecycle';
import {
  handleEstimateSend,
  handlePreviewSend,
  handleSend,
} from './sendHandlers';
import { enqueue } from './state';
import { buildStatus } from './status';
import {
  handleAcceptTerms,
  handleConfirmSeedBackup,
  handleCreate,
  handleDestroy,
  handleImport,
  handleLock,
  handlePendingBackupMnemonic,
  handlePopupHidden,
  handleRevealSecret,
  handleSetAddressBook,
  handleSetAutoLock,
  handleSetDailySpendLimit,
  handleSetExplorer,
  handleSetLockWhenPopupCloses,
  handleSetVerifyWithSecondServer,
  handleUnlock,
} from './vaultHandlers';

export { teardownSession };

export async function handleWalletRequest(
  request: WalletRequest
): Promise<WalletResponse> {
  return enqueue(async () => {
    try {
      switch (request.type) {
        case 'getStatus':
          return { ok: true, status: await buildStatus() };
        case 'acceptTerms':
          return handleAcceptTerms();
        case 'create':
          return handleCreate({
            password: request.password,
            wordCount: request.wordCount ?? 24,
            entropyMode: request.entropyMode ?? 'csprng',
            diceRolls: request.diceRolls,
            hexEntropy: request.hexEntropy,
            passphrase: request.passphrase,
          });
        case 'import':
          return handleImport(
            request.password,
            request.secret,
            request.kind,
            request.passphrase
          );
        case 'unlock':
          return handleUnlock(request.password, request.passphrase);
        case 'lock':
          return handleLock();
        case 'popupHidden':
          return handlePopupHidden();
        case 'destroySession':
          return handleDestroy();
        case 'refresh':
          return handleRefresh();
        case 'setNetwork':
          return handleSetNetwork(request.network);
        case 'setElectrumConfig':
          return handleSetElectrumConfig(request.network, request.endpoints);
        case 'testElectrum':
          return handleTestElectrum(request.url);
        case 'setAutoLock':
          return handleSetAutoLock(request.minutes);
        case 'setLockWhenPopupCloses':
          return handleSetLockWhenPopupCloses(request.enabled);
        case 'setExplorer':
          return handleSetExplorer(request.template);
        case 'setAddressBook':
          return handleSetAddressBook(request.entries);
        case 'setDailySpendLimit':
          return handleSetDailySpendLimit(request.limitSats);
        case 'setVerifyWithSecondServer':
          return handleSetVerifyWithSecondServer(request.enabled);
        case 'revealSecret':
          return handleRevealSecret(request.password, request.kind);
        case 'pendingBackupMnemonic':
          return handlePendingBackupMnemonic();
        case 'confirmSeedBackup':
          return handleConfirmSeedBackup();
        case 'estimateSend':
          return handleEstimateSend(
            request.amountSats,
            request.feeRate,
            request.includeFee ?? false,
            request.to
          );
        case 'previewSend':
          return handlePreviewSend(
            request.to,
            request.amountSats,
            request.includeFee ?? false,
            request.feeRate
          );
        case 'send':
          return handleSend(
            request.confirmationToken,
            request.password,
            request.toConfirmSuffix,
            request.allowSpendLimitOnce,
            request.acknowledgeLargeSend
          );
      }
    } catch (err) {
      return { ok: false, error: safeErrorMessage(err) };
    }
  });
}
