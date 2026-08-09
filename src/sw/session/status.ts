import {
  checkLockout,
  clearLockout,
  remainingAttempts,
} from '../../domain/lockout';
import { usedSatsToday } from '../../domain/dailySpend';
import {
  assessElectrumTrust,
  electrumTrustMessage,
} from '../../domain/electrumTrust';
import {
  isCustomEndpoint,
  publicElectrumView,
  resolveElectrumServers,
  type WalletSettings,
} from '../../domain/settings';
import { vaultPassphraseRequired } from '../../domain/vault';
import type { WalletStatus } from '../../messaging/protocol';
import { filterPermittedUrls } from '../../platform/permissions';
import {
  readDailySpend,
  readLockout,
  readSettings,
  readVaultState,
  writeLockout,
} from '../../platform/storage';
import { sessionRam } from './state';

function applyUnconfiguredStatus(
  settings: WalletSettings,
  status: WalletStatus
): void {
  const urls = resolveElectrumServers(settings);
  if (urls.length === 0) {
    status.serverStatus = 'unconfigured';
    status.serverKind = null;
    status.error =
      settings.network === 'testnet'
        ? 'Testnet has no official Electrum servers. Add a custom wss:// endpoint in Settings.'
        : 'No Electrum endpoints configured. Add a custom wss:// endpoint in Settings.';
  } else if (sessionRam.lastServerStatus === 'idle' && !status.error) {
    status.serverStatus = 'idle';
  }
}

function serverKindForUrl(
  settings: WalletSettings,
  url: string | null
): 'builtin' | 'custom' | null {
  if (!url) return null;
  return isCustomEndpoint(settings, url) ? 'custom' : 'builtin';
}

export async function buildStatus(
  settingsOverride?: WalletSettings
): Promise<WalletStatus> {
  const vaultState = await readVaultState();
  const settings = settingsOverride ?? (await readSettings());
  let lockout = await readLockout();
  const now = Date.now();

  // Persist cleanup of expired lockout so storage stays tidy.
  if (lockout.lockoutUntil !== null && now >= lockout.lockoutUntil) {
    lockout = clearLockout();
    await writeLockout(lockout);
  }

  const check = checkLockout(lockout, now);
  const dailySpend = await readDailySpend();
  const hasVault = vaultState.state !== 'absent';
  const status: WalletStatus = {
    hasVault,
    locked: !sessionRam.identity,
    network: settings.network,
    termsAccepted: settings.termsAccepted,
    autoLockMinutes: settings.autoLockMinutes,
    lockWhenPopupCloses: settings.lockWhenPopupCloses,
    remainingAttempts: remainingAttempts(lockout, now),
    electrum: publicElectrumView(settings),
    explorerTxTemplate: settings.explorerTxTemplate,
    addressBook: settings.addressBook.map((e) => ({ ...e })),
    dailySpendLimitSats: settings.dailySpendLimitSats,
    dailySpendUsedSats: usedSatsToday(dailySpend, now),
    verifyWithSecondServer: settings.verifyWithSecondServer,
    serverKind: serverKindForUrl(settings, sessionRam.lastServerUrl),
    serverStatus: sessionRam.lastServerStatus,
    watchActive: sessionRam.watchActive,
  };

  if (vaultState.state === 'corrupt') {
    status.vaultCorrupt = true;
    if (!status.error) {
      status.error =
        'Vault data is corrupt. End session in Settings to start over.';
    }
  }

  if (check.lockedOut) {
    status.lockoutUntil = lockout.lockoutUntil;
  }

  if (sessionRam.identity) {
    status.address = sessionRam.identity.address;
    status.secretKind = sessionRam.identity.kind;
  }

  if (vaultState.state === 'ok') {
    status.passphraseRequired = vaultPassphraseRequired(vaultState.vault);
  }

  if (sessionRam.cachedBalance) status.balance = sessionRam.cachedBalance;
  if (sessionRam.cachedHistory) status.history = sessionRam.cachedHistory;
  if (sessionRam.cachedFeeRates) status.feeRates = sessionRam.cachedFeeRates;
  if (sessionRam.cachedUtxos !== undefined) {
    status.utxoCount = sessionRam.cachedUtxos.length;
  }
  if (sessionRam.lastServerError) status.error = sessionRam.lastServerError;

  const configuredUrls = resolveElectrumServers(settings);
  const permitted = await filterPermittedUrls(configuredUrls);
  const electrumTrust = assessElectrumTrust({
    configuredCount: configuredUrls.length,
    permittedCount: permitted.length,
    verifyEnabled: settings.verifyWithSecondServer === true,
  });
  status.electrumTrust = electrumTrust;
  const trustMsg = electrumTrustMessage(electrumTrust);
  if (trustMsg && !status.error) {
    status.error = trustMsg;
  }

  applyUnconfiguredStatus(settings, status);
  return status;
}
