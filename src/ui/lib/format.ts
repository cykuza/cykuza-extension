export function satsToCy(sats: number): number {
  return sats / 1e8;
}

export function cyToSats(amount: number): number {
  return Math.floor(amount * 1e8);
}

export function formatSats(sats: number): string {
  return `${satsToCy(sats).toFixed(8)} CY`;
}

export function truncateAddress(address: string, head = 6, tail = 6): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function truncateHash(hash: string, head = 12): string {
  if (hash.length <= head) return hash;
  return `${hash.slice(0, head)}…`;
}

export function networkLabel(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet' ? 'Testnet' : 'Mainnet';
}
