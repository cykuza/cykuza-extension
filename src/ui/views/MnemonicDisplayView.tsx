import { useEffect, useMemo, useState } from 'react';
import { validateMnemonic } from '../../domain/mnemonic';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Check from '../components/Check';
import CopyButton from '../components/CopyButton';
import Field from '../components/Field';
import { truncateAddress } from '../lib/format';
import { pickQuizIndices, wordsMatch } from '../lib/quiz';

interface Props {
  mnemonic: string;
  address?: string;
  onConfirm: () => void;
  onInternalBack?: (handler: (() => void) | null) => void;
}

const QUIZ_COUNT = 3;
const CLIPBOARD_CLEAR_MS = 60_000;

export default function MnemonicDisplayView({
  mnemonic,
  address,
  onConfirm,
  onInternalBack,
}: Props) {
  const [step, setStep] = useState<'backup' | 'quiz'>('backup');
  const [saved, setSaved] = useState(false);
  const [hotWalletAck, setHotWalletAck] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(
    () => mnemonic.trim().split(/\s+/).filter(Boolean),
    [mnemonic]
  );
  const valid =
    (list.length === 12 || list.length === 24) && validateMnemonic(mnemonic);

  const quizIndices = useMemo(
    () =>
      list.length === 12 || list.length === 24
        ? pickQuizIndices(list.length, QUIZ_COUNT)
        : [],
    [list.length]
  );

  useEffect(() => {
    if (!onInternalBack) return;
    if (step === 'quiz') {
      onInternalBack(() => {
        setStep('backup');
        setAnswers({});
        setError(null);
      });
    } else {
      onInternalBack(null);
    }
    return () => onInternalBack(null);
  }, [step, onInternalBack]);

  if (!valid) {
    return (
      <Banner tone="danger">
        Recovery phrase was lost or invalid. Go back and create the wallet again.
      </Banner>
    );
  }

  const quizOk =
    quizIndices.length === QUIZ_COUNT &&
    quizIndices.every((idx) => wordsMatch(list[idx] ?? '', answers[idx] ?? ''));

  if (step === 'quiz') {
    return (
      <div className="panel">
        <p className="muted">Confirm a few words to continue:</p>
        {quizIndices.map((idx) => (
          <Field
            key={idx}
            label={`Word #${idx + 1}`}
            value={answers[idx] ?? ''}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [idx]: v }))}
            inputProps={{ autoComplete: 'off', spellCheck: false }}
          />
        ))}
        {error && <p className="error">{error}</p>}
        <Button
          block
          disabled={!quizOk}
          onClick={() => {
            if (!quizOk) {
              setError('Fill in the correct quiz words.');
              return;
            }
            setAnswers({});
            onConfirm();
          }}
        >
          Create wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="panel">
      <Banner>
        Write these {list.length} words down and store them offline. They will
        not be shown again in this flow.
      </Banner>
      <div className="card">
        <ol className="mnemonic-grid">
          {list.map((word, i) => (
            <li key={`${i}-${word}`}>
              <span className="mnemonic-index">{i + 1}.</span>
              {word}
            </li>
          ))}
        </ol>
        <div className="row mt-3">
          <CopyButton
            value={mnemonic}
            autoClearMs={CLIPBOARD_CLEAR_MS}
            label="Copy seed"
            ariaLabel="Copy seed phrase"
          />
        </div>
        <p className="muted">Clipboard clears after 60s while this popup stays open.</p>
      </div>
      {address && (
        <p className="muted">First address: {truncateAddress(address)}</p>
      )}
      <Check checked={saved} onChange={setSaved}>
        I have written down my seed phrase and stored it safely.
      </Check>
      <Check checked={hotWalletAck} onChange={setHotWalletAck}>
        I understand this is a hot wallet and Electrum can see my address.
      </Check>
      {error && <p className="error">{error}</p>}
      <Button
        block
        disabled={!saved || !hotWalletAck}
        onClick={() => {
          setError(null);
          setStep('quiz');
        }}
      >
        Continue
      </Button>
    </div>
  );
}
