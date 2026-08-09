import { useState } from 'react';
import { DEFAULT_ELECTRUM_MAINNET } from '../../domain/electrum/defaults';
import {
  SELF_HOST_ELECTRUM_CTA,
  SELF_HOST_ELECTRUM_GUIDE,
} from '../../domain/electrum/selfHost';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import { openExtensionPage } from '../../platform/openExtensionPage';
import Button from '../components/Button';
import Check from '../components/Check';

interface Props {
  onAccepted: (status: WalletStatus) => void;
}

/**
 * First-run Terms screen. Create / Import stay locked until the user
 * explicitly agrees (checkbox + Continue).
 */
export default function TermsView({ onAccepted }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBuiltinDefaults = DEFAULT_ELECTRUM_MAINNET.length > 0;

  const accept = async () => {
    if (!agreed) return;
    setError(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'acceptTerms' });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onAccepted(res.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="terms" aria-labelledby="terms-title">
      <header className="terms-header">
        <p className="terms-kicker">Before you begin</p>
        <h2 id="terms-title" className="terms-title">
          Terms
        </h2>
        <p className="terms-lead">
          Agree to continue. Then you can create a new wallet or import an
          existing one.
        </p>
      </header>

      <div className="terms-body">
        <p>
          Cykuza is a non-custodial browser wallet. While unlocked, keys live in
          this extension's process memory. You alone are responsible for offline
          backups and for verifying every transaction.
        </p>
        <ul>
          <li>Do not use this wallet as long-term cold storage.</li>
          <li>Connect only to Electrum servers you trust (wss://).</li>
          {hasBuiltinDefaults ? (
            <li>
              This build includes shared Electrum defaults for convenience. Those
              servers can see your addresses and may lie about balances — prefer
              your own server.
            </li>
          ) : (
            <li>
              This build has no official Electrum defaults. Add a wss:// server
              you trust in Settings before Refresh or Send.
            </li>
          )}
          <li>
            Never share or paste your seed on a website. v1 has no dApp provider.
          </li>
          <li>A lost password or seed cannot be recovered by anyone.</li>
        </ul>
        <p>
          <button
            type="button"
            className="text-link"
            data-stage-focus-skip
            onClick={() => openExtensionPage(SELF_HOST_ELECTRUM_GUIDE)}
          >
            {SELF_HOST_ELECTRUM_CTA}
          </button>
        </p>
      </div>

      <footer className="terms-footer">
        <Check checked={agreed} onChange={setAgreed} disabled={busy}>
          I have read and agree to these terms
        </Check>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button
          block
          busy={busy}
          disabled={!agreed}
          onClick={() => void accept()}
        >
          Continue
        </Button>
      </footer>
    </section>
  );
}
