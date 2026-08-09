import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('buffer polyfill wiring', () => {
  it('background entry imports the Buffer polyfill before the router', () => {
    const src = readFileSync(
      join(__dirname, '../../entrypoints/background.ts'),
      'utf8'
    );
    const polyfillIdx = src.indexOf('platform/bufferPolyfill');
    const routerIdx = src.indexOf('sw/router');
    expect(polyfillIdx).toBeGreaterThanOrEqual(0);
    expect(routerIdx).toBeGreaterThan(polyfillIdx);
  });

  it('popup entry does not pull the Buffer polyfill (UI stays crypto-light)', () => {
    const src = readFileSync(
      join(__dirname, '../../entrypoints/popup/main.tsx'),
      'utf8'
    );
    expect(src.includes('bufferPolyfill')).toBe(false);
  });
});
