import { useCallback, useMemo, useState } from 'react';
import {
  electrumGrantHostLabel,
  type ElectrumGrantAction,
} from '../../domain/electrum/grantFlow';
import { parseWssUrl } from '../../domain/electrum/url';
import { requestHostPermission } from '../../platform/permissions';
import Button from '../components/Button';
import {
  addCustomElectrumEndpoint,
  testElectrumEndpoint,
} from '../lib/electrumEndpointActions';

type Phase =
  | 'ready'
  | 'working'
  | 'denied'
  | 'error'
  | 'added'
  | 'tested';

interface Props {
  action: ElectrumGrantAction;
  rawUrl: string;
}

/**
 * Sole chrome.permissions.request() surface for custom Electrum hosts.
 * Chrome’s Allow dialog still appears; this page stays open around it.
 */
export default function ElectrumGrantView({ action, rawUrl }: Props) {
  const parsed = useMemo(() => {
    try {
      return parseWssUrl(rawUrl);
    } catch {
      return null;
    }
  }, [rawUrl]);

  const host = parsed ? electrumGrantHostLabel(parsed) : null;
  const [phase, setPhase] = useState<Phase>(parsed ? 'ready' : 'error');
  const [detail, setDetail] = useState<string | null>(
    parsed ? null : 'Invalid Electrum URL.'
  );
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (!parsed) return;
    setBusy(true);
    setDetail(null);
    setPhase('working');
    try {
      // First await in this click — preserves MV3 user gesture for request().
      const granted = await requestHostPermission(parsed);
      if (!granted) {
        setPhase('denied');
        setDetail('Permission denied. No access was granted.');
        return;
      }

      if (action === 'add') {
        const result = await addCustomElectrumEndpoint(parsed);
        if (!result.ok) {
          setPhase('error');
          setDetail(result.error);
          return;
        }
        setPhase('added');
        setDetail(
          result.alreadyListed
            ? 'This server is already in your list.'
            : 'Server added. You can close this tab and return to Network.'
        );
        return;
      }

      const result = await testElectrumEndpoint(parsed);
      if (!result.ok) {
        setPhase('error');
        setDetail(result.error);
        return;
      }
      setPhase('tested');
      setDetail(`${result.detail}. You can close this tab.`);
    } catch (err) {
      setPhase('error');
      setDetail(
        err instanceof Error ? err.message : 'Host permission request failed'
      );
    } finally {
      setBusy(false);
    }
  }, [action, parsed]);

  const title =
    action === 'add' ? 'Add Electrum server' : 'Test Electrum server';

  return (
    <main className="grant">
      <header className="grant-header">
        <img
          className="grant-mark"
          src="/brand-mark.png"
          alt=""
          width={40}
          height={40}
        />
        <p className="grant-kicker">Cykuza Wallet</p>
        <h1 className="grant-title">{title}</h1>
      </header>

      {host && (
        <p className="grant-host mono" title={parsed ?? undefined}>
          {host}
        </p>
      )}

      {phase === 'ready' && (
        <>
          <p className="grant-lead">
            Chrome will ask to allow this extension to access that host. The
            system dialog is required by the browser — we cannot theme it — but
            this page stays open so you do not lose your place.
          </p>
          <ul className="grant-points">
            <li>Choose Allow only if you trust this Electrum server.</li>
            <li>
              The wallet uses the grant solely to connect over{' '}
              <code>wss://</code>.
            </li>
            <li>Deny leaves your server list unchanged.</li>
          </ul>
          <Button block busy={busy} onClick={() => void run()}>
            Continue with Chrome
          </Button>
        </>
      )}

      {phase === 'working' && <p className="muted">Waiting for Chrome…</p>}

      {phase === 'denied' && (
        <>
          <p className="error" role="alert">
            {detail}
          </p>
          <Button block disabled={busy} onClick={() => void run()}>
            Try again
          </Button>
        </>
      )}

      {(phase === 'error' || phase === 'added' || phase === 'tested') && (
        <>
          {detail && (
            <p
              className={phase === 'error' ? 'error' : 'grant-success'}
              role={phase === 'error' ? 'alert' : 'status'}
            >
              {detail}
            </p>
          )}
          {phase === 'error' && parsed && (
            <Button block disabled={busy} onClick={() => void run()}>
              Try again
            </Button>
          )}
        </>
      )}

      <p className="grant-foot muted">
        Already allowed this host? Continue still works — Chrome will not ask
        again.
      </p>
    </main>
  );
}
