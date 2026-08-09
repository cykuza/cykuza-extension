import { describe, expect, it } from 'vitest';
import {
  CHAIN_WATCH_PORT,
  parseWatchClientMessage,
  parseWatchServerMessage,
} from './watchProtocol';

describe('watchProtocol', () => {
  it('exports a stable Port name', () => {
    expect(CHAIN_WATCH_PORT).toBe('cykuza-chain-watch');
  });

  it('parses watch/start', () => {
    const parsed = parseWatchClientMessage({ type: 'watch/start' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.type).toBe('watch/start');
  });

  it('rejects unknown client messages', () => {
    expect(parseWatchClientMessage({ type: 'watch/nope' }).success).toBe(false);
  });

  it('parses watch/error with optional status', () => {
    const parsed = parseWatchServerMessage({
      type: 'watch/error',
      error: 'Connection failed',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('watch/error');
      expect(parsed.data.error).toBe('Connection failed');
    }
  });
});
