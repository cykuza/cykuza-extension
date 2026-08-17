#!/usr/bin/env node
/**
 * Local + GitHub CI verification gate (same steps, same order).
 *
 * Builds set CYKUZA_GATE=1 so WXT ignores maintainer `.env` Electrum URLs
 * (`wxt.config.ts`). Release zips still inject via `npm run zip`.
 *
 * Usage: npm run gate
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GATE_STEPS = [
  'audit:prod',
  'audit:toolchain',
  'lint',
  'check:leaks',
  'test',
  'compile',
  'build',
  'build:firefox',
  'check:no-secrets',
];

function runGate() {
  const env = {
    ...process.env,
    CYKUZA_GATE: '1',
    CYKUZA_ELECTRUM_MAINNET_URLS: '',
  };

  for (const step of GATE_STEPS) {
    process.stdout.write(`\n[gate] npm run ${step}\n`);
    const result = spawnSync('npm', ['run', step], {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      process.stderr.write(`\ngate: failed at npm run ${step}\n`);
      process.exit(result.status === null ? 1 : result.status);
    }
  }

  process.stdout.write('\ngate: ok (matches GitHub CI)\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGate();
}
