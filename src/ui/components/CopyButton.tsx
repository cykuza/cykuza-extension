import { useEffect, useRef, useState } from 'react';
import { clearClipboardIfMatches, copyText } from '../lib/clipboard';
import Button from './Button';

interface Props {
  value: string;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  autoClearMs?: number;
}

export default function CopyButton({
  value,
  label = 'Copy',
  ariaLabel,
  disabled,
  autoClearMs,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
      if (autoClearMs) void clearClipboardIfMatches(value);
    };
  }, [autoClearMs, value]);

  const onCopy = () => {
    void copyText(value).then(() => {
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
      if (autoClearMs) {
        if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
        clearTimer.current = window.setTimeout(() => {
          void clearClipboardIfMatches(value);
        }, autoClearMs);
      }
    });
  };

  return (
    <Button
      variant="secondary"
      tiny
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      onClick={onCopy}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
