import { useState } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Banner from '../components/Banner';
import Button from '../components/Button';

interface Props {
  onChanged: (status: WalletStatus) => void;
}

export default function DestroyView({ onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const endSession = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'destroySession' });
      setConfirmEnd(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged(res.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <Banner tone="danger">
        End session removes the encrypted vault from this browser. Seed is not
        recoverable here afterward. If the vault is corrupt and unlock is
        impossible, ending the session is the only recovery path.
      </Banner>

      {!confirmEnd ? (
        <Button
          variant="danger"
          block
          disabled={busy}
          onClick={() => setConfirmEnd(true)}
        >
          End session
        </Button>
      ) : (
        <Banner tone="danger">
          <p>
            This cannot be undone. Terms stay accepted; Electrum settings may
            remain.
          </p>
          <div className="row">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmEnd(false)}
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
