import { z } from 'zod';
import { ELECTRUM_TRUST_LEVELS } from '../domain/electrumTrust';
import { assertNewPassword } from '../domain/passwordPolicy';

/** Messaging protocol version. Bump when request/response shapes change. */
export const PROTOCOL_VERSION = 15 as const;

/**
 * Create / Import password — hard gate only (trimmed length).
 * Unlock / reveal / send keep min(1) for existing vaults.
 */
const NewPasswordSchema = z.string().superRefine((password, ctx) => {
  const result = assertNewPassword(password);
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: result.error,
    });
  }
});

export const NetworkTypeSchema = z.enum(['mainnet', 'testnet']);

export const SecretKindSchema = z.enum(['mnemonic', 'privateKey']);

export const ElectrumEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default'), url: z.string() }),
  z.object({ kind: z.literal('custom'), url: z.string() }),
]);

export const ElectrumConnectionStatusSchema = z.enum([
  'idle',
  'connecting',
  'connected',
  'error',
  'unconfigured',
]);

export const ElectrumPublicSchema = z.object({
  network: NetworkTypeSchema,
  endpoints: z.array(ElectrumEndpointSchema),
  activeUrl: z.string().nullable(),
  configured: z.boolean(),
});

export const FeeRatesSchema = z.object({
  slow: z.number().int().positive(),
  standard: z.number().int().positive(),
  /**
   * False when Electrum could not estimate (e.g. -1) and rates are the
   * 1 sat/vB minimum — UI should explain this is not a bug.
   */
  estimated: z.boolean(),
});

export type FeeRates = z.infer<typeof FeeRatesSchema>;

export const WalletStatusSchema = z.object({
  hasVault: z.boolean(),
  locked: z.boolean(),
  network: NetworkTypeSchema,
  termsAccepted: z.boolean(),
  autoLockMinutes: z.number(),
  /**
   * When the popup hides, (re)arm idle auto-lock (default on for new installs).
   * Does not wipe keys immediately.
   */
  lockWhenPopupCloses: z.boolean(),
  address: z.string().optional(),
  lockoutUntil: z.number().nullable().optional(),
  remainingAttempts: z.number().optional(),
  balance: z
    .object({
      confirmed: z.number(),
      unconfirmed: z.number(),
    })
    .optional(),
  history: z
    .array(
      z.object({
        tx_hash: z.string(),
        height: z.number(),
      })
    )
    .optional(),
  /** sat/vB presets from estimatefee(6)/(2); `estimated` false ⇒ network minimum. */
  feeRates: FeeRatesSchema.optional(),
  /** Present when unlocked — used to disable mnemonic reveal for PK wallets. */
  secretKind: SecretKindSchema.optional(),
  /**
   * From vault envelope (readable while locked). True for BIP39 passphrase wallets.
   * Passphrase itself is never stored or returned.
   */
  passphraseRequired: z.boolean().optional(),
  /** UTXO snapshot size in SW RAM; undefined means not refreshed yet. */
  utxoCount: z.number().int().nonnegative().optional(),
  /**
   * Kind of last successful Electrum endpoint for Home badge.
   * Never a raw URL — full URLs live only under electrum.endpoints (Settings).
   */
  serverKind: z.enum(['builtin', 'custom']).nullable().optional(),
  serverStatus: ElectrumConnectionStatusSchema.optional(),
  /**
   * True while the UI-scoped Electrum watch holds an open subscribed socket.
   * Independent of last batch `serverStatus` (idle after one-shot ops).
   */
  watchActive: z.boolean().optional(),
  electrum: ElectrumPublicSchema.optional(),
  /** Optional user explorer tx template (`https://…/{txid}`); null/absent = no link. */
  explorerTxTemplate: z.string().nullable().optional(),
  /** Local address book (label + address + network). */
  addressBook: z
    .array(
      z.object({
        label: z.string(),
        address: z.string(),
        network: NetworkTypeSchema,
      })
    )
    .optional(),
  /** Optional daily spend limit in sats; null = disabled. */
  dailySpendLimitSats: z.number().int().positive().nullable().optional(),
  /** Sats already spent today under the daily limit (0 if rolled / unset). */
  dailySpendUsedSats: z.number().int().nonnegative().optional(),
  /**
   * When true and ≥2 permitted endpoints exist, Refresh/watch/preview/broadcast
   * cross-check a second server. Required when ≥2 endpoints are configured.
   */
  verifyWithSecondServer: z.boolean().optional(),
  /**
   * Electrum trust assessment for the active network.
   * Chain ops fail closed on `degraded` and `verify_off`.
   */
  electrumTrust: z.enum(ELECTRUM_TRUST_LEVELS).optional(),
  /**
   * True when vault storage is present but the envelope is unparseable /
   * unknown version. hasVault is also true; create/import are blocked.
   */
  vaultCorrupt: z.boolean().optional(),
  /** Host-free short phrase / stable code message for UI. */
  error: z.string().optional(),
});

export type WalletStatus = z.infer<typeof WalletStatusSchema>;

/**
 * Confirm DTO for UI — public amounts only, never keys / hex / PSBT.
 * `amountSats` is always what the recipient receives.
 * `total` is the wallet debit (amount + fee, or the includeFee entered total).
 */
export const SendConfirmationSchema = z.object({
  to: z.string(),
  amountSats: z.number().int().nonnegative(),
  fee: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  includeFee: z.boolean(),
  /** True when this send would exceed the optional daily spend limit. */
  spendLimitExceeded: z.boolean(),
  /** True when total debit is >50% of confirmed balance. */
  largeSend: z.boolean(),
  /** Remaining sats under the daily limit before this send; null if limit off. */
  dailySpendRemainingSats: z.number().int().nonnegative().nullable(),
});

export type SendConfirmation = z.infer<typeof SendConfirmationSchema>;

/** Live preview estimate from cached UTXOs — no confirmation token. */
export const SendEstimateSchema = z.object({
  amountSats: z.number().int().nonnegative(),
  fee: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  feeRate: z.number().int().positive(),
  changeSats: z.number().int().nonnegative(),
  hasChange: z.boolean(),
});

export type SendEstimate = z.infer<typeof SendEstimateSchema>;

const BaseRequest = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
});

const ElectrumEndpointInputSchema = z.object({
  kind: z.enum(['default', 'custom']),
  url: z.string().min(1),
});

/**
 * Versioned UI → service worker requests.
 * Secrets (password / mnemonic / private key) travel only in these messages
 * and must never be logged or stored by the UI after the RPC returns.
 * `.strict()` rejects unknown keys (foreign shape).
 */
export const WalletRequestSchema = z.discriminatedUnion('type', [
  BaseRequest.extend({ type: z.literal('getStatus') }).strict(),
  BaseRequest.extend({ type: z.literal('acceptTerms') }).strict(),
  BaseRequest.extend({
    type: z.literal('create'),
    password: NewPasswordSchema,
    /** BIP39 word count; default 24 (CSPRNG strength 256). */
    wordCount: z.union([z.literal(12), z.literal(24)]).default(24),
    /** Seed entropy mode; default csprng. */
    entropyMode: z.enum(['csprng', 'mixed', 'user']).default('csprng'),
    /** Digits 1–6 only; omit for csprng. Validated in domain. */
    diceRolls: z.string().optional(),
    /** Even-length hex; omit for csprng. Validated in domain. */
    hexEntropy: z.string().optional(),
    /** Optional BIP39 passphrase (25th word). Never stored in the vault. */
    passphrase: z.string().optional(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('import'),
    password: NewPasswordSchema,
    secret: z.string().min(1),
    kind: z.enum(['mnemonic', 'privateKey']),
    /** Optional BIP39 passphrase — mnemonic wallets only. Never stored. */
    passphrase: z.string().optional(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('unlock'),
    password: z.string().min(1),
    /** Required when vault.passphraseRequired; ignored otherwise. */
    passphrase: z.string().optional(),
  }).strict(),
  BaseRequest.extend({ type: z.literal('lock') }).strict(),
  /**
   * Popup became hidden (permission prompt, focus switch, dismiss).
   * Arms idle auto-lock when lockWhenPopupCloses is on — never tears down
   * immediately (Chrome host-permission UI closes the action popup).
   */
  BaseRequest.extend({ type: z.literal('popupHidden') }).strict(),
  BaseRequest.extend({ type: z.literal('destroySession') }).strict(),
  /** Refresh balance / history / fees / utxos (reuses watch socket when live). */
  BaseRequest.extend({ type: z.literal('refresh') }).strict(),
  BaseRequest.extend({
    type: z.literal('setNetwork'),
    network: NetworkTypeSchema,
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setElectrumConfig'),
    network: NetworkTypeSchema,
    endpoints: z.array(ElectrumEndpointInputSchema),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('testElectrum'),
    url: z.string().min(1),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setAutoLock'),
    minutes: z.number().int().min(1).max(1440),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setLockWhenPopupCloses'),
    enabled: z.boolean(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setExplorer'),
    template: z.string().nullable(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setAddressBook'),
    entries: z.array(
      z.object({
        label: z.string().min(1).max(40),
        address: z.string().min(1),
        network: NetworkTypeSchema,
      })
    ),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setDailySpendLimit'),
    /** null disables the limit. */
    limitSats: z.number().int().positive().nullable(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('setVerifyWithSecondServer'),
    enabled: z.boolean(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('revealSecret'),
    password: z.string().min(1),
    kind: SecretKindSchema,
  }).strict(),
  BaseRequest.extend({
    type: z.literal('estimateSend'),
    to: z.string().optional(),
    amountSats: z.number().int().positive(),
    includeFee: z.boolean().optional(),
    feeRate: z.number().int().positive(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('previewSend'),
    to: z.string().min(1),
    amountSats: z.number().int().positive(),
    includeFee: z.boolean().optional(),
    feeRate: z.number().int().positive().optional(),
  }).strict(),
  BaseRequest.extend({
    type: z.literal('send'),
    confirmationToken: z.string().min(1),
    password: z.string().min(1),
    /** Last 6 characters of the recipient address (SW-validated). */
    toConfirmSuffix: z.string().length(6),
    /** Required when confirmation.spendLimitExceeded. */
    allowSpendLimitOnce: z.boolean().optional(),
    /** Required when confirmation.largeSend. */
    acknowledgeLargeSend: z.boolean().optional(),
  }).strict(),
]);

export type WalletRequest = z.infer<typeof WalletRequestSchema>;

/** Probe result — version only; never echo server URL into UI banners. */
export const ElectrumProbeSchema = z.object({
  version: z.tuple([z.string(), z.string()]),
});

export const WalletResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    status: WalletStatusSchema,
    /** One-shot mnemonic returned only from `create` — UI must not persist it. */
    mnemonic: z.string().optional(),
    /** One-shot probe result from `testElectrum`. */
    probe: ElectrumProbeSchema.optional(),
    /** Preview confirm DTO — no keys/hex. */
    confirmation: SendConfirmationSchema.optional(),
    /** One-time token required by `send`; RAM-only in SW. */
    confirmationToken: z.string().optional(),
    /** Broadcast txid from successful `send`. */
    txid: z.string().optional(),
    /** Live estimate from cached UTXOs (`estimateSend`). */
    estimate: SendEstimateSchema.optional(),
    /** One-shot revealed secret (`revealSecret`) — UI must clear after display. */
    secret: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    remainingAttempts: z.number().optional(),
    lockoutUntil: z.number().nullable().optional(),
    status: WalletStatusSchema.optional(),
  }),
]);

export type WalletResponse = z.infer<typeof WalletResponseSchema>;

export function parseWalletRequest(message: unknown):
  | { success: true; data: WalletRequest }
  | { success: false; error: string } {
  const parsed = WalletRequestSchema.safeParse(message);
  if (!parsed.success) {
    return { success: false, error: 'Invalid request' };
  }
  return { success: true, data: parsed.data };
}

export function parseWalletResponse(message: unknown):
  | { success: true; data: WalletResponse }
  | { success: false; error: string } {
  const parsed = WalletResponseSchema.safeParse(message);
  if (!parsed.success) {
    return { success: false, error: 'Invalid response' };
  }
  return { success: true, data: parsed.data };
}
