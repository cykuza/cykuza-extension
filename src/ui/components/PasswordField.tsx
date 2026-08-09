import { useEffect, useRef } from 'react';
import Field from './Field';

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
  onEnter?: () => void;
}

/** Password Field well — clears value on unmount. */
export default function PasswordField({
  label = 'Password',
  value,
  onChange,
  disabled,
  autoComplete = 'current-password',
  onEnter,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      onChange('');
      if (ref.current) ref.current.value = '';
    };
  }, []);

  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      inputRef={ref}
      inputProps={{
        type: 'password',
        autoComplete,
        onKeyDown: (e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        },
      }}
    />
  );
}
