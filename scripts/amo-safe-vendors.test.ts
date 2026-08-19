import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  matchAmoUnsafeVendor,
  rewriteAmoUnsafeVendor,
} from './amo-safe-vendors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('amo-safe-vendors', () => {
  it('matches only the AMO-unsafe vendor modules', () => {
    expect(matchAmoUnsafeVendor('/x/node_modules/zod/v4/core/doc.js')).toBe(
      'zod-doc'
    );
    expect(matchAmoUnsafeVendor('/x/node_modules/zod/v4/core/util.cjs')).toBe(
      'zod-util'
    );
    expect(
      matchAmoUnsafeVendor(
        '/x/node_modules/react-dom/cjs/react-dom-client.production.js'
      )
    ).toBe('react-dom-prod');
    expect(matchAmoUnsafeVendor('/x/src/ui/App.tsx')).toBeNull();
  });

  it('strips Function from the installed Zod doc and util sources', () => {
    const doc = readFileSync(
      join(ROOT, 'node_modules/zod/v4/core/doc.js'),
      'utf8'
    );
    const util = readFileSync(
      join(ROOT, 'node_modules/zod/v4/core/util.js'),
      'utf8'
    );
    const docOut = rewriteAmoUnsafeVendor('zod-doc', doc);
    const utilOut = rewriteAmoUnsafeVendor('zod-util', util);
    expect(docOut).not.toMatch(/\bFunction\b/);
    expect(utilOut).not.toMatch(/new F\(/);
    expect(utilOut).toContain('return false');
  });

  it('strips innerHTML assignments from React DOM production', () => {
    const src = readFileSync(
      join(
        ROOT,
        'node_modules/react-dom/cjs/react-dom-client.production.js'
      ),
      'utf8'
    );
    const out = rewriteAmoUnsafeVendor('react-dom-prod', src);
    expect(out).not.toMatch(/\.innerHTML\s*=/);
    expect(out).toContain('createElement("script")');
  });
});
