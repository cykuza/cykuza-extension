export type PopupHidePolicy = {
  hasVault: boolean;
  locked: boolean;
  lockWhenPopupCloses: boolean;
};

export function popupHidePolicyFromStatus(status: {
  hasVault: boolean;
  locked: boolean;
  lockWhenPopupCloses: boolean;
}): PopupHidePolicy {
  return {
    hasVault: status.hasVault,
    locked: status.locked,
    lockWhenPopupCloses: status.lockWhenPopupCloses,
  };
}

/** True when hide should notify the SW to (re)arm idle auto-lock. */
export function shouldNotifyPopupHidden(policy: PopupHidePolicy): boolean {
  return policy.lockWhenPopupCloses && policy.hasVault && !policy.locked;
}

type HideTarget = {
  addEventListener(
    type: 'visibilitychange' | 'pagehide',
    listener: () => void
  ): void;
  removeEventListener(
    type: 'visibilitychange' | 'pagehide',
    listener: () => void
  ): void;
  visibilityState?: DocumentVisibilityState;
};

/**
 * When the action popup hides, notify once (permission UI, focus loss, dismiss).
 * Caller arms idle auto-lock via `popupHidden` — never tears down synchronously.
 */
export function attachPopupHideHandler(opts: {
  target: HideTarget;
  shouldNotify: () => boolean;
  onHidden: () => void;
}): () => void {
  let fired = false;
  const maybeNotify = () => {
    if (fired) return;
    if (!opts.shouldNotify()) return;
    const hidden =
      opts.target.visibilityState === undefined ||
      opts.target.visibilityState === 'hidden';
    if (!hidden) return;
    fired = true;
    opts.onHidden();
  };

  const onVisibility = () => maybeNotify();
  const onPageHide = () => maybeNotify();
  opts.target.addEventListener('visibilitychange', onVisibility);
  opts.target.addEventListener('pagehide', onPageHide);
  return () => {
    opts.target.removeEventListener('visibilitychange', onVisibility);
    opts.target.removeEventListener('pagehide', onPageHide);
  };
}
