import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/storage', () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock('./electrumTrustGate', () => ({
  requireElectrumTrustForChainOps: vi.fn(),
}));

vi.mock('./session/chainSnapshot', () => ({
  refreshFromClient: vi.fn(),
}));

vi.mock('./session/status', () => ({
  buildStatus: vi.fn(async () => ({
    hasVault: true,
    locked: false,
    network: 'mainnet',
    termsAccepted: true,
    autoLockMinutes: 5,
    lockWhenPopupCloses: true,
    watchActive: false,
  })),
}));

vi.mock('./session/state', () => ({
  sessionRam: {
    identity: null,
    sessionGeneration: 0,
    lastServerUrl: null,
    lastServerStatus: 'idle',
    lastServerError: undefined,
    watchActive: false,
    cachedBalance: undefined,
    cachedHistory: undefined,
    cachedFeeRates: undefined,
    cachedUtxos: undefined,
  },
  armAutoLock: vi.fn(),
}));

describe('electrumWatch', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('stopWatch clears an inactive session safely', async () => {
    const mod = await import('./electrumWatch');
    expect(mod.getWatchClient()).toBeNull();
    mod.stopWatch({ disconnectPort: false });
    expect(mod.getWatchClient()).toBeNull();
  });

  it('bindWatchPort disconnect stops the watch socket', async () => {
    const mod = await import('./electrumWatch');
    const listeners = new Map<string, Set<() => void>>();
    const port = {
      name: 'cykuza-chain-watch',
      onDisconnect: {
        addListener: (fn: () => void) => {
          if (!listeners.has('disconnect')) listeners.set('disconnect', new Set());
          listeners.get('disconnect')!.add(fn);
        },
      },
      onMessage: {
        addListener: vi.fn(),
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;

    mod.bindWatchPort(port);
    for (const fn of listeners.get('disconnect') ?? []) fn();
    expect(mod.getWatchClient()).toBeNull();
  });

  it('settleServerStatusAfterBatch preserves connected when watch is live', async () => {
    const { sessionRam } = await import('./session/state');
    const mod = await import('./electrumWatch');
    sessionRam.lastServerStatus = 'connecting';
    mod.settleServerStatusAfterBatch();
    expect(sessionRam.lastServerStatus).toBe('idle');
  });
});
