import { useState, type ReactNode } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import type { WalletStage } from '../stages';
import Banner from '../components/Banner';
import { IconChevron, IconLock, IconPower } from '../components/icons';

export type SettingsSection = Extract<
  WalletStage,
  | 'server-config'
  | 'mnemonic-view'
  | 'private-key-view'
  | 'address-book'
  | 'daily-spend'
  | 'security'
  | 'explorer'
  | 'about'
  | 'destroy'
>;

interface Props {
  status: WalletStatus;
  onOpen: (section: SettingsSection) => void;
  onLocked: (status: WalletStatus) => void;
}

function SettingsRow({
  label,
  onClick,
  disabled,
  danger,
  leading,
  showChevron = true,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  leading?: ReactNode;
  showChevron?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? 'settings-row danger' : 'settings-row'}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="settings-row-label">
        {leading}
        {label}
      </span>
      {showChevron ? <IconChevron /> : <span className="settings-row-spacer" />}
    </button>
  );
}

/**
 * Settings hub — same button list / drill-in pattern as cykuza-web.
 * Each row opens its own stage; chrome Back returns here.
 */
export default function SettingsHubView({
  status,
  onOpen,
  onLocked,
}: Props) {
  const pkOnly = status.secretKind === 'privateKey';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lock = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'lock' });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onLocked(res.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      {status.vaultCorrupt === true && (
        <Banner tone="danger">
          Vault data is corrupt. Open End session to start over — create and
          import are blocked until then.
        </Banner>
      )}

      <nav className="settings-list" aria-label="Wallet settings">
        <SettingsRow
          label="Network"
          onClick={() => onOpen('server-config')}
        />
        <SettingsRow
          label="Show Mnemonic"
          disabled={pkOnly || busy}
          onClick={() => onOpen('mnemonic-view')}
        />
        <SettingsRow
          label="Show Private Key"
          disabled={busy}
          onClick={() => onOpen('private-key-view')}
        />
        <SettingsRow
          label="Address book"
          disabled={busy}
          onClick={() => onOpen('address-book')}
        />
        <SettingsRow
          label="Daily spend limit"
          disabled={busy}
          onClick={() => onOpen('daily-spend')}
        />
        <SettingsRow
          label="Security"
          disabled={busy}
          onClick={() => onOpen('security')}
        />
        <SettingsRow
          label="Explorer"
          onClick={() => onOpen('explorer')}
        />
        <SettingsRow label="About" onClick={() => onOpen('about')} />
        <SettingsRow
          label="Lock"
          danger
          disabled={busy}
          showChevron={false}
          leading={<IconLock />}
          onClick={() => void lock()}
        />
        <SettingsRow
          label="End session"
          danger
          disabled={busy}
          showChevron={false}
          leading={<IconPower />}
          onClick={() => onOpen('destroy')}
        />
      </nav>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
