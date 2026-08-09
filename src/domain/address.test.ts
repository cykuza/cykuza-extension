import { describe, expect, it } from 'vitest';
import { assertValidAddress, isValidAddress } from './address';
import { unlockIdentity } from './keyring';
import { TxError } from './errors';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('assertValidAddress', () => {
  it('accepts mainnet cy1 P2WPKH from fixture', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    expect(id.address.startsWith('cy1')).toBe(true);
    expect(() => assertValidAddress(id.address, 'mainnet')).not.toThrow();
    expect(isValidAddress(id.address, 'mainnet')).toBe(true);
  });

  it('accepts testnet tcyb1 P2WPKH from fixture', async () => {
    const id = await unlockIdentity(FIXTURE_MNEMONIC, 'testnet');
    expect(id.address.startsWith('tcyb1')).toBe(true);
    expect(() => assertValidAddress(id.address, 'testnet')).not.toThrow();
    expect(isValidAddress(id.address, 'testnet')).toBe(true);
  });

  it('rejects mainnet address on testnet and vice versa', async () => {
    const main = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const test = await unlockIdentity(FIXTURE_MNEMONIC, 'testnet');

    expect(() => assertValidAddress(main.address, 'testnet')).toThrow(TxError);
    expect(() => assertValidAddress(test.address, 'mainnet')).toThrow(TxError);
    expect(isValidAddress(main.address, 'testnet')).toBe(false);
    expect(isValidAddress(test.address, 'mainnet')).toBe(false);
  });

  it('rejects empty, base58, and garbage', () => {
    expect(() => assertValidAddress('', 'mainnet')).toThrow(TxError);
    expect(() => assertValidAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'mainnet')).toThrow(
      TxError
    );
    expect(() => assertValidAddress('not-an-address', 'mainnet')).toThrow(TxError);
    expect(() =>
      assertValidAddress('cy1qinvalidchecksumxxxxxxxxxxxxxxxxxxxx', 'mainnet')
    ).toThrow(TxError);
  });
});
