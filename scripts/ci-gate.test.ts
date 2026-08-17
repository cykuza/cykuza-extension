import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GATE_STEPS } from './ci-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('CI gate', () => {
  it('exports the GitHub Actions step order', () => {
    expect(GATE_STEPS).toEqual([
      'audit:prod',
      'audit:toolchain',
      'lint',
      'check:leaks',
      'test',
      'compile',
      'build',
      'build:firefox',
      'check:no-secrets',
    ]);
  });

  it('GitHub workflow runs npm run gate after npm ci (no duplicate scripts)', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(yml).toMatch(/npm ci/);
    expect(yml).toMatch(/npm run gate/);
    for (const step of GATE_STEPS) {
      expect(yml).not.toMatch(new RegExp(`npm run ${step}\\b`));
    }
  });

  it('GitHub workflow uses Node 24 action runtimes (not deprecated Node 20 @v4)', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(yml).not.toMatch(/actions\/checkout@v4\b/);
    expect(yml).not.toMatch(/actions\/setup-node@v4\b/);
    expect(yml).toMatch(/actions\/checkout@v[6-9]\b/);
    expect(yml).toMatch(/actions\/setup-node@v[6-9]\b/);
  });

  it('pre-push hook runs npm run gate', () => {
    const hook = readFileSync(join(ROOT, '.githooks/pre-push'), 'utf8');
    expect(hook).toMatch(/npm run gate/);
  });
});
