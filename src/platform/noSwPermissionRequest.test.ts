/**
 * Static guard: service worker / domain / background must never call
 * chrome.permissions.request or import requestHostPermission.
 * The electrum-grant page owns the user-gesture request(); SW may only
 * contains/remove.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

const SCAN_DIRS = [join(ROOT, 'src/sw'), join(ROOT, 'src/domain')];
const SCAN_FILES = [join(ROOT, 'entrypoints/background.ts')];

const FORBIDDEN = [
  /permissions\.request\b/,
  /\brequestHostPermission\b/,
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('SW never calls permissions.request', () => {
  it('scans sw / domain / background for forbidden permission request APIs', () => {
    const files = [...SCAN_DIRS.flatMap(collectTsFiles), ...SCAN_FILES];
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(src)) {
          violations.push(
            `${relative(ROOT, file)} matches ${pattern}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
