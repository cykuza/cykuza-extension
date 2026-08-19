import { describe, expect, it } from 'vitest';
import { scanJsForAmoUnsafe } from './check-amo.mjs';

describe('check-amo scan', () => {
  it('flags innerHTML assignment and Function constructors', () => {
    expect(scanJsForAmoUnsafe('el.innerHTML = x')).toEqual([
      { rule: 'innerHTML-assign', match: '.innerHTML =' },
    ]);
    expect(scanJsForAmoUnsafe('new Function("return this")')).toEqual([
      { rule: 'new-Function', match: 'new Function' },
    ]);
    expect(scanJsForAmoUnsafe('const F=Function;new F("")')).toEqual([
      { rule: 'new-F', match: 'new F(' },
    ]);
  });

  it('ignores innerHTML reads and Function identifiers', () => {
    expect(scanJsForAmoUnsafe('case "innerHTML": break;')).toEqual([]);
    expect(scanJsForAmoUnsafe('typeof Function === "function"')).toEqual([]);
  });
});
