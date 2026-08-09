import { describe, expect, it, vi } from 'vitest';
import {
  attachPopupHideHandler,
  popupHidePolicyFromStatus,
  shouldNotifyPopupHidden,
} from './popupHideSession';
import { isResumableStage } from './popupResume';

describe('popupHideSession', () => {
  it('notifies only when unlocked vault + setting on', () => {
    expect(
      shouldNotifyPopupHidden(
        popupHidePolicyFromStatus({
          hasVault: true,
          locked: false,
          lockWhenPopupCloses: true,
        })
      )
    ).toBe(true);
    expect(
      shouldNotifyPopupHidden(
        popupHidePolicyFromStatus({
          hasVault: true,
          locked: false,
          lockWhenPopupCloses: false,
        })
      )
    ).toBe(false);
    expect(
      shouldNotifyPopupHidden(
        popupHidePolicyFromStatus({
          hasVault: true,
          locked: true,
          lockWhenPopupCloses: true,
        })
      )
    ).toBe(false);
  });

  it('fires onHidden once when document becomes hidden', () => {
    const listeners = new Map<string, () => void>();
    const target = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    };
    const onHidden = vi.fn();
    const detach = attachPopupHideHandler({
      target,
      shouldNotify: () => true,
      onHidden,
    });

    target.visibilityState = 'hidden';
    listeners.get('visibilitychange')?.();
    listeners.get('visibilitychange')?.();
    expect(onHidden).toHaveBeenCalledTimes(1);

    detach();
  });
});

describe('popupResume', () => {
  it('allows Network / settings drill-ins but not secret viewers', () => {
    expect(isResumableStage('server-config')).toBe(true);
    expect(isResumableStage('settings')).toBe(true);
    expect(isResumableStage('send')).toBe(true);
    expect(isResumableStage('mnemonic-view')).toBe(false);
    expect(isResumableStage('private-key-view')).toBe(false);
    expect(isResumableStage('destroy')).toBe(false);
  });
});
