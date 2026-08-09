import { describe, expect, it } from 'vitest';
import {
  chromiumCandidates,
  resolveChromiumBinary,
} from './resolve-chromium-binary';

describe('resolveChromiumBinary', () => {
  it('prefers CHROME_PATH when accessible', () => {
    const path = resolveChromiumBinary({
      env: { CHROME_PATH: '/custom/brave' },
      canAccess: (p) => p === '/custom/brave',
      chromeInstallations: () => ['/Applications/Google Chrome.app'],
    });
    expect(path).toBe('/custom/brave');
  });

  it('ignores inaccessible CHROME_PATH and uses chrome-launcher', () => {
    const path = resolveChromiumBinary({
      env: { CHROME_PATH: '/missing' },
      canAccess: (p) => p === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      chromeInstallations: () => [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ],
    });
    expect(path).toBe(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  });

  it('falls back to Brave when Chrome is absent (darwin)', () => {
    const brave =
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
    const path = resolveChromiumBinary({
      env: {},
      platform: 'darwin',
      home: '/Users/dev',
      canAccess: (p) => p === brave,
      chromeInstallations: () => [],
    });
    expect(path).toBe(brave);
  });

  it('returns undefined when nothing is available', () => {
    const path = resolveChromiumBinary({
      env: {},
      platform: 'darwin',
      home: '/Users/dev',
      canAccess: () => false,
      chromeInstallations: () => [],
    });
    expect(path).toBeUndefined();
  });
});

describe('chromiumCandidates', () => {
  it('lists Chrome before Brave on macOS', () => {
    const candidates = chromiumCandidates('darwin', '/Users/dev');
    const chromeIdx = candidates.findIndex((p) => p.includes('Google Chrome.app'));
    const braveIdx = candidates.findIndex((p) => p.includes('Brave Browser.app'));
    expect(chromeIdx).toBeGreaterThanOrEqual(0);
    expect(braveIdx).toBeGreaterThan(chromeIdx);
  });
});
