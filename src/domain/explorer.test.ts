import { describe, expect, it } from 'vitest';
import { buildExplorerTxUrl, parseExplorerTxTemplate } from './explorer';

const GOOD = 'https://explorer.example/tx/{txid}';
const TXID = 'ab'.repeat(32);

describe('parseExplorerTxTemplate', () => {
  it('accepts https template with one {txid}', () => {
    expect(parseExplorerTxTemplate(GOOD)).toBe(GOOD);
  });

  it('trims whitespace', () => {
    expect(parseExplorerTxTemplate(`  ${GOOD}  `)).toBe(GOOD);
  });

  it('rejects empty / non-https / bad schemes', () => {
    expect(() => parseExplorerTxTemplate('')).toThrow(/empty/i);
    expect(() => parseExplorerTxTemplate('http://explorer.example/tx/{txid}')).toThrow(
      /https/
    );
    expect(() =>
      parseExplorerTxTemplate('javascript:alert(1)//{txid}')
    ).toThrow();
    expect(() =>
      parseExplorerTxTemplate('data:text/html,{txid}')
    ).toThrow();
  });

  it('rejects missing or duplicate {txid}', () => {
    expect(() =>
      parseExplorerTxTemplate('https://explorer.example/tx/')
    ).toThrow(/exactly one/);
    expect(() =>
      parseExplorerTxTemplate('https://explorer.example/{txid}/{txid}')
    ).toThrow(/exactly one/);
  });

  it('rejects userinfo', () => {
    expect(() =>
      parseExplorerTxTemplate('https://user:pass@explorer.example/tx/{txid}')
    ).toThrow(/credentials/);
  });
});

describe('buildExplorerTxUrl', () => {
  it('returns null for missing template or bad txid', () => {
    expect(buildExplorerTxUrl(null, TXID)).toBeNull();
    expect(buildExplorerTxUrl(undefined, TXID)).toBeNull();
    expect(buildExplorerTxUrl(GOOD, 'short')).toBeNull();
    expect(buildExplorerTxUrl(GOOD, 'zz'.repeat(32))).toBeNull();
  });

  it('substitutes a valid 64-hex txid', () => {
    expect(buildExplorerTxUrl(GOOD, TXID)).toBe(
      `https://explorer.example/tx/${TXID}`
    );
  });

  it('returns null for an invalid stored template', () => {
    expect(buildExplorerTxUrl('https://explorer.example/tx/', TXID)).toBeNull();
  });
});
