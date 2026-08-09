import { useState } from 'react';
import { parseWssUrl } from '../../domain/electrum/url';
import {
  BUILTIN_ELECTRUM_RISK_MESSAGE,
  SELF_HOST_ELECTRUM_CTA,
  SELF_HOST_ELECTRUM_GUIDE,
} from '../../domain/electrum/selfHost';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import {
  openElectrumGrantPage,
  openExtensionPage,
} from '../../platform/openExtensionPage';
import { hasHostPermission } from '../../platform/permissions';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Check from '../components/Check';
import CopyButton from '../components/CopyButton';
import Field from '../components/Field';
import Tabs from '../components/Tabs';
import {
  addCustomElectrumEndpoint,
  testElectrumEndpoint,
} from '../lib/electrumEndpointActions';
import { networkLabel } from '../lib/format';
import { maskWssUrl } from '../lib/mask';
import { usesBuiltinElectrum } from '../lib/trustBanner';

interface Props {
  status: WalletStatus;
  onChanged: (status: WalletStatus) => void;
}

type EndpointView = { kind: 'default' | 'custom'; url: string };

export default function ServerConfigView({ status, onChanged }: Props) {
  const electrum = status.electrum;
  const network = status.network;
  const endpoints: EndpointView[] = electrum?.endpoints ?? [];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [confirmNetwork, setConfirmNetwork] = useState<
    'mainnet' | 'testnet' | null
  >(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);
  const [showFullUrls, setShowFullUrls] = useState(false);

  const configured = electrum?.configured ?? endpoints.length > 0;
  const activeUrl = electrum?.activeUrl ?? null;
  const activeKind =
    status.serverKind ??
    (activeUrl
      ? endpoints.find((e) => e.url === activeUrl)?.kind === 'custom'
        ? 'custom'
        : endpoints.find((e) => e.url === activeUrl)
          ? 'builtin'
          : null
      : null);

  const displayUrl = (url: string) => (showFullUrls ? url : maskWssUrl(url));

  const persistEndpoints = async (next: EndpointView[]) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({
        type: 'setElectrumConfig',
        network,
        endpoints: next,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return false;
      }
      onChanged(res.status);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const addServer = async () => {
    setError(null);
    setInfo(null);
    const trimmed = newUrl.trim();
    if (!trimmed) {
      setError('Enter a wss:// Electrum URL');
      return;
    }

    let url: string;
    try {
      url = parseWssUrl(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL');
      return;
    }

    if (endpoints.some((e) => e.url === url)) {
      setError('Server already in the list');
      return;
    }

    setBusy(true);
    try {
      if (!(await hasHostPermission(url))) {
        openElectrumGrantPage({ action: 'add', url });
        setInfo(
          'Continue in the Cykuza tab that opened — Chrome will ask for host access there.'
        );
        return;
      }

      const result = await addCustomElectrumEndpoint(url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.alreadyListed) {
        setInfo('Server already in the list.');
        return;
      }
      const statusRes = await walletRpc({ type: 'getStatus' });
      if (statusRes.ok) onChanged(statusRes.status);
      setNewUrl('');
    } finally {
      setBusy(false);
    }
  };

  const removeServer = async (url: string) => {
    await persistEndpoints(endpoints.filter((e) => e.url !== url));
  };

  const moveServer = async (url: string, direction: 'up' | 'down') => {
    const index = endpoints.findIndex((e) => e.url === url);
    if (index < 0) return;
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= endpoints.length) return;
    const next = [...endpoints];
    const tmp = next[index]!;
    next[index] = next[swapWith]!;
    next[swapWith] = tmp;
    await persistEndpoints(next);
  };

  const testConnection = async (rawUrl: string) => {
    setError(null);
    setInfo(null);

    let url: string;
    try {
      url = parseWssUrl(rawUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL');
      return;
    }

    setTestTarget(url);
    setBusy(true);

    try {
      if (!(await hasHostPermission(url))) {
        openElectrumGrantPage({ action: 'test', url });
        setInfo(
          'Continue in the Cykuza tab that opened — Chrome will ask for host access there.'
        );
        return;
      }

      const result = await testElectrumEndpoint(url);
      if (!result.ok) {
        setError(result.error);
        const statusRes = await walletRpc({ type: 'getStatus' });
        if (statusRes.ok) onChanged(statusRes.status);
        return;
      }
      const statusRes = await walletRpc({ type: 'getStatus' });
      if (statusRes.ok) onChanged(statusRes.status);
      setInfo(result.detail);
    } finally {
      setBusy(false);
      setTestTarget(null);
    }
  };

  const switchNetwork = async (next: 'mainnet' | 'testnet') => {
    setConfirmNetwork(null);
    if (next === network) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'setNetwork', network: next });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      if (res.status.serverStatus === 'unconfigured') {
        setInfo(
          `Switched to ${networkLabel(next)}. Add a custom wss:// Electrum server to connect.`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const setVerifyWithSecondServer = async (enabled: boolean) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({
        type: 'setVerifyWithSecondServer',
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
          ? 'Refresh will cross-check balance with a second permitted server when available.'
          : 'Second-server verify disabled; Refresh uses a single Electrum server.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="stack">
        <p className="muted">Network</p>
        <Tabs
          value={network}
          disabled={busy}
          onChange={(next) => {
            if (next === network) return;
            setConfirmNetwork(next);
          }}
          options={[
            { value: 'mainnet', label: 'Mainnet' },
            { value: 'testnet', label: 'Testnet' },
          ]}
        />
      </div>

      {confirmNetwork && (
        <Banner tone="danger">
          <p>
            Switching network changes your receive address (same seed, different
            chain params). Continue to {networkLabel(confirmNetwork)}?
          </p>
          <div className="row">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmNetwork(null)}
            >
              Cancel
            </Button>
            <Button
              busy={busy}
              onClick={() => void switchNetwork(confirmNetwork)}
            >
              Switch to {networkLabel(confirmNetwork)}
            </Button>
          </div>
        </Banner>
      )}

      {!configured && (
        <Banner tone="danger">
          <p>
            {network === 'testnet'
              ? 'Testnet has no official Electrum servers. Add a custom wss:// endpoint below. The wallet will not fall back to mainnet.'
              : 'No Electrum endpoints configured for this build. Add a custom wss:// endpoint below.'}
          </p>
          <p>
            <button
              type="button"
              className="text-link"
              onClick={() => openExtensionPage(SELF_HOST_ELECTRUM_GUIDE)}
            >
              {SELF_HOST_ELECTRUM_CTA}
            </button>
          </p>
        </Banner>
      )}

      {configured && usesBuiltinElectrum(status) && (
        <Banner tone="warn">
          <p>{BUILTIN_ELECTRUM_RISK_MESSAGE}</p>
          <p>
            Add your own <code>wss://</code> below and remove built-in hosts when
            ready.{' '}
            <button
              type="button"
              className="text-link"
              onClick={() => openExtensionPage(SELF_HOST_ELECTRUM_GUIDE)}
            >
              {SELF_HOST_ELECTRUM_CTA}
            </button>
          </p>
        </Banner>
      )}

      <div className="meta">
        <div>
          <span>Active server</span>
          <span>
            {activeKind === 'custom'
              ? 'Custom'
              : activeKind === 'builtin'
                ? 'Built-in'
                : '—'}
          </span>
        </div>
        <div>
          <span>Status</span>
          <span>{status.serverStatus ?? 'idle'}</span>
        </div>
      </div>

      <div className="stack">
        <div className="row">
          <p className="muted flex-1">Electrum servers (failover order)</p>
          {endpoints.length > 0 && (
            <Button
              variant="secondary"
              tiny
              disabled={busy}
              aria-pressed={showFullUrls}
              onClick={() => setShowFullUrls((v) => !v)}
            >
              {showFullUrls ? 'Hide URLs' : 'Show full URLs'}
            </Button>
          )}
        </div>
        {endpoints.length === 0 ? (
          <p className="muted">No servers configured.</p>
        ) : (
          <ul className="list">
            {endpoints.map((ep, index) => (
              <li key={ep.url} className="list-row wrap">
                <div className="flex-1">
                  <span className="muted">{ep.kind}</span>
                  {' · '}
                  <span className="mono">{displayUrl(ep.url)}</span>
                  {activeUrl === ep.url && (
                    <span className="muted"> · active</span>
                  )}
                </div>
                <div className="row">
                  <Button
                    variant="secondary"
                    tiny
                    disabled={busy || index === 0}
                    onClick={() => void moveServer(ep.url, 'up')}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    tiny
                    disabled={busy || index === endpoints.length - 1}
                    onClick={() => void moveServer(ep.url, 'down')}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <CopyButton
                    value={ep.url}
                    label="Copy"
                    ariaLabel="Copy server URL"
                    disabled={busy}
                  />
                  <Button
                    variant="secondary"
                    tiny
                    disabled={busy || testTarget === ep.url}
                    onClick={() => void testConnection(ep.url)}
                  >
                    {testTarget === ep.url ? 'Testing…' : 'Test'}
                  </Button>
                  <Button
                    variant="danger"
                    tiny
                    disabled={busy}
                    onClick={() => void removeServer(ep.url)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field
        label="Add custom wss:// server"
        value={newUrl}
        mono
        disabled={busy}
        onChange={setNewUrl}
        inputProps={{
          type: 'url',
          placeholder: 'wss://host:50004',
          autoComplete: 'off',
          spellCheck: false,
        }}
      />
      <p className="muted">
        Use TLS-secured endpoints you trust. Avoid unsecured ws:// to reduce
        MITM risk. First-time access opens a Cykuza tab where Chrome asks for
        host permission — that system dialog cannot be themed, but the tab stays
        open so you keep your place.
      </p>

      <div className="row">
        <Button busy={busy} onClick={() => void addServer()}>
          Add server
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !newUrl.trim()}
          onClick={() => void testConnection(newUrl.trim())}
        >
          {testTarget && testTarget === parseSafe(newUrl.trim())
            ? 'Testing…'
            : 'Test connection'}
        </Button>
      </div>

      <Check
        checked={status.verifyWithSecondServer !== false}
        disabled={busy || endpoints.length < 2}
        tip="When two or more Electrum endpoints are configured, Refresh, preview, and broadcast cross-check a second permitted server. Required with ≥2 endpoints."
        onChange={(checked) => void setVerifyWithSecondServer(checked)}
      >
        Verify with second server
      </Check>
      {endpoints.length < 2 && (
        <p className="muted">
          With one endpoint, dual-server verify does not apply. Add a second
          Electrum host to require cross-checks on Refresh, preview, and
          broadcast.
        </p>
      )}
      {endpoints.length >= 2 && status.verifyWithSecondServer === false && (
        <p className="error">
          Required when two or more endpoints are configured. Refresh and Send
          stay blocked until verify is enabled.
        </p>
      )}
      {status.electrumTrust === 'degraded' && (
        <p className="error">
          Dual-server verify needs two permitted Electrum hosts. Grant host
          access for each custom server — Refresh and Send are blocked until
          then.
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {info && (
        <p className="muted" aria-live="polite">
          {info}
        </p>
      )}
    </div>
  );
}

function parseSafe(raw: string): string | null {
  try {
    return parseWssUrl(raw);
  } catch {
    return null;
  }
}
