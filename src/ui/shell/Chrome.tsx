import { useEffect, useRef, useState } from 'react';
import Button from '../components/Button';
import { IconBack, IconCopy, IconSettings } from '../components/icons';
import { copyText } from '../lib/clipboard';
import { truncateAddress } from '../lib/format';

export type ChromeProps = {
  title?: string | null;
  address?: string | null;
  showBack?: boolean;
  onBack?: () => void;
  showSettings?: boolean;
  onSettings?: () => void;
  showBrand?: boolean;
};

export default function Chrome({
  title,
  address,
  showBack,
  onBack,
  showSettings,
  onSettings,
  showBrand,
}: ChromeProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    setCopied(false);
  }, [address]);

  const copyAddress = () => {
    if (!address) return;
    void copyText(address).then(() => {
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <header className="chrome">
      {showBack ? (
        <Button variant="icon" aria-label="Back" onClick={onBack}>
          <IconBack />
        </Button>
      ) : (
        <div className="chrome-spacer" aria-hidden />
      )}

      <div className="chrome-center">
        {address ? (
          <button
            type="button"
            className="chrome-address"
            title={address}
            onClick={copyAddress}
            aria-label={copied ? 'Address copied' : 'Copy address'}
          >
            <span>{copied ? 'Copied' : truncateAddress(address)}</span>
            <IconCopy />
          </button>
        ) : showBrand ? (
          <div className="chrome-brand">
            <img src="/brand-mark.png" alt="" width={28} height={28} />
            <p className="chrome-brand-name">|C¥|kuza</p>
          </div>
        ) : title ? (
          <h1 className="chrome-title">{title}</h1>
        ) : null}
      </div>

      <div className="chrome-end">
        {showSettings ? (
          <Button variant="icon" aria-label="Settings" onClick={onSettings}>
            <IconSettings />
          </Button>
        ) : (
          <div className="chrome-spacer" aria-hidden />
        )}
      </div>
    </header>
  );
}
