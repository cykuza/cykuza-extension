/**
 * Hard gate: same leak scanner as `npm run check:leaks`.
 */
import { describe, expect, it } from 'vitest';
import { scanRepo } from '../../scripts/leak-scan.mjs';

describe('leak scan', () => {
  it('reports no console.* or non-allowlisted Electrum host literals in source', () => {
    const findings = scanRepo();
    expect(findings).toEqual([]);
  });
});
