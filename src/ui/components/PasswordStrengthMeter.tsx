import { evaluateNewPassword } from '../../domain/passwordPolicy';

interface Props {
  password: string;
}

/**
 * Monochrome strength meter. Hidden until the user starts typing —
 * empty password must not reserve layout or show a "Strength —" row.
 */
export default function PasswordStrengthMeter({ password }: Props) {
  const result = evaluateNewPassword(password);
  if (result.trimmedLength === 0) return null;

  const pct =
    result.strength === 'Weak' ? 33 : result.strength === 'OK' ? 66 : 100;

  const rows: { label: string; met: boolean }[] = [
    { label: 'At least 12 characters', met: result.trimmedLength >= 12 },
    { label: 'Lowercase letter', met: result.classes.lowercase },
    { label: 'Uppercase letter', met: result.classes.uppercase },
    { label: 'Digit', met: result.classes.digit },
    { label: 'Special character', met: result.classes.special },
  ];

  return (
    <div className="strength" aria-live="polite">
      <div className="strength-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="strength-meta">
        <span>Strength</span>
        <span>{result.strength}</span>
      </p>
      <ul className="strength-list">
        {rows.map((row) => (
          <li key={row.label} className={row.met ? 'met' : undefined}>
            {row.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
