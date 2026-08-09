import { describe, expect, it } from 'vitest';
import { ACTIVITY_PAGE_SIZE, paginate } from './paginate';

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  it('returns first page slices', () => {
    const result = paginate(items, 1, ACTIVITY_PAGE_SIZE);
    expect(result).toEqual({
      page: 1,
      pageCount: 3,
      items: [1, 2, 3, 4, 5],
      total: 11,
    });
  });

  it('clamps page above pageCount', () => {
    const result = paginate(items, 99, 5);
    expect(result.page).toBe(3);
    expect(result.items).toEqual([11]);
  });

  it('clamps page below 1', () => {
    const result = paginate(items, 0, 5);
    expect(result.page).toBe(1);
    expect(result.items).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles empty list as a single empty page', () => {
    expect(paginate([], 1, 5)).toEqual({
      page: 1,
      pageCount: 1,
      items: [],
      total: 0,
    });
  });
});
