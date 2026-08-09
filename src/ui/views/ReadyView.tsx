import { useEffect, useMemo, useState } from 'react';
import { buildExplorerTxUrl } from '../../domain/explorer';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import CopyButton from '../components/CopyButton';
import ElectrumTrustNotice from '../components/ElectrumTrustNotice';
import {
  IconLock,
  IconReceive,
  IconSend,
} from '../components/icons';
import Tabs from '../components/Tabs';
import { satsToCy, truncateHash } from '../lib/format';
import { ACTIVITY_PAGE_SIZE, paginate } from '../lib/paginate';
import { trustBanner } from '../lib/trustBanner';

type HomeTab = 'home' | 'activity';

interface Props {
  status: WalletStatus;
  onStatus: (status: WalletStatus) => void;
  onReceive: () => void;
  onSend: () => void;
}

function serverDotClass(status: WalletStatus): string {
  if (status.serverStatus === 'unconfigured') return 'unconfigured';
  if (status.serverStatus === 'error') return 'error';
  if (status.serverStatus === 'connecting') return 'connecting';
  if (status.watchActive || status.serverStatus === 'connected') return 'ok';
  return 'idle';
}

function serverLabel(status: WalletStatus): string {
  if (status.serverStatus === 'unconfigured') return 'Not configured';
  if (status.serverStatus === 'error') return 'Error';
  if (status.serverStatus === 'connecting') return 'Connecting';
  if (status.watchActive || status.serverStatus === 'connected') return 'Live';
  if (status.serverKind) return 'Idle';
  return 'Idle';
}

export default function ReadyView({
  status,
  onStatus,
  onReceive,
  onSend,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(status.error ?? null);
  const [tab, setTab] = useState<HomeTab>('home');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setError(status.error ?? null);
  }, [status.error]);

  const chainBlocked =
    status.serverStatus === 'unconfigured' ||
    status.electrumTrust === 'degraded' ||
    status.electrumTrust === 'verify_off';

  const banner = trustBanner(status);
  const confirmed = status.balance?.confirmed;
  const unconfirmed = status.balance?.unconfirmed ?? 0;
  const history = status.history ?? [];

  const paged = useMemo(
    () => paginate(history, page, ACTIVITY_PAGE_SIZE),
    [history, page]
  );

  useEffect(() => {
    if (page > paged.pageCount) setPage(paged.page);
  }, [page, paged.page, paged.pageCount]);

  const refresh = async () => {
    setError(null);
    setBusy(true);
    const res = await walletRpc({ type: 'refresh' });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.status) onStatus(res.status);
      return;
    }
    onStatus(res.status);
  };

  const lock = async () => {
    setBusy(true);
    const res = await walletRpc({ type: 'lock' });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onStatus(res.status);
  };

  const kind =
    status.serverKind === 'builtin'
      ? 'Built-in'
      : status.serverKind === 'custom'
        ? 'Custom'
        : null;

  return (
    <div className="panel ready-panel">
      <Tabs<HomeTab>
        options={[
          { value: 'home', label: 'Home' },
          { value: 'activity', label: 'Activity' },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === 'activity') setPage(1);
        }}
        disabled={busy}
      />

      {tab === 'home' && (
        <div className="stack ready-home">
          {confirmed !== undefined ? (
            <div className="balance-hero">
              <div className="balance">
                <span className="balance-amount">
                  {satsToCy(confirmed).toFixed(8)}
                </span>
                <span className="balance-unit">CY</span>
              </div>
              {unconfirmed !== 0 && (
                <p className="muted">
                  Unconfirmed {satsToCy(unconfirmed).toFixed(8)} CY
                </p>
              )}
            </div>
          ) : (
            <div className="balance-hero">
              <p className="muted">
                {chainBlocked
                  ? 'Configure Electrum to load balance.'
                  : status.serverStatus === 'connecting' || status.watchActive
                    ? 'Loading balance…'
                    : status.serverStatus === 'error'
                      ? 'Balance unavailable.'
                      : 'Waiting for Electrum…'}
              </p>
            </div>
          )}

          {status.passphraseRequired && (
            <p className="muted">Passphrase wallet</p>
          )}

          {banner && <ElectrumTrustNotice banner={banner} />}

          <div className="row ready-meta">
            <div className="server-badge">
              <span
                className={`server-dot ${serverDotClass(status)}`}
                aria-hidden
              />
              <span>
                {serverLabel(status)}
                {kind ? ` · ${kind}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="link-btn"
              disabled={busy || chainBlocked}
              onClick={() => void refresh()}
            >
              {busy ? 'Refreshing…' : 'Refresh balance'}
            </button>
          </div>

          {error &&
            status.serverStatus !== 'unconfigured' &&
            status.electrumTrust !== 'degraded' &&
            status.electrumTrust !== 'verify_off' && (
              <p className="error">{error}</p>
            )}

          <div className="stack action-stack">
            <Button
              variant="ghost"
              disabled={busy || !status.address}
              onClick={onReceive}
            >
              <IconReceive /> Receive
            </Button>
            <Button
              variant="ghost"
              disabled={busy || chainBlocked}
              onClick={onSend}
            >
              <IconSend /> Send
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void lock()}>
              <IconLock /> Lock
            </Button>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="stack ready-activity">
          {history.length === 0 ? (
            <p className="muted">
              {chainBlocked
                ? 'Configure Electrum to load activity.'
                : confirmed === undefined
                  ? status.serverStatus === 'connecting' || status.watchActive
                    ? 'Loading activity…'
                    : 'Waiting for Electrum…'
                  : 'No transactions yet.'}
            </p>
          ) : (
            <>
              <ul className="list">
                {paged.items.map((tx) => {
                  const explorerUrl = buildExplorerTxUrl(
                    status.explorerTxTemplate,
                    tx.tx_hash
                  );
                  return (
                    <li key={tx.tx_hash} className="list-row">
                      <span className="activity-row-main">
                        <span className="activity-meta">
                          {tx.height > 0 ? `#${tx.height}` : 'unconfirmed'}
                        </span>
                        {explorerUrl ? (
                          <a
                            className="activity-hash"
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={tx.tx_hash}
                          >
                            {truncateHash(tx.tx_hash)}
                          </a>
                        ) : (
                          <span className="activity-hash" title={tx.tx_hash}>
                            {truncateHash(tx.tx_hash)}
                          </span>
                        )}
                      </span>
                      <CopyButton
                        value={tx.tx_hash}
                        label="Copy"
                        ariaLabel="Copy transaction id"
                      />
                    </li>
                  );
                })}
              </ul>
              {paged.pageCount > 1 && (
                <div className="pager">
                  <Button
                    variant="secondary"
                    tiny
                    disabled={busy || paged.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="muted pager-label">
                    Page {paged.page} of {paged.pageCount}
                  </span>
                  <Button
                    variant="secondary"
                    tiny
                    disabled={busy || paged.page >= paged.pageCount}
                    onClick={() =>
                      setPage((p) => Math.min(paged.pageCount, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
