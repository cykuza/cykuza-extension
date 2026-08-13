import { describe, expect, it } from 'vitest';
import { pickQuizIndices, wordsMatch } from './quiz';

describe('pickQuizIndices', () => {
  it('returns count distinct sorted indices in range', () => {
    for (let n = 0; n < 40; n++) {
      const picked = pickQuizIndices(12, 3);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
      expect([...picked].sort((a, b) => a - b)).toEqual(picked);
      for (const idx of picked) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(12);
      }
    }
  });

  it('handles 24-word length and caps at available words', () => {
    const picked = pickQuizIndices(24, 3);
    expect(picked).toHaveLength(3);
    expect(pickQuizIndices(2, 3)).toEqual([0, 1]);
    expect(pickQuizIndices(0, 3)).toEqual([]);
  });
});

describe('wordsMatch', () => {
  it('compares trimmed case-insensitive words', () => {
    expect(wordsMatch('Abandon', ' abandon ')).toBe(true);
    expect(wordsMatch('about', 'ABOUT')).toBe(true);
    expect(wordsMatch('about', 'above')).toBe(false);
  });
});
