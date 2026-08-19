/**
 * Popup ↔ SW Port protocol for UI-scoped Electrum watch.
 * Separate from walletRpc (PROTOCOL_VERSION) — Port messages only.
 */

import { z } from './zod';
import { WalletStatusSchema } from './protocol';

export const CHAIN_WATCH_PORT = 'cykuza-chain-watch' as const;

export const WatchClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('watch/start') }).strict(),
]);

export type WatchClientMessage = z.infer<typeof WatchClientMessageSchema>;

export const WatchServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('watch/status'),
      status: WalletStatusSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('watch/error'),
      error: z.string(),
      status: WalletStatusSchema.optional(),
    })
    .strict(),
]);

export type WatchServerMessage = z.infer<typeof WatchServerMessageSchema>;

export function parseWatchClientMessage(
  message: unknown
):
  | { success: true; data: WatchClientMessage }
  | { success: false; error: string } {
  const parsed = WatchClientMessageSchema.safeParse(message);
  if (!parsed.success) {
    return { success: false, error: 'Invalid watch message' };
  }
  return { success: true, data: parsed.data };
}

export function parseWatchServerMessage(
  message: unknown
):
  | { success: true; data: WatchServerMessage }
  | { success: false; error: string } {
  const parsed = WatchServerMessageSchema.safeParse(message);
  if (!parsed.success) {
    return { success: false, error: 'Invalid watch message' };
  }
  return { success: true, data: parsed.data };
}
