import { useState } from 'react';
import { parseExplorerTxTemplate } from '../../domain/explorer';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import Field from '../components/Field';
import InfoTip from '../components/InfoTip';

interface Props {
  status: WalletStatus;
  onChanged: (status: WalletStatus) => void;
}

export default function ExplorerView({ status, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState(status.explorerTxTemplate ?? '');

  const save = async () => {
    setError(null);
    setInfo(null);
    const trimmed = draft.trim();
    let template: string | null = null;
    if (trimmed) {
      try {
        template = parseExplorerTxTemplate(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid explorer URL');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'setExplorer', template });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setDraft(res.status.explorerTxTemplate ?? '');
      setInfo(
        res.status.explorerTxTemplate
          ? 'Explorer link saved.'
          : 'Explorer link cleared.'
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'setExplorer', template: null });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setDraft('');
      setInfo('Explorer link cleared.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="muted label-with-tip">
        Explorer tx link
        <InfoTip text="Optional. Empty by default — no hardcoded explorer. Use https://…/{txid} once. Opening a link reveals the txid to that site’s operator." />
      </p>

      <Field
        label="Tx URL template"
        value={draft}
        disabled={busy}
        onChange={setDraft}
        inputProps={{
          type: 'url',
          placeholder: 'https://explorer.example/tx/{txid}',
          autoComplete: 'off',
          spellCheck: false,
        }}
      />

      <div className="row">
        <Button busy={busy} onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="secondary"
          disabled={busy || (!draft && !status.explorerTxTemplate)}
          onClick={() => void clear()}
        >
          Clear
        </Button>
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
