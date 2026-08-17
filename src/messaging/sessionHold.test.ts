import { describe, expect, it } from 'vitest';
import { SESSION_HOLD_PORT } from './sessionHold';

describe('sessionHold', () => {
  it('exports a stable Port name distinct from chain watch', () => {
    expect(SESSION_HOLD_PORT).toBe('cykuza-session-hold');
  });
});
