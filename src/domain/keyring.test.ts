import { describe, expect, it } from 'vitest';
import {
  addressToScriptHash,
  CYBERYEN_COIN_TYPE,
  DEFAULT_DERIVATION_PATH,
  generateMnemonic,
  getDerivationPath,
  mnemonicFingerprint,
  MNEMONIC_WORD_COUNT,
  previewReceiveAddress,
  rematerializeForNetwork,
  seedFingerprintFromMnemonic,
  unlockIdentity,
  validateMnemonic,
  wipeIdentity,
  WrongBip39PassphraseError,
  WRONG_BIP39_PASSPHRASE,
} from './keyring';
const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const FIXTURE_MNEMONIC_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

describe('derivation', () => {
  it('uses Cyberyen coin type 802 and BIP84 path', () => {
    expect(CYBERYEN_COIN_TYPE).toBe(802);
    expect(getDerivationPath(0)).toBe("m/84'/802'/0'/0/0");
    expect(DEFAULT_DERIVATION_PATH).toBe("m/84'/802'/0'/0/0");
  });
});

describe('mnemonic', () => {
  it('generates a 24-word mnemonic by default', () => {
    const mnemonic = generateMnemonic();
    expect(mnemonic.split(' ')).toHaveLength(MNEMONIC_WORD_COUNT);
    expect(MNEMONIC_WORD_COUNT).toBe(24);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('generates a 12-word mnemonic when requested', () => {
    const mnemonic = generateMnemonic(12);
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('generates a 24-word mnemonic when requested', () => {
    const mnemonic = generateMnemonic(24);
    expect(mnemonic.split(' ')).toHaveLength(24);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('accepts 12 and 24-word BIP39 phrases and rejects others', () => {
    expect(validateMnemonic(FIXTURE_MNEMONIC)).toBe(true);
    expect(validateMnemonic(FIXTURE_MNEMONIC_24)).toBe(true);
    expect(validateMnemonic('not a real mnemonic phrase at all here')).toBe(
      false
    );
    expect(
      validateMnemonic(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
      )
    ).toBe(false);
  });

  it('accepts the 12-word fixture', () => {
    expect(validateMnemonic(FIXTURE_MNEMONIC)).toBe(true);
  });

  it('mnemonicFingerprint is stable and does not include the mnemonic', () => {
    const fp = mnemonicFingerprint(FIXTURE_MNEMONIC);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(fp).toBe(mnemonicFingerprint(`  ${FIXTURE_MNEMONIC}  `));
    expect(fp).not.toContain('abandon');
  });
});

describe('BIP39 passphrase', () => {
  it('empty passphrase matches legacy unlock address', async () => {
    const legacy = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const withEmpty = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: '',
    });
    expect(withEmpty.address).toBe(legacy.address);
    wipeIdentity(legacy);
    wipeIdentity(withEmpty);
  });

  it('different passphrases yield different addresses', async () => {
    const a = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: 'alpha',
    });
    const b = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: 'bravo',
    });
    expect(a.address).not.toBe(b.address);
    wipeIdentity(a);
    wipeIdentity(b);
  });

  it('seedFingerprint matches and rejects wrong passphrase', async () => {
    const fp = await seedFingerprintFromMnemonic(FIXTURE_MNEMONIC, 'correct-pp');
    expect(fp).toMatch(/^[0-9a-f]{32}$/);

    const ok = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: 'correct-pp',
      expectedSeedFingerprint: fp,
    });
    expect(ok.kind).toBe('mnemonic');
    wipeIdentity(ok);

    // Legacy 8-hex verifier still matches the prefix.
    const legacyOk = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: 'correct-pp',
      expectedSeedFingerprint: fp.slice(0, 8),
    });
    expect(legacyOk.kind).toBe('mnemonic');
    wipeIdentity(legacyOk);

    await expect(
      unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
        passphrase: 'wrong-pp',
        expectedSeedFingerprint: fp,
      })
    ).rejects.toBeInstanceOf(WrongBip39PassphraseError);

    await expect(
      unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
        passphrase: 'wrong-pp',
        expectedSeedFingerprint: fp,
      })
    ).rejects.toThrow(WRONG_BIP39_PASSPHRASE);
  });

  it('rematerializeForNetwork preserves kind/secret without passphrase', async () => {
    const main = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet', {
      passphrase: 'trezor',
    });
    const test = rematerializeForNetwork(main, 'testnet');
    expect(test.kind).toBe('mnemonic');
    expect(test.secret).toBe(FIXTURE_MNEMONIC);
    expect(test.address).not.toBe(main.address);
    expect(test.keyPair.publicKey).toEqual(main.keyPair.publicKey);
    wipeIdentity(main);
    wipeIdentity(test);
  });
});

describe('unlockIdentity', () => {
  it('derives a deterministic mainnet P2WPKH address from fixture mnemonic', async () => {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    expect(identity.kind).toBe('mnemonic');
    expect(identity.derivationPath).toBe("m/84'/802'/0'/0/0");
    expect(identity.address.startsWith('cy1')).toBe(true);
    expect(identity.scripthash).toHaveLength(64);
    expect(identity.scripthash).toBe(
      addressToScriptHash(identity.address, 'mainnet')
    );

    const again = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    expect(again.address).toBe(identity.address);
    expect(again.scripthash).toBe(identity.scripthash);
  });

  it('unlocks a 24-word fixture', async () => {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC_24, 'mainnet');
    expect(identity.kind).toBe('mnemonic');
    expect(identity.address.startsWith('cy1')).toBe(true);
    const preview = await previewReceiveAddress(FIXTURE_MNEMONIC_24, 'mainnet');
    expect(preview).toBe(identity.address);
    wipeIdentity(identity);
  });

  it('imports hex private key', async () => {
    // Valid secp256k1 private key (1).
    const validHex =
      '0000000000000000000000000000000000000000000000000000000000000001';
    const identity = await unlockIdentity(validHex, 'mainnet');
    expect(identity.kind).toBe('privateKey');
    expect(identity.address.startsWith('cy1')).toBe(true);
  });

  it('imports WIF private key', async () => {
    // Derive WIF from known key via unlock hex then re-import WIF.
    const validHex =
      '0000000000000000000000000000000000000000000000000000000000000001';
    const fromHex = await unlockIdentity(validHex, 'mainnet');
    const wif = fromHex.keyPair.toWIF();
    const fromWif = await unlockIdentity(wif, 'mainnet');
    expect(fromWif.kind).toBe('privateKey');
    expect(fromWif.address).toBe(fromHex.address);
  });

  it('rejects invalid 12-ish word strings before treating as key', async () => {
    await expect(
      unlockIdentity(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
        'mainnet'
      )
    ).rejects.toThrow(/Invalid mnemonic/);
  });

  it('derives kind from secret content (handlers must assert vault label)', async () => {
    // A vault whose JSON `kind` disagrees with the secret would unlock under the
    // derived kind; create/import/unlock handlers reject that mismatch.
    const unlocked = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    expect(unlocked.kind).toBe('mnemonic');
    expect(unlocked.kind).not.toBe('privateKey');
    wipeIdentity(unlocked);
  });
});

describe('wipeIdentity', () => {
  it('zeroes privateKey buffer and clears string fields', async () => {
    const identity = await unlockIdentity(FIXTURE_MNEMONIC, 'mainnet');
    const priv = identity.keyPair.privateKey;
    expect(priv).toBeDefined();
    expect(priv!.some((b) => b !== 0)).toBe(true);
    expect(identity.secret.length).toBeGreaterThan(0);
    expect(identity.address.length).toBeGreaterThan(0);
    expect(identity.derivationPath).toBeDefined();
    expect(identity.derivationPath!.length).toBeGreaterThan(0);

    wipeIdentity(identity);

    expect(identity.secret).toBe('');
    expect(identity.address).toBe('');
    expect(identity.scripthash).toBe('');
    expect(identity.derivationPath).toBeUndefined();
    expect(priv!.every((b) => b === 0)).toBe(true);
  });
});
