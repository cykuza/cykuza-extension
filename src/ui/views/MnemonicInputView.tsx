import { useEffect, useState } from 'react';
import { validateMnemonic } from '../../domain/mnemonic';
import Button from '../components/Button';
import MnemonicWordSlot from '../components/MnemonicWordSlot';
import Tabs from '../components/Tabs';

interface Props {
  onConfirm: (mnemonic: string) => Promise<void>;
  onInternalBack?: (handler: (() => void) | null) => void;
}

function setWordAt(words: string[], index: number, value: string): string[] {
  const next = [...words];
  next[index] = value;
  return next;
}

export default function MnemonicInputView({
  onConfirm,
  onInternalBack,
}: Props) {
  const [step, setStep] = useState<'count' | 'words'>('count');
  const [count, setCount] = useState<'12' | '24'>('24');
  const [words, setWords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!onInternalBack) return;
    if (step === 'words') {
      onInternalBack(() => {
        setStep('count');
        setWords([]);
        setError(null);
      });
    } else {
      onInternalBack(null);
    }
    return () => onInternalBack(null);
  }, [step, onInternalBack]);

  useEffect(() => {
    return () => setWords([]);
  }, []);

  if (step === 'count') {
    return (
      <div className="panel">
        <header className="stack-sm">
          <h2 className="section-title">Recovery phrase length</h2>
          <p className="muted">
            Choose how many words your seed has. You will enter the words on the
            next screen.
          </p>
        </header>
        <Tabs
          value={count}
          onChange={setCount}
          options={[
            { value: '24', label: '24 words' },
            { value: '12', label: '12 words' },
          ]}
        />
        <Button
          block
          onClick={() => {
            const n = Number(count);
            setWords(Array.from({ length: n }, () => ''));
            setStep('words');
          }}
        >
          Continue
        </Button>
      </div>
    );
  }

  const mid = Math.ceil(words.length / 2);
  const left = words.slice(0, mid);
  const right = words.slice(mid);

  const submit = async () => {
    setError(null);
    const cleaned = words.map((w) => w.trim().toLowerCase());
    if (cleaned.some((w) => !w)) {
      setError('Fill in every word.');
      return;
    }
    const mnemonic = cleaned.join(' ');
    if (!validateMnemonic(mnemonic)) {
      setError('Invalid mnemonic checksum or word.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(mnemonic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setWords([]);
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <header className="stack-sm">
        <h2 className="section-title">Enter Your Recovery Phrase</h2>
        <p className="muted">Enter all {words.length} words in order</p>
      </header>

      <div className="mnemonic-entry" role="group" aria-label="Recovery phrase">
        <div className="mnemonic-entry-col">
          {left.map((word, i) => (
            <MnemonicWordSlot
              key={i}
              index={i}
              value={word}
              disabled={busy}
              onChange={(v) => setWords((prev) => setWordAt(prev, i, v))}
            />
          ))}
        </div>
        <div className="mnemonic-entry-col">
          {right.map((word, i) => {
            const index = mid + i;
            return (
              <MnemonicWordSlot
                key={index}
                index={index}
                value={word}
                disabled={busy}
                onChange={(v) => setWords((prev) => setWordAt(prev, index, v))}
              />
            );
          })}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button block busy={busy} onClick={() => void submit()}>
        {busy ? 'Importing…' : 'Import'}
      </Button>
    </div>
  );
}
