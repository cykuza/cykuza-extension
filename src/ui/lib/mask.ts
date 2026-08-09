export function maskWssUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//••••${u.port ? `:${u.port}` : ''}`;
  } catch {
    return 'wss://••••';
  }
}

export function maskAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
