/**
 * Source must not assign innerHTML, use dangerouslySetInnerHTML, or construct
 * Function. Vendor copies of those APIs are stripped at the Vite boundary.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const SCAN_DIRS = [join(ROOT, 'src'), join(ROOT, 'entrypoints')];

const FORBIDDEN = [
  { name: 'innerHTML', pattern: /\.innerHTML\b/ },
  { name: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/ },
  { name: 'new Function', pattern: /\bnew Function\b/ },
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

describe('AMO-unsafe APIs stay out of extension source', () => {
  it('does not use innerHTML, dangerouslySetInnerHTML, or new Function', () => {
    const files = SCAN_DIRS.flatMap(collectTsFiles);
    expect(files.length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(src)) {
          violations.push(`${relative(ROOT, file)} uses ${rule.name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('imports Zod only through the jitless messaging boundary', () => {
    const files = SCAN_DIRS.flatMap(collectTsFiles);
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel.replace(/\\/g, '/') === 'src/messaging/zod.ts') continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/from ['"]zod['"]/.test(src) || /from ['"]zod\//.test(src)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
