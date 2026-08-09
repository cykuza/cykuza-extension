/** Pick `count` distinct random indices in [0, length). */
export function pickQuizIndices(length: number, count: number): number[] {
  const pool = Array.from({ length }, (_, i) => i);
  const out: number[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out.sort((a, b) => a - b);
}

export function wordsMatch(expected: string, actual: string): boolean {
  return expected.trim().toLowerCase() === actual.trim().toLowerCase();
}
