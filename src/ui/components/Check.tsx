import type { ReactNode } from 'react';
import InfoTip from './InfoTip';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  /** Optional hover tip next to the label. */
  tip?: string;
}

export default function Check({
  checked,
  onChange,
  disabled,
  children,
  tip,
}: Props) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={tip ? 'label-with-tip' : undefined}>
        {children}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
    </label>
  );
}
