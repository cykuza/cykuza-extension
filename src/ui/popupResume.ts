import type { WalletStage } from './stages';

/** Stages safe to restore after the action popup is recreated. */
const RESUMABLE_STAGES = new Set<WalletStage>([
  'ready',
  'receive',
  'send',
  'settings',
  'server-config',
  'security',
  'explorer',
  'about',
  'address-book',
  'daily-spend',
]);

export type PopupResumeState = {
  stage: WalletStage;
};

const SESSION_KEY = 'popup_resume';

type SessionArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

function sessionArea(): SessionArea | null {
  try {
    const area = chrome.storage?.session;
    if (!area) return null;
    return area;
  } catch {
    return null;
  }
}

export function isResumableStage(stage: WalletStage): boolean {
  return RESUMABLE_STAGES.has(stage);
}

export async function readPopupResume(): Promise<PopupResumeState | null> {
  const area = sessionArea();
  if (!area) return null;
  const data = await area.get(SESSION_KEY);
  const raw = data[SESSION_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const stage = (raw as { stage?: unknown }).stage;
  if (typeof stage !== 'string' || !isResumableStage(stage as WalletStage)) {
    return null;
  }
  return { stage: stage as WalletStage };
}

export async function writePopupResume(
  stage: WalletStage
): Promise<void> {
  const area = sessionArea();
  if (!area) return;
  if (!isResumableStage(stage)) {
    await area.remove(SESSION_KEY);
    return;
  }
  await area.set({ [SESSION_KEY]: { stage } satisfies PopupResumeState });
}

export async function clearPopupResume(): Promise<void> {
  const area = sessionArea();
  if (!area) return;
  await area.remove(SESSION_KEY);
}
