/** Soft caps and confirm helpers used by UI + settings — no crypto deps. */

export const MAX_ADDRESS_BOOK_ENTRIES = 50;
export const MAX_ADDRESS_BOOK_LABEL_LENGTH = 40;

/** Last N characters of an address for confirm-step matching. */
export const ADDRESS_CONFIRM_SUFFIX_LENGTH = 6;

export function addressConfirmSuffix(address: string): string {
  return address.slice(-ADDRESS_CONFIRM_SUFFIX_LENGTH);
}

export function matchesAddressConfirmSuffix(
  address: string,
  suffix: string
): boolean {
  if (
    typeof suffix !== 'string' ||
    suffix.length < ADDRESS_CONFIRM_SUFFIX_LENGTH
  ) {
    return false;
  }
  return addressConfirmSuffix(address) === suffix;
}
