import { useState } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import Check from '../components/Check';
import Field from '../components/Field';
import InfoTip from '../components/InfoTip';
import Tabs from '../components/Tabs';

interface Props {
  status: WalletStatus;
  onChanged: (status: WalletStatus) => void;
}

const AUTO_LOCK_PRESETS = ['1', '5', '10', '30', '60'] as const;

export default function SecurityView({ status, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [customLock, setCustomLock] = useState(String(status.autoLockMinutes));

  const setAutoLock = async (minutes: number) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'setAutoLock', minutes });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setCustomLock(String(res.status.autoLockMinutes));
      setInfo(`Auto-lock set to ${res.status.autoLockMinutes} min.`);
    } finally {
      setBusy(false);
    }
  };

  const setLockWhenPopupCloses = async (enabled: boolean) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({
        type: 'setLockWhenPopupCloses',
        enabled,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setInfo(
        enabled
          ? 'Closing the popup will reset the idle auto-lock countdown.'
          : 'Popup-close countdown reset disabled; idle auto-lock still applies.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="stack">
        <p className="muted label-with-tip">
          Auto-lock (minutes)
          <InfoTip text="Locks the vault after idle time using chrome.alarms (default 5 min for new installs). Re-arms after refresh, reveal, and send." />
        </p>
        <Tabs
          value={String(status.autoLockMinutes)}
          disabled={busy}
          onChange={(v) => void setAutoLock(Number(v))}
          options={AUTO_LOCK_PRESETS.map((m) => ({
            value: m,
            label: m,
          }))}
        />
        <Field
          label="Custom (1–1440)"
          value={customLock}
          disabled={busy}
          onChange={setCustomLock}
          inputProps={{ inputMode: 'numeric', autoComplete: 'off' }}
        />
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            const n = Number(customLock);
            if (!Number.isFinite(n) || n < 1 || n > 1440) {
              setError('Auto-lock must be between 1 and 1440 minutes.');
              return;
            }
            void setAutoLock(Math.floor(n));
          }}
        >
          Apply custom
        </Button>
        <Check
          checked={status.lockWhenPopupCloses}
          disabled={busy}
          tip="When the popup closes, reset the idle auto-lock countdown. Keys are not wiped immediately (Chrome permission prompts and brief focus switches must not kill the session). Default on for new installs."
          onChange={(checked) => void setLockWhenPopupCloses(checked)}
        >
          Reset idle lock when popup closes
        </Check>
      </div>

      {error && <p className="error">{error}</p>}
      {info && (
        <p className="muted" aria-live="polite">
          {info}
        </p>
      )}
    </div>
  );
}
