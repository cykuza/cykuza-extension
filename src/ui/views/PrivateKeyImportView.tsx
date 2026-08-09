import { useEffect, useState } from 'react';
import Button from '../components/Button';
import Field from '../components/Field';

interface Props {
  password: string;
  onConfirm: (privateKey: string, password: string) => Promise<void>;
}

export default function PrivateKeyImportView({ password, onConfirm }: Props) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => setKey('');
  }, []);

  const submit = async () => {
    setError(null);
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Enter a WIF or hex private key.');
      return;
    }
    if (trimmed.length < 25 || trimmed.length > 66) {
      setError('Unexpected key length. Use WIF or 64-char hex.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(trimmed, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setKey('');
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="muted">
        Paste WIF (L/K/5 or testnet c/9) or 64-character hex.
      </p>
      <Field
        as="textarea"
        label="Private key"
        value={key}
        onChange={setKey}
        disabled={busy}
        mono
        inputProps={{ spellCheck: false, autoComplete: 'off', rows: 3 }}
      />
      {error && <p className="error">{error}</p>}
      <Button block busy={busy} onClick={() => void submit()}>
        {busy ? 'Importing…' : 'Import'}
      </Button>
    </div>
  );
}
