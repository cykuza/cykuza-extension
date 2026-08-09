/**
 * Typed domain errors with stable codes for SW → UI mapping.
 * Messages must never embed hostnames, URLs, addresses, or tx hex.
 */

export type TxErrorCode =
  | 'NO_UTXOS'
  | 'INSUFFICIENT'
  | 'AMOUNT_TOO_SMALL'
  | 'INVALID_AMOUNT'
  | 'INVALID_ADDRESS'
  | 'LOCKED'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_INVALID'
  | 'SPEND_LIMIT_OVERRIDE_REQUIRED'
  | 'LARGE_SEND_ACK_REQUIRED'
  | 'ADDRESS_CONFIRM_MISMATCH';

export const TX_MESSAGES: Record<TxErrorCode, string> = {
  NO_UTXOS: 'No spendable UTXOs',
  INSUFFICIENT: 'Insufficient balance',
  AMOUNT_TOO_SMALL: 'Amount is too small to cover the fee',
  INVALID_AMOUNT: 'Amount must be positive',
  INVALID_ADDRESS: 'Invalid address for the selected network',
  LOCKED: 'Wallet is locked',
  CONFIRMATION_EXPIRED: 'Confirmation expired. Preview the transaction again.',
  CONFIRMATION_INVALID: 'Invalid or already used confirmation. Preview again.',
  SPEND_LIMIT_OVERRIDE_REQUIRED:
    'Daily spend limit exceeded. Allow once and confirm with password.',
  LARGE_SEND_ACK_REQUIRED:
    'Large send acknowledgment required (more than half of confirmed balance).',
  ADDRESS_CONFIRM_MISMATCH:
    'Recipient address confirmation does not match. Check the last characters.',
};

/** Send confirmation must be rebuilt when SW returns one of these. */
const SEND_CONFIRMATION_CLEAR_CODES: readonly TxErrorCode[] = [
  'CONFIRMATION_EXPIRED',
  'CONFIRMATION_INVALID',
  'SPEND_LIMIT_OVERRIDE_REQUIRED',
  'LARGE_SEND_ACK_REQUIRED',
  'ADDRESS_CONFIRM_MISMATCH',
];

/**
 * True when a failed `send` response means the confirmation token is spent /
 * invalid and the UI must return to the form (exact dictionary message match).
 */
export function sendErrorClearsConfirmation(error: string): boolean {
  return SEND_CONFIRMATION_CLEAR_CODES.some(
    (code) => error === TX_MESSAGES[code]
  );
}

export class TxError extends Error {
  readonly code: TxErrorCode;

  constructor(code: TxErrorCode, message?: string) {
    super(message ?? TX_MESSAGES[code]);
    this.name = 'TxError';
    this.code = code;
  }
}

export function isTxError(err: unknown): err is TxError {
  return err instanceof TxError;
}

export type ElectrumErrorCode =
  | 'CONNECT_FAILED'
  | 'CONNECT_TIMEOUT'
  | 'CLOSED'
  | 'NOT_CONNECTED'
  | 'RPC_TIMEOUT'
  | 'RPC_ERROR'
  | 'NO_SERVERS'
  | 'PERMISSION_REQUIRED'
  | 'SERVERS_DISAGREE'
  | 'VERIFY_FAILED';

export const ELECTRUM_MESSAGES: Record<ElectrumErrorCode, string> = {
  CONNECT_FAILED: 'Connection failed',
  CONNECT_TIMEOUT: 'Connection timed out',
  CLOSED: 'Disconnected',
  NOT_CONNECTED: 'Not connected to Electrum server',
  RPC_TIMEOUT: 'Electrum request timed out',
  RPC_ERROR: 'Electrum error',
  NO_SERVERS: 'No Electrum servers to connect',
  PERMISSION_REQUIRED:
    'No permitted Electrum servers. Open Settings and grant access (or add a server).',
  SERVERS_DISAGREE: 'Servers disagree — check Electrum config',
  VERIFY_FAILED: 'Could not verify with second server',
};

export class ElectrumError extends Error {
  readonly code: ElectrumErrorCode;

  constructor(code: ElectrumErrorCode, message?: string) {
    super(message ?? ELECTRUM_MESSAGES[code]);
    this.name = 'ElectrumError';
    this.code = code;
  }
}

export function isElectrumError(err: unknown): err is ElectrumError {
  return err instanceof ElectrumError;
}
