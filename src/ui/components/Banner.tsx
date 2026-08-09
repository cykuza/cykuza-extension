import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  tone?: 'info' | 'warn' | 'danger';
}

export default function Banner({ children, tone = 'info' }: Props) {
  const cls =
    tone === 'danger' ? 'banner danger' : tone === 'warn' ? 'banner warn' : 'banner';
  return <div className={cls}>{children}</div>;
}
