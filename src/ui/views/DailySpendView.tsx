import { useState } from 'react';
import { walletRpc } from '../../messaging/client';
import type { WalletStatus } from '../../messaging/protocol';
import Button from '../components/Button';
import Field from '../components/Field';
import InfoTip from '../components/InfoTip';
import { cyToSats, formatSats, satsToCy } from '../lib/format';

interface Props {
  status: WalletStatus;
  onChanged: (status: WalletStatus) => void;
}

export default function DailySpendView({ status, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState(
    status.dailySpendLimitSats != null
      ? String(satsToCy(status.dailySpendLimitSats))
      : ''
  );

  const save = async () => {
    setError(null);
    setInfo(null);
    const trimmed = draft.trim();
    let limitSats: number | null = null;
    if (trimmed) {
      const cy = Number(trimmed);
      if (!Number.isFinite(cy) || cy < 0) {
        setError('Enter a non-negative CY amount, or leave empty to disable.');
        return;
      }
      if (cy === 0) {
        limitSats = null;
      } else {
        limitSats = cyToSats(cy);
        if (limitSats <= 0) {
          setError('Limit is too small.');
          return;
        }
      }
    }
    setBusy(true);
    try {
      const res = await walletRpc({ type: 'setDailySpendLimit', limitSats });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setDraft(
        res.status.dailySpendLimitSats != null
          ? String(satsToCy(res.status.dailySpendLimitSats))
          : ''
      );
      setInfo(
        limitSats === null
          ? 'Daily spend limit disabled.'
          : 'Daily spend limit saved.'
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setDraft('');
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await walletRpc({
        type: 'setDailySpendLimit',
        limitSats: null,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onChanged(res.status);
        return;
      }
      onChanged(res.status);
      setInfo('Daily spend limit disabled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="muted label-with-tip">
        Daily spend limit
        <InfoTip text="Optional soft cap on total wallet debit per local calendar day. Exceeding it on Send requires an explicit allow-once with your password. Enforced locally only — not telemetry. Leave empty to disable." />
      </p>

      {status.dailySpendLimitSats != null && (
        <p className="muted">
          Used today: {formatSats(status.dailySpendUsedSats ?? 0)} of{' '}
          {formatSats(status.dailySpendLimitSats)}
        </p>
      )}

      <Field
        label="Limit (CY)"
        value={draft}
        disabled={busy}
        onChange={(v) => {
          setDraft(v);
          setInfo(null);
        }}
        inputProps={{
          inputMode: 'decimal',
          placeholder: 'Disabled',
          autoComplete: 'off',
        }}
      />

      <div className="row">
        <Button busy={busy} onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="secondary"
          disabled={busy || status.dailySpendLimitSats == null}
          onClick={() => void disable()}
        >
          Disable
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
