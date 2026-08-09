import { useCallback, useEffect, useRef, useState } from 'react';
import { sendErrorClearsConfirmation } from '../../domain/errors';
import { buildExplorerTxUrl } from '../../domain/explorer';
import { ADDRESS_CONFIRM_SUFFIX_LENGTH } from '../../domain/limits';
import { walletRpc } from '../../messaging/client';
import type {
  SendConfirmation,
  SendEstimate,
  WalletStatus,
} from '../../messaging/protocol';
import Button from '../components/Button';
import Check from '../components/Check';
import CopyButton from '../components/CopyButton';
import ElectrumTrustNotice from '../components/ElectrumTrustNotice';
import Field from '../components/Field';
import PasswordField from '../components/PasswordField';
import Tabs from '../components/Tabs';
import {
  cyToSats,
  formatSats,
  networkLabel,
  truncateAddress,
} from '../lib/format';
import { trustBanner } from '../lib/trustBanner';

interface Props {
  status: WalletStatus;
  onStatus: (status: WalletStatus) => void;
  onSent: (status: WalletStatus) => void;
  onInternalBack?: (handler: (() => void) | null) => void;
}

type FeePreset = 'slow' | 'standard' | 'custom';

type Step =
  | { name: 'form' }
  | {
      name: 'confirm';
      confirmation: SendConfirmation;
      token: string;
    }
  | { name: 'done'; txid: string; status: WalletStatus };

/**
 * Form → preview → confirm (suffix / spend limit / large send / password) → done.
 * Live estimates use cached UTXOs; password stays ephemeral.
 */
export default function SendView({
  status,
  onStatus,
  onSent,
  onInternalBack,
}: Props) {
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [to, setTo] = useState('');
  const [amountCy, setAmountCy] = useState('');
  const [includeFee, setIncludeFee] = useState(false);
  const [preset, setPreset] = useState<FeePreset>('standard');
  const [customFeeRate, setCustomFeeRate] = useState('');
  const [password, setPassword] = useState('');
  const [toConfirmSuffix, setToConfirmSuffix] = useState('');
  const [allowSpendLimitOnce, setAllowSpendLimitOnce] = useState(false);
  const [acknowledgeLargeSend, setAcknowledgeLargeSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<SendEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const feeRates = status.feeRates;
  const bookEntries = (status.addressBook ?? []).filter(
    (e) => e.network === status.network
  );
  const banner = trustBanner(status);

  const resolvedFeeRate = ((): number | null => {
    if (preset === 'slow') return feeRates?.slow ?? null;
    if (preset === 'standard') return feeRates?.standard ?? null;
    const n = Number(customFeeRate);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.ceil(n);
  })();

  // Warm UTXO / fee cache when missing.
  useEffect(() => {
    if (status.utxoCount !== undefined) return;
    if (status.serverStatus === 'unconfigured') return;
    let cancelled = false;
    setRefreshing(true);
    void (async () => {
      try {
        const res = await walletRpc({ type: 'refresh' });
        if (cancelled) return;
        if (res.ok) {
          onStatusRef.current(res.status);
        } else if (res.status) {
          onStatusRef.current(res.status);
          setError(res.error);
        } else {
          setError(res.error);
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status.utxoCount, status.serverStatus]);

  // Debounced live estimate from cached UTXOs.
  useEffect(() => {
    if (step.name !== 'form') return;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    const amount = Number(amountCy);
    const amountSats =
      Number.isFinite(amount) && amount > 0 ? cyToSats(amount) : 0;

    if (amountSats <= 0 || resolvedFeeRate === null) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      void walletRpc({
        type: 'estimateSend',
        to: to.trim() || undefined,
        amountSats,
        includeFee,
        feeRate: resolvedFeeRate,
      }).then((res) => {
        if (!res.ok) {
          setEstimate(null);
          setEstimateError(res.error);
          if (res.status) onStatusRef.current(res.status);
          return;
        }
        setEstimateError(null);
        setEstimate(res.estimate ?? null);
        if (res.status) onStatusRef.current(res.status);
      });
    }, 300);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [amountCy, to, includeFee, resolvedFeeRate, step.name]);

  useEffect(() => {
    return () => {
      setPassword('');
      setToConfirmSuffix('');
    };
  }, []);

  const cancelConfirm = useCallback(() => {
    setPassword('');
    setToConfirmSuffix('');
    setAllowSpendLimitOnce(false);
    setAcknowledgeLargeSend(false);
    setError(null);
    setStep({ name: 'form' });
  }, []);

  useEffect(() => {
    if (!onInternalBack) return;
    if (step.name === 'confirm') {
      onInternalBack(cancelConfirm);
    } else {
      onInternalBack(null);
    }
    return () => onInternalBack(null);
  }, [step.name, onInternalBack, cancelConfirm]);

  const preview = async () => {
    setError(null);
    const trimmed = to.trim();
    if (!trimmed) {
      setError('Enter a recipient address.');
      return;
    }
    const amount = Number(amountCy);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    const amountSats = cyToSats(amount);
    if (amountSats <= 0) {
      setError('Amount is too small.');
      return;
    }
    if (resolvedFeeRate === null) {
      setError('Choose a valid fee rate (≥ 1 sat/vB).');
      return;
    }

    setBusy(true);
    try {
      const res = await walletRpc({
        type: 'previewSend',
        to: trimmed,
        amountSats,
        includeFee,
        feeRate: resolvedFeeRate,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onStatus(res.status);
        return;
      }
      if (res.status) onStatus(res.status);
      if (!res.confirmation || !res.confirmationToken) {
        setError('Preview succeeded but confirmation was not returned.');
        return;
      }
      setToConfirmSuffix('');
      setAllowSpendLimitOnce(false);
      setAcknowledgeLargeSend(false);
      setStep({
        name: 'confirm',
        confirmation: res.confirmation,
        token: res.confirmationToken,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmSend = async () => {
    if (step.name !== 'confirm') return;
    setError(null);
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    if (toConfirmSuffix.length < ADDRESS_CONFIRM_SUFFIX_LENGTH) {
      setError(
        `Re-type the last ${ADDRESS_CONFIRM_SUFFIX_LENGTH} characters of the recipient address.`
      );
      return;
    }
    if (step.confirmation.spendLimitExceeded && !allowSpendLimitOnce) {
      setError('Allow exceeding the daily spend limit once to continue.');
      return;
    }
    if (step.confirmation.largeSend && !acknowledgeLargeSend) {
      setError('Acknowledge the large-send warning to continue.');
      return;
    }

    setBusy(true);
    const token = step.token;
    const pw = password;
    const suffix = toConfirmSuffix;
    const allowOnce = allowSpendLimitOnce;
    const ackLarge = acknowledgeLargeSend;
    setPassword('');
    try {
      const res = await walletRpc({
        type: 'send',
        confirmationToken: token,
        password: pw,
        toConfirmSuffix: suffix,
        allowSpendLimitOnce: allowOnce || undefined,
        acknowledgeLargeSend: ackLarge || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.status) onStatus(res.status);
        if (sendErrorClearsConfirmation(res.error)) {
          setStep({ name: 'form' });
          setToConfirmSuffix('');
          setAllowSpendLimitOnce(false);
          setAcknowledgeLargeSend(false);
        }
        return;
      }
      if (!res.txid) {
        setError('Send succeeded but txid was not returned.');
        return;
      }
      setStep({ name: 'done', txid: res.txid, status: res.status });
    } finally {
      setBusy(false);
    }
  };

  if (step.name === 'done') {
    const explorerUrl = buildExplorerTxUrl(
      step.status.explorerTxTemplate ?? status.explorerTxTemplate,
      step.txid
    );
    return (
      <div className="panel">
        <p className="muted">Transaction broadcast successfully.</p>
        <div className="card">
          <p className="muted">Transaction ID</p>
          <p className="mono break-all">
            {step.txid}
          </p>
          <div className="row mt-2">
            <CopyButton
              value={step.txid}
              label="Copy"
              ariaLabel="Copy transaction id"
            />
          </div>
        </div>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noreferrer noopener">
            View in explorer
          </a>
        )}
        <Button block onClick={() => onSent(step.status)}>
          Done
        </Button>
      </div>
    );
  }

  if (step.name === 'confirm') {
    const c = step.confirmation;
    const canConfirm =
      !!password &&
      toConfirmSuffix.length >= ADDRESS_CONFIRM_SUFFIX_LENGTH &&
      (!c.spendLimitExceeded || allowSpendLimitOnce) &&
      (!c.largeSend || acknowledgeLargeSend) &&
      !busy;

    return (
      <div className="panel">
        <p className="muted">
          Review amounts, confirm the last {ADDRESS_CONFIRM_SUFFIX_LENGTH}{' '}
          characters of the recipient, then enter your password.
        </p>

        <div className="meta">
          <div>
            <span>To</span>
            <span className="mono mono-sm">
              {c.to}
            </span>
          </div>
          <div>
            <span>Match</span>
            <span className="mono">{truncateAddress(c.to)}</span>
          </div>
          <div>
            <span>Recipient gets</span>
            <span>{formatSats(c.amountSats)}</span>
          </div>
          <div>
            <span>Network fee</span>
            <span>{formatSats(c.fee)}</span>
          </div>
          <div>
            <span>Total debit</span>
            <span>{formatSats(c.total)}</span>
          </div>
          <div>
            <span>Fee mode</span>
            <span>{c.includeFee ? 'Included in amount' : 'Added on top'}</span>
          </div>
        </div>

        {c.spendLimitExceeded && (
          <Check
            checked={allowSpendLimitOnce}
            disabled={busy}
            onChange={setAllowSpendLimitOnce}
          >
            Allow exceeding the daily spend limit once
            {c.dailySpendRemainingSats != null
              ? ` (remaining before this send: ${formatSats(c.dailySpendRemainingSats)})`
              : ''}
          </Check>
        )}

        {c.largeSend && (
          <Check
            checked={acknowledgeLargeSend}
            disabled={busy}
            onChange={setAcknowledgeLargeSend}
          >
            I understand this send is more than half of my confirmed balance
          </Check>
        )}

        <Field
          label={`Last ${ADDRESS_CONFIRM_SUFFIX_LENGTH} characters of recipient`}
          value={toConfirmSuffix}
          mono
          disabled={busy}
          onChange={(v) =>
            setToConfirmSuffix(v.slice(-ADDRESS_CONFIRM_SUFFIX_LENGTH))
          }
          inputProps={{
            autoComplete: 'off',
            spellCheck: false,
            maxLength: ADDRESS_CONFIRM_SUFFIX_LENGTH,
          }}
        />

        <PasswordField
          value={password}
          onChange={setPassword}
          disabled={busy}
          onEnter={() => void confirmSend()}
        />

        {error && <p className="error">{error}</p>}

        <Button
          block
          busy={busy}
          disabled={!canConfirm}
          onClick={() => void confirmSend()}
        >
          {busy ? 'Sending…' : 'Confirm & send'}
        </Button>
      </div>
    );
  }

  const canContinue =
    !!to.trim() &&
    Number(amountCy) > 0 &&
    resolvedFeeRate !== null &&
    !estimateError &&
    !busy &&
    !refreshing;

  return (
    <div className="panel">
      {banner && <ElectrumTrustNotice banner={banner} />}

      <p className="muted">
        Network: {networkLabel(status.network)}
        {status.balance
          ? ` · Confirmed ${formatSats(status.balance.confirmed)}`
          : ''}
        {status.dailySpendLimitSats != null
          ? ` · Daily limit ${formatSats(status.dailySpendUsedSats ?? 0)} / ${formatSats(status.dailySpendLimitSats)}`
          : ''}
        {refreshing ? ' · Loading UTXOs…' : ''}
      </p>

      <div className="amount-hero">
        <label className="muted" htmlFor="send-amount">
          Amount (CY)
        </label>
        <input
          id="send-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00000000"
          value={amountCy}
          disabled={busy}
          onChange={(e) => setAmountCy(e.target.value.replace(/[^0-9.]/g, ''))}
        />
        {estimate && (
          <div className="meta">
            <div>
              <span>Recipient gets</span>
              <span>{formatSats(estimate.amountSats)}</span>
            </div>
            <div>
              <span>Network fee</span>
              <span>
                {formatSats(estimate.fee)} ({estimate.feeRate} sat/vB)
              </span>
            </div>
            <div>
              <span>Total debit</span>
              <span>{formatSats(estimate.total)}</span>
            </div>
          </div>
        )}
      </div>

      {bookEntries.length > 0 && (
        <Field
          as="select"
          label="Address book"
          value=""
          disabled={busy}
          onChange={(addr) => {
            if (addr) setTo(addr);
          }}
        >
          <option value="">Pick a saved address…</option>
          {bookEntries.map((entry) => (
            <option key={entry.address} value={entry.address}>
              {entry.label} ({truncateAddress(entry.address)})
            </option>
          ))}
        </Field>
      )}

      <Field
        label="Recipient address"
        value={to}
        mono
        disabled={busy}
        onChange={setTo}
        inputProps={{
          autoComplete: 'off',
          spellCheck: false,
          placeholder: status.network === 'testnet' ? 'tcyb1…' : 'cy1…',
        }}
      />

      <div className="stack">
        <p className="muted">Fee rate</p>
        <Tabs
          value={preset}
          disabled={busy}
          onChange={setPreset}
          options={[
            {
              value: 'slow',
              label: feeRates ? `Slow (${feeRates.slow})` : 'Slow',
              disabled: !feeRates,
            },
            {
              value: 'standard',
              label: feeRates
                ? `Standard (${feeRates.standard})`
                : 'Standard',
              disabled: !feeRates,
            },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {feeRates && !feeRates.estimated && (
          <p className="muted">
            Fee estimates unavailable on this network — using the 1 sat/vB
            minimum. Slow and Standard match until the server can estimate.
          </p>
        )}
      </div>

      {preset === 'custom' && (
        <Field
          label="Custom sat/vB"
          value={customFeeRate}
          disabled={busy}
          onChange={setCustomFeeRate}
          inputProps={{
            inputMode: 'numeric',
            autoComplete: 'off',
            placeholder: '≥ 1',
          }}
        />
      )}

      <Check
        checked={includeFee}
        disabled={busy}
        onChange={setIncludeFee}
      >
        Include fee in amount (recipient receives amount minus fee)
      </Check>

      {estimateError && <p className="error">{estimateError}</p>}
      {error && <p className="error">{error}</p>}

      <Button
        block
        busy={busy}
        disabled={!canContinue}
        onClick={() => void preview()}
      >
        {busy ? 'Estimating…' : 'Continue'}
      </Button>
    </div>
  );
}
