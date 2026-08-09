/**
 * Architectural integrity: domain layer must stay chrome-free and
 * must not import UI / SW / platform adapters.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const DOMAIN_DIR = join(ROOT, 'src/domain');

const FORBIDDEN = [
  /\bchrome\./,
  /\bbrowser\./,
  /from ['"]chrome['"]/,
  /from ['"].*\/platform\//,
  /from ['"].*\/sw\//,
  /from ['"].*\/ui\//,
  /from ['"].*\/messaging\//,
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
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

describe('domain layer boundaries', () => {
  it('does not import chrome / platform / sw / ui / messaging', () => {
    const files = collectTsFiles(DOMAIN_DIR);
    expect(files.length).toBeGreaterThan(5);

    const violations: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(src)) {
          violations.push(`${relative(ROOT, file)} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
