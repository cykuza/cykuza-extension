/**
 * Isolated from protocol.test.ts so Function is stubbed before the protocol
 * module graph (and Zod allowsEval) loads.
 */
import { describe, expect, it, vi } from 'vitest';

describe('protocol jitless', () => {
  it('parses envelopes without invoking the Function constructor', async () => {
    vi.resetModules();
    const origFunction = globalThis.Function;
    let attempted = false;
    const stub = function StubFunction(..._args: unknown[]) {
      attempted = true;
      throw new Error('Function constructor must not run under jitless');
    };
    globalThis.Function = stub as unknown as FunctionConstructor;

    try {
      const { parseWalletRequest, PROTOCOL_VERSION } = await import(
        './protocol'
      );
      const parsed = parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'getStatus',
      });
      expect(parsed.success).toBe(true);
      expect(attempted).toBe(false);
    } finally {
      globalThis.Function = origFunction;
    }
  });
});
