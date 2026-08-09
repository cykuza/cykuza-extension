import { useState } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Banner from '../components/Banner';
import Button from '../components/Button';

interface Props {
  onDestroyed: (status: WalletStatus) => void;
}

/**
 * Lock-screen path when vaultCorrupt — end session without needing unlock.
 */
export default function CorruptVaultView({ onDestroyed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const endSession = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'destroySession' });
      setConfirm(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDestroyed(res.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <Banner tone="danger">
        Vault data is corrupt and cannot be unlocked. End session to clear it,
        then create or import a new one.
      </Banner>

      {!confirm ? (
        <Button
          variant="danger"
          block
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          End session
        </Button>
      ) : (
        <Banner tone="danger">
          <p>
            Confirm end session. This removes the broken vault from this
            browser.
          </p>
          <div className="row">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() => void endSession()}
            >
              {busy ? 'Ending session…' : 'Confirm end session'}
            </Button>
          </div>
        </Banner>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
