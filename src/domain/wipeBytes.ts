/** Best-effort zeroing of mutable byte buffers (JS strings cannot be wiped). */
export function wipeBytes(bytes: Uint8Array | undefined | null): void {
  if (!bytes) return;
  bytes.fill(0);
}
