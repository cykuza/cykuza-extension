import type { NetworkType } from './network';

const HRP: Record<NetworkType, string> = {
  mainnet: 'cy',
  testnet: 'tcyb',
};

/** Bech32 data charset (no 1, b, i, o). */
const BECH32_DATA = /^[02-9ac-hj-np-z]+$/;

/**
 * Soft UX address shape check — HRP + bech32 charset.
 * Authoritative validation is {@link assertValidAddress} in the SW path.
 */
export function looksLikeNetworkAddress(
  address: string,
  network: NetworkType
): boolean {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed) return false;
  const hrp = HRP[network];
  const prefix = `${hrp}1`;
  if (!trimmed.startsWith(prefix)) return false;
  const data = trimmed.slice(prefix.length);
  // Native segwit payloads are longer than a few chars; reject empty/absurd.
  if (data.length < 11 || data.length > 71) return false;
  return BECH32_DATA.test(data);
}
