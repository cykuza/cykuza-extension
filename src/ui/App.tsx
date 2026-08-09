import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectChainWatch } from '../messaging/chainWatchClient';
import { walletRpc } from '../messaging/client';
import type { WalletStatus } from '../messaging/protocol';
import Button from './components/Button';
import {
  attachPopupHideHandler,
  popupHidePolicyFromStatus,
  shouldNotifyPopupHidden,
  type PopupHidePolicy,
} from './popupHideSession';
import {
  clearPopupResume,
  isResumableStage,
  readPopupResume,
  writePopupResume,
} from './popupResume';
import Shell from './shell/Shell';
import type { ChromeProps } from './shell/Chrome';
import type { CreateEntropy, ImportKind, WalletStage } from './stages';
import AddressBookView from './views/AddressBookView';
import AboutView from './views/AboutView';
import CorruptVaultView from './views/CorruptVaultView';
import DailySpendView from './views/DailySpendView';
import DestroyView from './views/DestroyView';
import ExplorerView from './views/ExplorerView';
import IdleView from './views/IdleView';
import ImportMethodView from './views/ImportMethodView';
import MnemonicDisplayView from './views/MnemonicDisplayView';
import MnemonicInputView from './views/MnemonicInputView';
import PasswordCreationView from './views/PasswordCreationView';
import PasswordLockView from './views/PasswordLockView';
import PrivateKeyImportView from './views/PrivateKeyImportView';
import ReadyView from './views/ReadyView';
import ReceiveView from './views/ReceiveView';
import RevealSecretView from './views/RevealSecretView';
import SecurityView from './views/SecurityView';
import SendView from './views/SendView';
import ServerConfigView from './views/ServerConfigView';
import SettingsHubView, {
  type SettingsSection,
} from './views/SettingsHubView';
import TermsView from './views/TermsView';

type Flow =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'import'; importKind: ImportKind };

const SETTINGS_TITLES: Record<SettingsSection, string> = {
  'server-config': 'Network',
  'mnemonic-view': 'Show Mnemonic',
  'private-key-view': 'Show Private Key',
  'address-book': 'Address book',
  'daily-spend': 'Daily spend limit',
  security: 'Security',
  explorer: 'Explorer',
  about: 'About',
  destroy: 'End session',
};

function stageFromStatus(status: WalletStatus): WalletStage {
  if (!status.hasVault) return 'idle';
  return 'ready';
}

/**
 * Popup stage machine aligned with cykuza-web wallet stages.
 * Secrets stay ephemeral; vault ops go through walletRpc only.
 */
export default function App() {
  const [stage, setStage] = useState<WalletStage>('loading');
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [flow, setFlow] = useState<Flow>({ kind: 'none' });
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingPassphrase, setPendingPassphrase] = useState<
    string | undefined
  >();
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [pendingCreateAddress, setPendingCreateAddress] = useState<
    string | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [popupHidePolicy, setPopupHidePolicy] =
    useState<PopupHidePolicy | null>(null);

  const sendBackRef = useRef<(() => void) | null>(null);
  const mnemonicInputBackRef = useRef<(() => void) | null>(null);
  const mnemonicDisplayBackRef = useRef<(() => void) | null>(null);

  const rememberStatus = useCallback((next: WalletStatus) => {
    setStatus(next);
    setTermsAccepted(next.termsAccepted);
    setPopupHidePolicy(popupHidePolicyFromStatus(next));
    if (next.locked) {
      void clearPopupResume();
    }
  }, []);

  const applyStatus = useCallback(
    (next: WalletStatus, nextStage?: WalletStage) => {
      rememberStatus(next);
      if (nextStage) {
        setStage(nextStage);
        return;
      }
      setStage(stageFromStatus(next));
    },
    [rememberStatus]
  );

  const clearPending = useCallback(() => {
    setPendingPassword(null);
    setPendingPassphrase(undefined);
    setPendingMnemonic(null);
    setPendingCreateAddress(undefined);
    setFlow({ kind: 'none' });
  }, []);

  const refreshStatus = useCallback(async () => {
    const res = await walletRpc({ type: 'getStatus' });
    if (!res.ok) {
      setErrorMessage(res.error);
      setStage('error');
      return;
    }
    applyStatus(res.status);
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await walletRpc({ type: 'getStatus' });
      if (cancelled) return;
      if (!res.ok) {
        setErrorMessage(res.error);
        setStage('error');
        return;
      }
      rememberStatus(res.status);
      if (!res.status.locked && res.status.hasVault) {
        const resume = await readPopupResume();
        if (cancelled) return;
        if (resume && isResumableStage(resume.stage)) {
          setStage(resume.stage);
          return;
        }
      }
      if (cancelled) return;
      setStage(stageFromStatus(res.status));
    })().catch(() => {
      if (cancelled) return;
      setErrorMessage(
        'Wallet background is not responding. Reload the extension and try again.'
      );
      setStage('error');
    });
    return () => {
      cancelled = true;
    };
  }, [rememberStatus]);

  useEffect(() => {
    if (!status || status.locked || !isResumableStage(stage)) {
      return;
    }
    void writePopupResume(stage);
  }, [stage, status]);

  useEffect(() => {
    if (!popupHidePolicy || !shouldNotifyPopupHidden(popupHidePolicy)) return;
    return attachPopupHideHandler({
      target: document,
      shouldNotify: () => shouldNotifyPopupHidden(popupHidePolicy),
      onHidden: () => {
        void walletRpc({ type: 'popupHidden' });
      },
    });
  }, [popupHidePolicy]);

  /**
   * UI-scoped Electrum watch Port for the unlocked popup session.
   * SW owns socket restart on network/endpoint change; keep Port stable here.
   */
  const shouldWatch =
    !!status &&
    !status.locked &&
    status.hasVault &&
    !status.vaultCorrupt &&
    status.serverStatus !== 'unconfigured' &&
    status.electrumTrust !== 'degraded' &&
    status.electrumTrust !== 'verify_off';

  useEffect(() => {
    if (!shouldWatch) return;
    const handle = connectChainWatch({
      onStatus: (next) => {
        rememberStatus(next);
      },
      onError: (_error, next) => {
        if (next) rememberStatus(next);
      },
    });
    handle.start();
    return () => {
      handle.stop();
    };
  }, [shouldWatch, rememberStatus]);

  const goBack = useCallback(() => {
    setErrorMessage(null);
    if (stage === 'send' && sendBackRef.current) {
      sendBackRef.current();
      return;
    }
    if (stage === 'mnemonic-input' && mnemonicInputBackRef.current) {
      mnemonicInputBackRef.current();
      return;
    }
    if (stage === 'mnemonic-display' && mnemonicDisplayBackRef.current) {
      mnemonicDisplayBackRef.current();
      return;
    }

    switch (stage) {
      case 'import-method':
        clearPending();
        setStage('idle');
        break;
      case 'password-creation':
        if (flow.kind === 'import') {
          setStage('import-method');
        } else {
          clearPending();
          setStage('idle');
        }
        break;
      case 'mnemonic-input':
      case 'private-key-import':
        setStage('password-creation');
        break;
      case 'receive':
      case 'send':
        setStage('ready');
        break;
      case 'settings':
        setStage('ready');
        break;
      case 'server-config':
      case 'mnemonic-view':
      case 'private-key-view':
      case 'address-book':
      case 'daily-spend':
      case 'security':
      case 'explorer':
      case 'about':
      case 'destroy':
        setStage('settings');
        break;
      default:
        break;
    }
  }, [stage, flow, clearPending]);

  const chrome: ChromeProps = useMemo(() => {
    const unlockedReady =
      stage === 'ready' && status && !status.locked && !status.vaultCorrupt;

    if (stage === 'loading' || stage === 'idle') {
      return { showBrand: true };
    }
    if (stage === 'error') {
      return { title: 'Error' };
    }
    if (stage === 'import-method') {
      return { title: 'Import wallet', showBack: true, onBack: goBack };
    }
    if (stage === 'password-creation') {
      return {
        title: flow.kind === 'import' ? 'Set password' : 'Create wallet',
        showBack: true,
        onBack: goBack,
      };
    }
    if (stage === 'mnemonic-display') {
      return { title: 'Backup seed phrase' };
    }
    if (stage === 'mnemonic-input') {
      return { title: 'Enter mnemonic', showBack: true, onBack: goBack };
    }
    if (stage === 'private-key-import') {
      return { title: 'Import private key', showBack: true, onBack: goBack };
    }
    if (stage === 'ready' && unlockedReady) {
      return {
        address: status.address ?? null,
        showSettings: true,
        onSettings: () => setStage('settings'),
      };
    }
    if (stage === 'ready') {
      return { title: 'Unlock' };
    }
    if (stage === 'receive') {
      return { title: 'Receive', showBack: true, onBack: goBack };
    }
    if (stage === 'send') {
      return { title: 'Send', showBack: true, onBack: goBack };
    }
    if (stage === 'settings') {
      return { title: 'Wallet settings', showBack: true, onBack: goBack };
    }
    if (
      stage === 'server-config' ||
      stage === 'mnemonic-view' ||
      stage === 'private-key-view' ||
      stage === 'address-book' ||
      stage === 'daily-spend' ||
      stage === 'security' ||
      stage === 'explorer' ||
      stage === 'about' ||
      stage === 'destroy'
    ) {
      return {
        title: SETTINGS_TITLES[stage],
        showBack: true,
        onBack: goBack,
      };
    }
    return {};
  }, [stage, status, flow, goBack]);

  const onPasswordConfirm = async (
    password: string,
    entropy: CreateEntropy,
    passphrase?: string
  ) => {
    if (flow.kind === 'create') {
      const res = await walletRpc({
        type: 'create',
        password,
        wordCount: entropy.wordCount,
        entropyMode: entropy.mode,
        ...(entropy.diceRolls ? { diceRolls: entropy.diceRolls } : {}),
        ...(entropy.hexEntropy ? { hexEntropy: entropy.hexEntropy } : {}),
        ...(passphrase ? { passphrase } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.mnemonic) throw new Error('Create succeeded but mnemonic missing');
      if (!res.status.address) {
        throw new Error('Create succeeded but address missing');
      }
      rememberStatus(res.status);
      setPendingMnemonic(res.mnemonic);
      setPendingCreateAddress(res.status.address);
      setPendingPassword(null);
      setPendingPassphrase(undefined);
      setStage('mnemonic-display');
      return;
    }

    if (flow.kind === 'import') {
      setPendingPassword(password);
      setPendingPassphrase(passphrase);
      if (flow.importKind === 'privateKey') {
        setStage('private-key-import');
      } else {
        setStage('mnemonic-input');
      }
    }
  };

  const onImportMnemonic = async (mnemonic: string) => {
    if (!pendingPassword) throw new Error('Missing password');
    const res = await walletRpc({
      type: 'import',
      password: pendingPassword,
      secret: mnemonic,
      kind: 'mnemonic',
      ...(pendingPassphrase ? { passphrase: pendingPassphrase } : {}),
    });
    setPendingPassword(null);
    setPendingPassphrase(undefined);
    if (!res.ok) throw new Error(res.error);
    clearPending();
    applyStatus(res.status, 'ready');
  };

  const onImportPrivateKey = async (privateKey: string, password: string) => {
    const res = await walletRpc({
      type: 'import',
      password,
      secret: privateKey,
      kind: 'privateKey',
    });
    if (!res.ok) throw new Error(res.error);
    clearPending();
    applyStatus(res.status, 'ready');
  };

  const onUnlock = async (password: string, passphrase?: string) => {
    const res = await walletRpc({
      type: 'unlock',
      password,
      ...(passphrase ? { passphrase } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.error) as Error & {
        lockoutUntil?: number | null;
        remainingAttempts?: number;
      };
      err.lockoutUntil = res.lockoutUntil;
      err.remainingAttempts = res.remainingAttempts;
      if (res.status) rememberStatus(res.status);
      throw err;
    }
    applyStatus(res.status, 'ready');
  };

  const focusKey = stage;

  return (
    <Shell chrome={chrome} focusKey={focusKey}>
      {stage === 'loading' && <p className="muted">Loading…</p>}

      {stage === 'error' && (
        <div className="panel">
          <p className="error" role="alert">
            {errorMessage}
          </p>
          <Button onClick={() => void refreshStatus()}>Retry</Button>
        </div>
      )}

      {stage === 'idle' && !termsAccepted && (
        <TermsView
          onAccepted={(next) => {
            rememberStatus(next);
            setTermsAccepted(true);
          }}
        />
      )}

      {stage === 'idle' && termsAccepted && (
        <IdleView
          onCreate={() => {
            setFlow({ kind: 'create' });
            setStage('password-creation');
          }}
          onImport={() => {
            setFlow({ kind: 'import', importKind: null });
            setStage('import-method');
          }}
        />
      )}

      {stage === 'import-method' && (
        <ImportMethodView
          onSelectMnemonic={() => {
            setFlow({ kind: 'import', importKind: 'mnemonic' });
            setStage('password-creation');
          }}
          onSelectPrivateKey={() => {
            setFlow({ kind: 'import', importKind: 'privateKey' });
            setStage('password-creation');
          }}
        />
      )}

      {stage === 'password-creation' && (
        <PasswordCreationView
          allowAdvancedEntropy={flow.kind === 'create'}
          allowPassphrase={
            flow.kind === 'create' ||
            (flow.kind === 'import' && flow.importKind === 'mnemonic')
          }
          onConfirm={onPasswordConfirm}
        />
      )}

      {stage === 'mnemonic-display' && pendingMnemonic && (
        <MnemonicDisplayView
          mnemonic={pendingMnemonic}
          address={pendingCreateAddress}
          onInternalBack={(handler) => {
            mnemonicDisplayBackRef.current = handler;
          }}
          onConfirm={() => {
            setPendingMnemonic(null);
            setPendingCreateAddress(undefined);
            setFlow({ kind: 'none' });
            setStage('ready');
            void refreshStatus();
          }}
        />
      )}

      {stage === 'mnemonic-input' && (
        <MnemonicInputView
          onInternalBack={(handler) => {
            mnemonicInputBackRef.current = handler;
          }}
          onConfirm={onImportMnemonic}
        />
      )}

      {stage === 'private-key-import' && pendingPassword && (
        <PrivateKeyImportView
          password={pendingPassword}
          onConfirm={onImportPrivateKey}
        />
      )}

      {stage === 'ready' && status?.vaultCorrupt && (
        <CorruptVaultView
          onDestroyed={(next) => {
            clearPending();
            applyStatus(next, 'idle');
          }}
        />
      )}

      {stage === 'ready' && status && !status.vaultCorrupt && status.locked && (
        <PasswordLockView status={status} onUnlock={onUnlock} />
      )}

      {stage === 'ready' && status && !status.vaultCorrupt && !status.locked && (
        <ReadyView
          status={status}
          onStatus={(next) => applyStatus(next, 'ready')}
          onReceive={() => setStage('receive')}
          onSend={() => setStage('send')}
        />
      )}

      {stage === 'receive' && status && <ReceiveView status={status} />}

      {stage === 'send' && status && (
        <SendView
          status={status}
          onStatus={(next) => {
            rememberStatus(next);
          }}
          onSent={(next) => applyStatus(next, 'ready')}
          onInternalBack={(handler) => {
            sendBackRef.current = handler;
          }}
        />
      )}

      {stage === 'settings' && status && (
        <SettingsHubView
          status={status}
          onOpen={(section) => setStage(section)}
          onLocked={(next) => applyStatus(next, 'ready')}
        />
      )}

      {stage === 'server-config' && status && (
        <ServerConfigView
          status={status}
          onChanged={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'security' && status && (
        <SecurityView
          status={status}
          onChanged={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'explorer' && status && (
        <ExplorerView
          status={status}
          onChanged={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'about' && <AboutView />}

      {stage === 'address-book' && status && (
        <AddressBookView
          status={status}
          onChanged={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'daily-spend' && status && (
        <DailySpendView
          status={status}
          onChanged={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'destroy' && (
        <DestroyView
          onChanged={(next) => {
            clearPending();
            applyStatus(next, 'idle');
          }}
        />
      )}

      {stage === 'mnemonic-view' && status && (
        <RevealSecretView
          status={status}
          kind="mnemonic"
          onStatus={(next) => rememberStatus(next)}
        />
      )}

      {stage === 'private-key-view' && status && (
        <RevealSecretView
          status={status}
          kind="privateKey"
          onStatus={(next) => rememberStatus(next)}
        />
      )}
    </Shell>
  );
}
