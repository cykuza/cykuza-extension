import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import Chrome, { type ChromeProps } from './Chrome';

interface Props {
  chrome: ChromeProps;
  focusKey: string;
  children: ReactNode;
}

const STAGE_FOCUS_CONTROL =
  'button:not([disabled]):not([data-stage-focus-skip]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href]:not([data-stage-focus-skip])';

/** Move focus onto the first interactive control so keyboard users are not stranded on chrome. */
function focusStageRoot(root: HTMLElement) {
  const control = root.querySelector<HTMLElement>(STAGE_FOCUS_CONTROL);
  control?.focus({ preventScroll: true });
}

export default function Shell({ chrome, focusKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    focusStageRoot(root);
  }, [focusKey]);

  return (
    <div className="shell relative">
      <Chrome {...chrome} />
      <div className="content" ref={ref}>
        {children}
      </div>
    </div>
  );
}
