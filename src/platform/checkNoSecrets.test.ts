/**
 * Hard gate: same artifact scanner as `npm run check:no-secrets`.
 * Skips when `.output` is missing (local vitest without a prior build).
 * CI always runs `build` + `build:firefox` then `check:no-secrets`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanOutput } from '../../scripts/check-no-secrets.mjs';

const root = join(import.meta.dirname, '../..');
const hasOutputs =
  existsSync(join(root, '.output/chrome-mv3')) &&
  existsSync(join(root, '.output/firefox-mv3'));

describe('artifact secret scan', () => {
  it.skipIf(!hasOutputs)(
    'reports no forbidden perms, localhost, hosts, or private keys in .output',
    () => {
      expect(scanOutput()).toEqual([]);
    }
  );
});
