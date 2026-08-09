import { useEffect, useRef, useState } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Banner from '../components/Banner';
import Button from '../components/Button';
import CopyButton from '../components/CopyButton';
import PasswordField from '../components/PasswordField';

interface Props {
  status: WalletStatus;
  onStatus: (status: WalletStatus) => void;
  kind: 'mnemonic' | 'privateKey';
}

const AUTO_CLEAR_MS = 60_000;

/**
 * Password gate then revealSecret RPC. Secret auto-hides after 60s.
 */
export default function RevealSecretView({ status, onStatus, kind }: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const timerRef = useRef<number | null>(null);

  const title =
    kind === 'mnemonic' ? 'Show mnemonic' : 'Show private key (WIF)';

  useEffect(() => {
    return () => {
      setPassword('');
      setSecret(null);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!secret) return;
    setSecondsLeft(60);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((AUTO_CLEAR_MS - (Date.now() - started)) / 1000)
      );
      setSecondsLeft(left);
      if (left <= 0) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setSecret(null);
      }
    }, 250);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [secret]);

  const submitPassword = async () => {
    setError(null);
    if (!password) {
      setError('Enter your password.');
      return;
    }
    if (kind === 'mnemonic' && status.secretKind === 'privateKey') {
      setError('Mnemonic is not available for private-key wallets.');
      return;
    }
    setBusy(true);
    const pw = password;
    setPassword('');
    try {
      const res = await walletRpc({
        type: 'revealSecret',
        password: pw,
        kind,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onStatus(res.status);
        return;
      }
      if (res.status) onStatus(res.status);
      if (!res.secret) {
        setError('Reveal succeeded but no secret was returned.');
        return;
      }
      setSecret(res.secret);
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSecret(null);
    setError(null);
  };

  if (secret) {
    return (
      <div className="panel">
        <Banner tone="danger">
          Anyone with this secret can spend your funds. Hide it when finished.
        </Banner>
        {kind === 'mnemonic' ? (
          <ol className="mnemonic-grid">
            {secret.split(/\s+/).map((word, i) => (
              <li key={`${i}-${word}`}>
                <span className="mnemonic-index">{i + 1}.</span> {word}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mono card break-all">{secret}</p>
        )}
        <div className="row">
          <CopyButton
            value={secret}
            autoClearMs={AUTO_CLEAR_MS}
            label="Copy"
            ariaLabel={
              kind === 'mnemonic' ? 'Copy mnemonic' : 'Copy private key'
            }
          />
          <Button variant="secondary" onClick={hide}>
            Hide
          </Button>
        </div>
        <p className="muted">
          Auto-hides in {secondsLeft}s. Clipboard clears after 60s while this
          popup stays open.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="muted">
        Enter your vault password to reveal your {title.toLowerCase()}.
      </p>
      {kind === 'mnemonic' && status.secretKind === 'privateKey' && (
        <Banner>
          This wallet was imported from a private key. No mnemonic is available.
        </Banner>
      )}
      <PasswordField
        value={password}
        onChange={setPassword}
        disabled={busy || (kind === 'mnemonic' && status.secretKind === 'privateKey')}
        onEnter={() => void submitPassword()}
      />
      {error && <p className="error">{error}</p>}
      <Button
        block
        busy={busy}
        disabled={kind === 'mnemonic' && status.secretKind === 'privateKey'}
        onClick={() => void submitPassword()}
      >
        {busy ? 'Checking…' : 'Reveal'}
      </Button>
    </div>
  );
}
