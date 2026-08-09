import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  tiny?: boolean;
  block?: boolean;
  busy?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  tiny,
  block,
  busy,
  disabled,
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = [
    variant,
    tiny ? 'tiny' : '',
    block ? 'block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
