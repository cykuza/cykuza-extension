import { describe, expect, it } from 'vitest';
import {
  TX_MESSAGES,
  sendErrorClearsConfirmation,
} from './errors';

describe('sendErrorClearsConfirmation', () => {
  it('matches exact confirmation-invalidating dictionary messages', () => {
    expect(
      sendErrorClearsConfirmation(TX_MESSAGES.CONFIRMATION_EXPIRED)
    ).toBe(true);
    expect(
      sendErrorClearsConfirmation(TX_MESSAGES.CONFIRMATION_INVALID)
    ).toBe(true);
    expect(
      sendErrorClearsConfirmation(TX_MESSAGES.ADDRESS_CONFIRM_MISMATCH)
    ).toBe(true);
    expect(
      sendErrorClearsConfirmation(TX_MESSAGES.SPEND_LIMIT_OVERRIDE_REQUIRED)
    ).toBe(true);
    expect(
      sendErrorClearsConfirmation(TX_MESSAGES.LARGE_SEND_ACK_REQUIRED)
    ).toBe(true);
  });

  it('does not clear on wrong password or unrelated errors', () => {
    expect(sendErrorClearsConfirmation('Invalid password')).toBe(false);
    expect(sendErrorClearsConfirmation(TX_MESSAGES.LOCKED)).toBe(false);
    expect(sendErrorClearsConfirmation(TX_MESSAGES.INSUFFICIENT)).toBe(false);
    expect(sendErrorClearsConfirmation('confirmation expired somehow')).toBe(
      false
    );
  });
});
