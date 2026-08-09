/**
 * Cyberyen network parameters (Litecoin v0.21-style fork).
 * Kept in sync with cykuza-web/lib/cyberyenNetwork.ts
 *
 * Shape matches bitcoinjs-lib `Network` without importing that package —
 * keeps UI/format modules free of crypto bundling.
 */
export interface CyberyenNetwork {
  messagePrefix: string;
  bech32: string;
  bip32: { public: number; private: number };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

export const cyberyenNetwork: CyberyenNetwork = {
  messagePrefix: '\x19Cyberyen Signed Message:\n',
  bech32: 'cy',
  bip32: {
    public: 0x0188b21e,
    private: 0x0188ade4,
  },
  pubKeyHash: 0x1c,
  scriptHash: 0x16,
  wif: 0x9c,
};

export const cyberyenTestnet: CyberyenNetwork = {
  messagePrefix: '\x19Cyberyen Testnet Signed Message:\n',
  bech32: 'tcyb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x70,
  scriptHash: 0x3a,
  wif: 0xc4,
};

export type NetworkType = 'mainnet' | 'testnet';

export function getNetwork(networkType: NetworkType): CyberyenNetwork {
  return networkType === 'testnet' ? cyberyenTestnet : cyberyenNetwork;
}
