import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ELECTRUM_MAINNET,
  OPTIONAL_HOST_PERMISSIONS,
  parseElectrumMainnetUrls,
  toHostPermissionPattern,
  toHostPermissionPatterns,
} from './defaults';
import { parseWssUrl } from './url';

describe('parseElectrumMainnetUrls', () => {
  it('returns empty for unset / blank env', () => {
    expect(parseElectrumMainnetUrls(undefined)).toEqual([]);
    expect(parseElectrumMainnetUrls(null)).toEqual([]);
    expect(parseElectrumMainnetUrls('')).toEqual([]);
    expect(parseElectrumMainnetUrls('  ,  ')).toEqual([]);
  });

  it('parses comma-separated wss URLs and dedupes', () => {
    expect(
      parseElectrumMainnetUrls(
        'wss://electrum-a.example:50004, wss://electrum-b.example:50004,wss://electrum-a.example:50004'
      )
    ).toEqual([
      'wss://electrum-a.example:50004',
      'wss://electrum-b.example:50004',
    ]);
  });

  it('rejects invalid entries', () => {
    expect(() =>
      parseElectrumMainnetUrls('wss://ok.example:50004,ws://bad.example:50004')
    ).toThrow(/wss:\/\//);
  });
});

describe('electrum defaults', () => {
  it('has empty mainnet defaults when env is unset (vitest define)', () => {
    expect(DEFAULT_ELECTRUM_MAINNET).toEqual([]);
  });

  it('maps wss URLs to https Chrome match patterns with path', () => {
    expect(toHostPermissionPattern('wss://electrum.example:50004')).toBe(
      'https://electrum.example:50004/*'
    );
  });

  it('builds host_permissions from an explicit URL list', () => {
    expect(
      toHostPermissionPatterns([
        'wss://electrum-a.example:50004',
        'wss://electrum-b.example:50004',
      ])
    ).toEqual([
      'https://electrum-a.example:50004/*',
      'https://electrum-b.example:50004/*',
    ]);
  });

  it('builds empty host_permissions from empty list', () => {
    expect(toHostPermissionPatterns([])).toEqual([]);
  });

  it('rejects non-wss in toHostPermissionPattern', () => {
    expect(() => toHostPermissionPattern('ws://evil.example:50004')).toThrow(
      /wss:\/\//
    );
  });

  it('declares optional https scope only (wss is not a Chrome match scheme)', () => {
    expect(OPTIONAL_HOST_PERMISSIONS).toEqual(['https://*/*']);
  });
});

describe('parseWssUrl', () => {
  it('normalizes origin form and strips path/query/hash', () => {
    expect(parseWssUrl('wss://example.com:50004/path?x=1#frag')).toBe(
      'wss://example.com:50004'
    );
  });

  it('rejects empty string', () => {
    expect(() => parseWssUrl('')).toThrow(/required/i);
    expect(() => parseWssUrl('   ')).toThrow(/required/i);
  });

  it('rejects ws://', () => {
    expect(() => parseWssUrl('ws://example.com:50004')).toThrow(/wss:\/\//);
  });

  it('rejects http and https', () => {
    expect(() => parseWssUrl('http://example.com:50004')).toThrow(/wss:\/\//);
    expect(() => parseWssUrl('https://example.com:50004')).toThrow(/wss:\/\//);
  });
});
