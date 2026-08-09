import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconInfo } from './icons';

interface Props {
  /** Tooltip body shown on hover / keyboard focus-visible. */
  text: string;
  /** Accessible name; defaults to a short “More information”. */
  label?: string;
}

/**
 * Compact info affordance. Opens on pointer hover or keyboard focus-visible —
 * not on programmatic focus (e.g. stage-entry focus in Shell). Portal to
 * document.body so popup scroll containers do not clip the bubble.
 *
 * Marked `data-stage-focus-skip` so Shell’s stage-entry focus prefers a real
 * form control over this helper.
 */
export default function InfoTip({ text, label = 'More information' }: Props) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 220;
    const pad = 8;
    const left = Math.max(
      pad,
      Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - pad)
    );
    const below = r.bottom + 6;
    const estimatedHeight = 96;
    const top =
      below + estimatedHeight > window.innerHeight - pad
        ? Math.max(pad, r.top - estimatedHeight - 6)
        : below;
    setPos({ top, left });
  }, []);

  const show = () => {
    place();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="info-tip-btn"
        data-stage-focus-skip
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) show();
        }}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <IconInfo />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="info-tip-bubble"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
