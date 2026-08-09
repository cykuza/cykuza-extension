import { argon2id } from 'hash-wasm';
import { describe, expect, it } from 'vitest';
import {
  openVault,
  parseVaultCiphertext,
  parseVaultPayload,
  sealVault,
  type VaultCiphertext,
  type VaultCiphertextV2,
} from './vault';

const FIXTURE_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const FP32 = 'a'.repeat(32);
const FP8 = 'abcd1234';

/** Build a legacy v2 passphrase envelope with an 8-hex fingerprint (test only). */
async function sealLegacyV2Passphrase(
  secret: string,
  password: string,
  seedFingerprint: string
): Promise<VaultCiphertextV2> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64 * 1024,
    hashLength: 32,
    outputType: 'binary',
  });
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer.slice(
      rawKey.byteOffset,
      rawKey.byteOffset + rawKey.byteLength
    ),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      kind: 'mnemonic',
      secret,
      seedFingerprint,
    })
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) },
    key,
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
  );
  const toB64 = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };
  return {
    version: 2,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(encrypted)),
    passphraseRequired: true,
  };
}

describe('vault', () => {
  it('seals new wallets as format v3', async () => {
    const payload = {
      kind: 'mnemonic' as const,
      secret: FIXTURE_MNEMONIC,
    };
    const sealed = await sealVault(payload, 'test-password-12');
    expect(sealed.version).toBe(3);
    expect(sealed.passphraseRequired).toBe(false);
    expect(sealed.salt.length).toBeGreaterThan(0);
    expect(sealed.iv.length).toBeGreaterThan(0);
    expect(sealed.ciphertext.length).toBeGreaterThan(0);

    const opened = await openVault(sealed, 'test-password-12');
    expect(opened).toEqual(payload);
  }, 60_000);

  it('round-trips a privateKey payload as v3', async () => {
    const payload = {
      kind: 'privateKey' as const,
      secret: 'a'.repeat(64),
    };
    const sealed = await sealVault(payload, 'another-password');
    expect(sealed.version).toBe(3);
    expect(sealed.passphraseRequired).toBe(false);
    const opened = await openVault(sealed, 'another-password');
    expect(opened).toEqual(payload);
  }, 60_000);

  it('round-trips passphrase wallet with 32-hex seedFingerprint', async () => {
    const payload = {
      kind: 'mnemonic' as const,
      secret: FIXTURE_MNEMONIC,
      seedFingerprint: FP32,
    };
    const sealed = await sealVault(payload, 'vault-password-ok', {
      passphraseRequired: true,
    });
    expect(sealed.version).toBe(3);
    expect(sealed.passphraseRequired).toBe(true);
    const opened = await openVault(sealed, 'vault-password-ok');
    expect(opened).toEqual(payload);
  }, 60_000);

  it('opens legacy v2 passphrase vault with 8-hex fingerprint', async () => {
    const sealed = await sealLegacyV2Passphrase(
      FIXTURE_MNEMONIC,
      'legacy-pp-vault',
      FP8
    );
    expect(sealed.version).toBe(2);
    const opened = await openVault(sealed, 'legacy-pp-vault');
    expect(opened.seedFingerprint).toBe(FP8);
    expect(opened.secret).toBe(FIXTURE_MNEMONIC);
  }, 60_000);

  it('opens legacy v1 vaults without migration', async () => {
    const sealedV3 = await sealVault(
      { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
      'legacy-password-1'
    );
    const sealedV1: VaultCiphertext = {
      version: 1,
      salt: sealedV3.salt,
      iv: sealedV3.iv,
      ciphertext: sealedV3.ciphertext,
    };
    const opened = await openVault(sealedV1, 'legacy-password-1');
    expect(opened).toEqual({ kind: 'mnemonic', secret: FIXTURE_MNEMONIC });
  }, 60_000);

  it('rejects wrong password', async () => {
    const sealed = await sealVault(
      { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
      'correct-horse'
    );
    await expect(openVault(sealed, 'wrong-password')).rejects.toThrow(
      /Invalid password/
    );
  }, 60_000);

  it('rejects tampered ciphertext', async () => {
    const sealed = await sealVault(
      { kind: 'privateKey', secret: 'b'.repeat(64) },
      'password-ok'
    );
    const tampered: VaultCiphertext = {
      ...sealed,
      ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA',
    };
    await expect(openVault(tampered, 'password-ok')).rejects.toThrow(
      /Invalid password/
    );
  }, 60_000);

  it('rejects unsupported vault version', async () => {
    const sealed = await sealVault(
      { kind: 'privateKey', secret: 'c'.repeat(64) },
      'password-ok'
    );
    const bad = { ...sealed, version: 99 as 1 };
    await expect(openVault(bad, 'password-ok')).rejects.toThrow(
      /Unsupported vault version/
    );
  }, 60_000);

  it('uses unique salt and iv per seal', async () => {
    const payload = {
      kind: 'mnemonic' as const,
      secret: FIXTURE_MNEMONIC,
    };
    const a = await sealVault(payload, 'same-password-12');
    const b = await sealVault(payload, 'same-password-12');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  }, 60_000);

  it('parseVaultPayload rejects passphrase key in ciphertext JSON', () => {
    expect(() =>
      parseVaultPayload(
        JSON.stringify({
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          passphrase: 'never-store-me',
        })
      )
    ).toThrow(/Invalid password/);
  });

  it('parseVaultPayload requires seedFingerprint when passphraseRequired', () => {
    expect(() =>
      parseVaultPayload(
        JSON.stringify({ kind: 'mnemonic', secret: FIXTURE_MNEMONIC }),
        { passphraseRequired: true }
      )
    ).toThrow(/Invalid password/);
  });

  it('parseVaultPayload accepts legacy 8-hex and current 32-hex fingerprints', () => {
    expect(
      parseVaultPayload(
        JSON.stringify({
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          seedFingerprint: FP8,
        }),
        { passphraseRequired: true }
      ).seedFingerprint
    ).toBe(FP8);
    expect(
      parseVaultPayload(
        JSON.stringify({
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          seedFingerprint: FP32,
        }),
        { passphraseRequired: true }
      ).seedFingerprint
    ).toBe(FP32);
  });

  it('sealVault requires 32-hex seedFingerprint when passphraseRequired', async () => {
    await expect(
      sealVault(
        { kind: 'mnemonic', secret: FIXTURE_MNEMONIC },
        'password-ok-12',
        { passphraseRequired: true }
      )
    ).rejects.toThrow(/seedFingerprint/);

    await expect(
      sealVault(
        {
          kind: 'mnemonic',
          secret: FIXTURE_MNEMONIC,
          seedFingerprint: FP8,
        },
        'password-ok-12',
        { passphraseRequired: true }
      )
    ).rejects.toThrow(/seedFingerprint/);
  });

  it('parseVaultCiphertext whitelists v1, v2, and v3 envelopes', () => {
    expect(
      parseVaultCiphertext({
        version: 1,
        salt: 'YQ==',
        iv: 'Yg==',
        ciphertext: 'Yw==',
        extra: 'drop',
      })
    ).toEqual({
      version: 1,
      salt: 'YQ==',
      iv: 'Yg==',
      ciphertext: 'Yw==',
    });
    expect(
      parseVaultCiphertext({
        version: 2,
        salt: 'YQ==',
        iv: 'Yg==',
        ciphertext: 'Yw==',
        passphraseRequired: true,
      })
    ).toEqual({
      version: 2,
      salt: 'YQ==',
      iv: 'Yg==',
      ciphertext: 'Yw==',
      passphraseRequired: true,
    });
    expect(
      parseVaultCiphertext({
        version: 3,
        salt: 'YQ==',
        iv: 'Yg==',
        ciphertext: 'Yw==',
        passphraseRequired: false,
      })
    ).toEqual({
      version: 3,
      salt: 'YQ==',
      iv: 'Yg==',
      ciphertext: 'Yw==',
      passphraseRequired: false,
    });
    expect(
      parseVaultCiphertext({
        version: 2,
        salt: 'YQ==',
        iv: 'Yg==',
        ciphertext: 'Yw==',
      })
    ).toBeUndefined();
  });
});
