import { useEffect, useMemo, useState } from 'react';
import { assertNewPassword } from '../../domain/passwordPolicy';
import {
  diceMinFor,
  type EntropyMode,
  type WordCount,
} from '../../domain/seedEntropyLimits';
import type { CreateEntropy } from '../stages';
import Button from '../components/Button';
import Check from '../components/Check';
import Field from '../components/Field';
import InfoTip from '../components/InfoTip';
import PasswordField from '../components/PasswordField';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import Tabs from '../components/Tabs';
import {
  buildCreateEntropy,
  hexByteCount,
  hexMinBytes,
  userEntropyReady,
} from '../lib/createEntropy';

interface Props {
  allowAdvancedEntropy?: boolean;
  allowPassphrase?: boolean;
  onConfirm: (
    password: string,
    entropy: CreateEntropy,
    passphrase?: string
  ) => Promise<void>;
}

const TIP_PASSPHRASE =
  'Optional BIP39 25th word. This is not your vault password. If you lose it, funds are unrecoverable even with the seed backup.';

const TIP_ADVANCED =
  'Power-user seed settings. Leave off for the recommended 24-word browser-RNG wallet.';

const TIP_WORD_COUNT =
  '24 words ≈ 256 bits of entropy (recommended). 12 words ≈ 128 bits — shorter backup, less margin.';

const TIP_ENTROPY =
  'Browser RNG uses crypto.getRandomValues (recommended). Mix combines browser RNG with your dice/hex. Dice/hex uses only what you supply — mistakes weaken security.';

const TIP_DICE =
  'Enter consecutive d6 faces as digits 1–6 only. Meet the minimum count shown below, or supply enough hex instead.';

const TIP_HEX =
  'Even-length hex bytes mixed into (or replacing) browser entropy. Prefer Browser RNG unless you have a clear reason.';

/**
 * Default: password → 24-word CSPRNG.
 * Advanced (create only): optional word count + Mix / Dice / hex.
 */
export default function PasswordCreationView({
  allowAdvancedEntropy = false,
  allowPassphrase = false,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [wordCount, setWordCount] = useState<WordCount>(24);
  const [entropyMode, setEntropyMode] = useState<EntropyMode>('csprng');
  const [diceRolls, setDiceRolls] = useState('');
  const [hexEntropy, setHexEntropy] = useState('');
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      setPassword('');
      setConfirm('');
      setPassphrase('');
      setPassphraseConfirm('');
      setDiceRolls('');
      setHexEntropy('');
    };
  }, []);

  useEffect(() => {
    if (showAdvanced) return;
    setWordCount(24);
    setEntropyMode('csprng');
    setDiceRolls('');
    setHexEntropy('');
  }, [showAdvanced]);

  const advancedActive = allowAdvancedEntropy && showAdvanced;
  const entropyOk = useMemo(
    () =>
      !advancedActive ||
      userEntropyReady(entropyMode, wordCount, diceRolls, hexEntropy),
    [advancedActive, entropyMode, wordCount, diceRolls, hexEntropy]
  );

  const canSubmit =
    understood &&
    entropyOk &&
    password.trim().length > 0 &&
    confirm.length > 0 &&
    !busy;

  const submit = async () => {
    setError(null);
    const policy = assertNewPassword(password);
    if (!policy.ok) {
      setError(policy.error);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (allowPassphrase && usePassphrase) {
      if (!passphrase) {
        setError('Enter a BIP39 passphrase, or turn the option off.');
        return;
      }
      if (passphrase !== passphraseConfirm) {
        setError('BIP39 passphrases do not match.');
        return;
      }
      if (passphrase === password) {
        setError('BIP39 passphrase must differ from the vault password.');
        return;
      }
    }
    if (!entropyOk) {
      setError('Provide enough dice rolls and/or hex entropy.');
      return;
    }

    setBusy(true);
    try {
      await onConfirm(
        password,
        buildCreateEntropy({
          advanced: advancedActive,
          wordCount,
          mode: entropyMode,
          diceRolls,
          hexEntropy,
        }),
        allowPassphrase && usePassphrase ? passphrase : undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setPassword('');
      setConfirm('');
      setPassphrase('');
      setPassphraseConfirm('');
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="muted">
        Choose a password to encrypt your vault. It cannot be recovered. By
        default a new wallet uses a 24-word seed from the browser secure random
        generator.
      </p>
      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={busy}
      />
      <PasswordStrengthMeter password={password} />
      <PasswordField
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy}
      />

      {allowPassphrase && (
        <>
          <Check
            checked={usePassphrase}
            disabled={busy}
            tip={TIP_PASSPHRASE}
            onChange={(next) => {
              setUsePassphrase(next);
              if (!next) {
                setPassphrase('');
                setPassphraseConfirm('');
              }
            }}
          >
            Use BIP39 passphrase
          </Check>
          {usePassphrase && (
            <>
              <PasswordField
                label="BIP39 passphrase"
                value={passphrase}
                onChange={setPassphrase}
                autoComplete="off"
                disabled={busy}
              />
              <PasswordField
                label="Confirm BIP39 passphrase"
                value={passphraseConfirm}
                onChange={setPassphraseConfirm}
                autoComplete="off"
                disabled={busy}
              />
            </>
          )}
        </>
      )}

      {allowAdvancedEntropy && (
        <>
          <Check
            checked={showAdvanced}
            disabled={busy}
            tip={TIP_ADVANCED}
            onChange={setShowAdvanced}
          >
            Advanced options
          </Check>
          {showAdvanced && (
            <div className="stack">
              <p className="muted label-with-tip">
                Word count
                <InfoTip text={TIP_WORD_COUNT} />
              </p>
              <Tabs
                value={String(wordCount) as '12' | '24'}
                disabled={busy}
                onChange={(v) => setWordCount(Number(v) as WordCount)}
                options={[
                  { value: '24', label: '24 words' },
                  { value: '12', label: '12 words' },
                ]}
              />
              <p className="muted label-with-tip">
                Entropy source
                <InfoTip text={TIP_ENTROPY} />
              </p>
              <Tabs
                value={entropyMode}
                disabled={busy}
                onChange={setEntropyMode}
                options={[
                  { value: 'csprng', label: 'Browser RNG' },
                  { value: 'mixed', label: 'Mix' },
                  { value: 'user', label: 'Dice / hex' },
                ]}
              />
              {entropyMode !== 'csprng' && (
                <>
                  <Field
                    label={
                      <span className="label-with-tip">
                        Dice rolls (1–6)
                        <InfoTip text={TIP_DICE} />
                      </span>
                    }
                    value={diceRolls}
                    disabled={busy}
                    onChange={(v) => setDiceRolls(v.replace(/[^1-6]/g, ''))}
                    inputProps={{ inputMode: 'numeric', autoComplete: 'off' }}
                  />
                  <p className="muted">
                    Dice: {diceRolls.length} /{' '}
                    {diceMinFor(entropyMode, wordCount)} min
                  </p>
                  <Field
                    as="textarea"
                    label={
                      <span className="label-with-tip">
                        Hex entropy
                        <InfoTip text={TIP_HEX} />
                      </span>
                    }
                    value={hexEntropy}
                    onChange={setHexEntropy}
                    disabled={busy}
                    mono
                    inputProps={{
                      spellCheck: false,
                      autoComplete: 'off',
                      rows: 2,
                    }}
                  />
                  <p className="muted">
                    Hex:{' '}
                    {(() => {
                      const b = hexByteCount(hexEntropy);
                      if (b === null) return 'invalid';
                      return `${b} / ${hexMinBytes(entropyMode, wordCount)} bytes min`;
                    })()}
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}

      <Check checked={understood} disabled={busy} onChange={setUnderstood}>
        I understand this password cannot be recovered.
      </Check>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <Button
        block
        disabled={!canSubmit}
        busy={busy}
        onClick={() => void submit()}
      >
        {busy ? 'Working…' : 'Continue'}
      </Button>
    </div>
  );
}
