/**
 * Client-side pagination helper for Activity history.
 */

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): {
  page: number;
  pageCount: number;
  items: T[];
  total: number;
} {
  const size = Math.max(1, Math.floor(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (safePage - 1) * size;
  return {
    page: safePage,
    pageCount,
    items: items.slice(start, start + size),
    total,
  };
}

export const ACTIVITY_PAGE_SIZE = 5;
