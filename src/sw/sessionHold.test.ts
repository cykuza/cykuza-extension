import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sessionHold', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('bindSessionHoldPort replace disconnects the previous Port', async () => {
    const { bindSessionHoldPort, releaseSessionHold } = await import(
      './sessionHold'
    );
    const firstDisconnect = vi.fn();
    const secondDisconnect = vi.fn();
    const first = {
      onDisconnect: { addListener: vi.fn() },
      disconnect: firstDisconnect,
    } as unknown as chrome.runtime.Port;
    const second = {
      onDisconnect: { addListener: vi.fn() },
      disconnect: secondDisconnect,
    } as unknown as chrome.runtime.Port;

    bindSessionHoldPort(first);
    bindSessionHoldPort(second);
    expect(firstDisconnect).toHaveBeenCalled();

    releaseSessionHold();
    expect(secondDisconnect).toHaveBeenCalled();
  });
});
