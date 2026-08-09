interface Props {
  index: number;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * Single recovery-phrase cell — index + input share one well (cykuza-web parity).
 */
export default function MnemonicWordSlot({
  index,
  value,
  disabled,
  onChange,
}: Props) {
  const n = index + 1;
  return (
    <label className="mnemonic-word">
      <span className="mnemonic-word-index" aria-hidden>
        {n}.
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={`Word ${n}`}
        aria-label={`Word ${n}`}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
