/**
 * In-memory preview confirmation store for the service worker.
 *
 * Tokens are cryptographically random, single-use, short-TTL, and bound to
 * session generation + network + wallet address. Never persisted.
 */

import type { SpendPlan } from '../domain/transaction';
import { TxError } from '../domain/errors';
import type { NetworkType } from '../domain/network';
import type { SendConfirmation } from '../messaging/protocol';

/** Confirmation token TTL (2 minutes). */
export const CONFIRMATION_TTL_MS = 2 * 60 * 1000;

export interface PendingConfirmation {
  token: string;
  plan: SpendPlan;
  confirmation: SendConfirmation;
  sessionGeneration: number;
  network: NetworkType;
  address: string;
  createdAt: number;
  expiresAt: number;
  spendLimitExceeded: boolean;
  largeSend: boolean;
}

const pending = new Map<string, PendingConfirmation>();

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function confirmationFromPlan(
  plan: SpendPlan,
  flags: {
    spendLimitExceeded: boolean;
    largeSend: boolean;
    dailySpendRemainingSats: number | null;
  }
): SendConfirmation {
  return {
    to: plan.toAddress,
    amountSats: plan.amountSats,
    fee: plan.fee,
    total: plan.total,
    includeFee: plan.includeFee,
    spendLimitExceeded: flags.spendLimitExceeded,
    largeSend: flags.largeSend,
    dailySpendRemainingSats: flags.dailySpendRemainingSats,
  };
}

export function storeConfirmation(params: {
  plan: SpendPlan;
  sessionGeneration: number;
  network: NetworkType;
  address: string;
  spendLimitExceeded: boolean;
  largeSend: boolean;
  dailySpendRemainingSats: number | null;
  now?: number;
}): { token: string; confirmation: SendConfirmation } {
  const now = params.now ?? Date.now();
  // Only one pending confirmation at a time per wallet session.
  clearConfirmations();
  const token = randomToken();
  const confirmation = confirmationFromPlan(params.plan, {
    spendLimitExceeded: params.spendLimitExceeded,
    largeSend: params.largeSend,
    dailySpendRemainingSats: params.dailySpendRemainingSats,
  });
  pending.set(token, {
    token,
    plan: params.plan,
    confirmation,
    sessionGeneration: params.sessionGeneration,
    network: params.network,
    address: params.address,
    createdAt: now,
    expiresAt: now + CONFIRMATION_TTL_MS,
    spendLimitExceeded: params.spendLimitExceeded,
    largeSend: params.largeSend,
  });
  return { token, confirmation };
}

/**
 * Atomically take a pending confirmation (removes it).
 * Validates TTL, session generation, network, and address binding.
 */
export function takeConfirmation(params: {
  token: string;
  sessionGeneration: number;
  network: NetworkType;
  address: string;
  now?: number;
}): PendingConfirmation {
  const now = params.now ?? Date.now();
  const entry = pending.get(params.token);
  if (!entry) {
    throw new TxError('CONFIRMATION_INVALID');
  }
  // Always delete — one-shot even on validation failure.
  pending.delete(params.token);

  if (now > entry.expiresAt) {
    throw new TxError('CONFIRMATION_EXPIRED');
  }
  if (
    entry.sessionGeneration !== params.sessionGeneration ||
    entry.network !== params.network ||
    entry.address !== params.address
  ) {
    throw new TxError('CONFIRMATION_INVALID');
  }
  return entry;
}

export function clearConfirmations(): void {
  pending.clear();
}

/** Test helper — peek without consuming. */
export function peekConfirmation(token: string): PendingConfirmation | undefined {
  return pending.get(token);
}

export function pendingConfirmationCount(): number {
  return pending.size;
}
