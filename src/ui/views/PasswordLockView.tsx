import { useEffect, useState } from 'react';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import PasswordField from '../components/PasswordField';
import { networkLabel } from '../lib/format';

interface Props {
  status: WalletStatus;
  onUnlock: (password: string, passphrase?: string) => Promise<void>;
}

export default function PasswordLockView({ status, onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(
    status.lockoutUntil ?? null
  );
  const [remaining, setRemaining] = useState(status.remainingAttempts);

  const needsPassphrase = status.passphraseRequired === true;
  const lockedOut =
    lockoutUntil !== null && Date.now() < lockoutUntil;

  useEffect(() => {
    return () => {
      setPassword('');
      setPassphrase('');
    };
  }, []);

  useEffect(() => {
    if (status.error) {
      setError(status.error);
    }
  }, [status.error]);

  const submit = async () => {
    setError(null);
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (needsPassphrase && !passphrase) {
      setError('Enter your BIP39 passphrase.');
      return;
    }
    setBusy(true);
    try {
      await onUnlock(password, needsPassphrase ? passphrase : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unlock failed';
      setError(message);
      const maybe = err as {
        lockoutUntil?: number | null;
        remainingAttempts?: number;
      };
      if (maybe.lockoutUntil != null) setLockoutUntil(maybe.lockoutUntil);
      if (maybe.remainingAttempts !== undefined) {
        setRemaining(maybe.remainingAttempts);
      }
    } finally {
      setPassword('');
      setPassphrase('');
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="card">
        <div className="stack">
          <p className="muted">
            Vault present · {networkLabel(status.network)}
            {needsPassphrase ? ' · Passphrase wallet' : ''}
            {remaining !== undefined && !lockedOut
              ? ` · ${remaining} attempt${remaining === 1 ? '' : 's'} left`
              : ''}
          </p>
          {lockedOut && (
            <p className="error" role="alert">
              Locked out until {new Date(lockoutUntil!).toLocaleTimeString()}.
            </p>
          )}
          <PasswordField
            value={password}
            onChange={setPassword}
            disabled={lockedOut || busy}
            onEnter={() => void submit()}
          />
          {needsPassphrase && (
            <>
              <p className="muted">BIP39 passphrase (not your vault password).</p>
              <PasswordField
                label="BIP39 passphrase"
                value={passphrase}
                onChange={setPassphrase}
                autoComplete="off"
                disabled={lockedOut || busy}
                onEnter={() => void submit()}
              />
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <Button
            block
            disabled={lockedOut}
            busy={busy}
            onClick={() => void submit()}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
          <p className="muted">
            Locks after {status.autoLockMinutes} min idle
            {status.lockWhenPopupCloses
              ? ' · closing the popup resets that countdown'
              : ''}
            .
          </p>
        </div>
      </div>
    </div>
  );
}
