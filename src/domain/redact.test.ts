import { describe, expect, it } from 'vitest';
import { ElectrumError, TxError } from './errors';
import {
  redactUrls,
  safeErrorMessage,
  sanitizeElectrumRpcMessage,
} from './redact';

describe('redactUrls', () => {
  it('redacts wss and https URLs', () => {
    expect(redactUrls('fail wss://electrum.example:50004 ok')).toBe(
      'fail [redacted] ok'
    );
    expect(redactUrls('see https://evil.example/path')).toContain('[redacted]');
  });

  it('redacts dotted hosts with ports', () => {
    expect(redactUrls('host electrum0.prod.example.com:50004 down')).toBe(
      'host [redacted] down'
    );
  });

  it('redacts IPv4 literals', () => {
    expect(redactUrls('connect 203.0.113.10:50004')).toBe('connect [redacted]');
  });

  it('redacts localhost with and without port (P2.7)', () => {
    expect(redactUrls('fail localhost ok')).toBe('fail [redacted] ok');
    expect(redactUrls('connect localhost:50004')).toBe('connect [redacted]');
  });

  it('redacts single-label host:port without touching bare words (P2.7)', () => {
    expect(redactUrls('electrum:50001 down')).toBe('[redacted] down');
    expect(redactUrls('myserver:50004')).toBe('[redacted]');
    expect(redactUrls('Connection failed unexpectedly')).toBe(
      'Connection failed unexpectedly'
    );
  });

  it('is idempotent', () => {
    const once = redactUrls('wss://a.example:1');
    expect(redactUrls(once)).toBe(once);
  });
});

describe('safeErrorMessage', () => {
  it('keeps stable TxError / ElectrumError dictionary messages', () => {
    expect(safeErrorMessage(new TxError('LOCKED'))).toBe('Wallet is locked');
    expect(safeErrorMessage(new ElectrumError('CONNECT_FAILED'))).toBe(
      'Connection failed'
    );
    expect(safeErrorMessage(new ElectrumError('SERVERS_DISAGREE'))).toBe(
      'Servers disagree — check Electrum config'
    );
    expect(safeErrorMessage(new ElectrumError('VERIFY_FAILED'))).toBe(
      'Could not verify with second server'
    );
  });

  it('redacts hosts even when embedded in ElectrumError custom message', () => {
    const msg = safeErrorMessage(
      new ElectrumError(
        'RPC_ERROR',
        'server wss://secret.example:50004 rejected'
      )
    );
    expect(msg).not.toMatch(/wss:\/\//);
    expect(msg).not.toMatch(/secret\.example/);
    expect(msg).toContain('[redacted]');
  });

  it('redacts hosts from generic Error', () => {
    const msg = safeErrorMessage(
      new Error('WebSocket connection error: wss://secret.example:50004')
    );
    expect(msg).not.toMatch(/wss:\/\//);
    expect(msg).not.toMatch(/secret\.example/);
    expect(msg).toContain('[redacted]');
  });

  it('returns Unexpected error for empty / fully-redacted', () => {
    expect(safeErrorMessage(new Error('wss://only.example:1'))).toBe(
      'Unexpected error'
    );
    expect(safeErrorMessage(42)).toBe('Unexpected error');
  });
});

describe('sanitizeElectrumRpcMessage', () => {
  it('redacts and truncates long RPC errors', () => {
    const long = `rejected ${'x'.repeat(200)} wss://node.example:50004`;
    const out = sanitizeElectrumRpcMessage(long);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out).not.toMatch(/node\.example/);
  });

  it('falls back when empty', () => {
    expect(sanitizeElectrumRpcMessage(undefined)).toBe('Electrum error');
    expect(sanitizeElectrumRpcMessage('')).toBe('Electrum error');
  });
});
