/**
 * Single Zod entry for the extension. JIT object-parse uses `Function`;
 * MV3 CSP and AMO forbid that, so jitless is the protocol default.
 * Must run before any schema parse (allowsEval is memoised).
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
