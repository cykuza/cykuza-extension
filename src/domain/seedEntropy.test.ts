import { entropyToMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import * as bitcoin from 'bitcoinjs-lib';
import { describe, expect, it } from 'vitest';
import {
  DICE_MIN_MIXED,
  DICE_MIN_USER_12,
  DICE_MIN_USER_24,
  generateSeedMnemonic,
  HEX_MIN_MIXED,
  diceMinFor,
} from './seedEntropy';
import { validateMnemonic } from './mnemonic';

function fixedRandom(bytes: Uint8Array) {
  return (arr: Uint8Array): Uint8Array => {
    if (arr.length > bytes.length) {
      throw new Error('fixedRandom: not enough bytes');
    }
    arr.set(bytes.subarray(0, arr.length));
    return arr;
  };
}

function sha256Concat(csprng: Uint8Array, user: Uint8Array, byteLen: number): Uint8Array {
  const combined = new Uint8Array(csprng.length + user.length);
  combined.set(csprng, 0);
  combined.set(user, csprng.length);
  const digest = bitcoin.crypto.sha256(combined);
  return Uint8Array.from(digest.subarray(0, byteLen));
}

describe('generateSeedMnemonic', () => {
  it('csprng generates valid 12 and 24 word mnemonics', () => {
    const m12 = generateSeedMnemonic({ wordCount: 12, mode: 'csprng' });
    expect(m12.split(' ')).toHaveLength(12);
    expect(validateMnemonic(m12)).toBe(true);

    const m24 = generateSeedMnemonic({ wordCount: 24, mode: 'csprng' });
    expect(m24.split(' ')).toHaveLength(24);
    expect(validateMnemonic(m24)).toBe(true);
  });

  it('csprng fails closed when getRandomValues is missing', () => {
    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'csprng',
        getRandomValues: undefined,
        // Force failure path by stubbing global crypto
      })
    ).not.toThrow(); // real crypto present in vitest

    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });
    try {
      expect(() =>
        generateSeedMnemonic({ wordCount: 12, mode: 'csprng' })
      ).toThrow(/CSPRNG unavailable/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });

  it('csprng rejects unexpected user entropy', () => {
    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'csprng',
        diceRolls: '1'.repeat(DICE_MIN_MIXED),
      })
    ).toThrow(/does not accept user entropy/);
  });

  it('rejects invalid dice charset', () => {
    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'mixed',
        diceRolls: '1234567' + '1'.repeat(20),
        getRandomValues: fixedRandom(new Uint8Array(16).fill(1)),
      })
    ).toThrow(/digits 1-6 only/);
  });

  it('enforces dice minima for mixed and user by word count', () => {
    expect(diceMinFor('user', 12)).toBe(DICE_MIN_USER_12);
    expect(diceMinFor('user', 24)).toBe(DICE_MIN_USER_24);
    expect(diceMinFor('mixed', 24)).toBe(DICE_MIN_MIXED);

    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'mixed',
        diceRolls: '1'.repeat(DICE_MIN_MIXED - 1),
        getRandomValues: fixedRandom(new Uint8Array(16).fill(2)),
      })
    ).toThrow(/Insufficient dice rolls/);

    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'user',
        diceRolls: '1'.repeat(DICE_MIN_USER_12 - 1),
      })
    ).toThrow(/Insufficient dice rolls/);

    expect(() =>
      generateSeedMnemonic({
        wordCount: 24,
        mode: 'user',
        diceRolls: '1'.repeat(DICE_MIN_USER_12),
      })
    ).toThrow(/Insufficient dice rolls: need at least 100/);

    const m24 = generateSeedMnemonic({
      wordCount: 24,
      mode: 'user',
      diceRolls: '1'.repeat(DICE_MIN_USER_24),
    });
    expect(m24.split(' ')).toHaveLength(24);
    expect(validateMnemonic(m24)).toBe(true);
  });

  it('rejects odd-length hex and short mixed hex', () => {
    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'mixed',
        hexEntropy: 'abc',
        getRandomValues: fixedRandom(new Uint8Array(16).fill(3)),
      })
    ).toThrow(/even-length/);

    expect(() =>
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'mixed',
        hexEntropy: 'aa'.repeat(HEX_MIN_MIXED - 1),
        getRandomValues: fixedRandom(new Uint8Array(16).fill(3)),
      })
    ).toThrow(/Insufficient hex entropy/);
  });

  it('mixed mix is deterministic given mocked CSPRNG + fixed user entropy', () => {
    const csprng = new Uint8Array(16).fill(0xab);
    const dice = '123456'.repeat(4); // 24 rolls ≥ 20
    const user = new TextEncoder().encode(dice);
    const expectedEntropy = sha256Concat(csprng, user, 16);
    const expectedMnemonic = entropyToMnemonic(expectedEntropy, englishWordlist);

    const mnemonic = generateSeedMnemonic({
      wordCount: 12,
      mode: 'mixed',
      diceRolls: dice,
      getRandomValues: fixedRandom(csprng),
    });
    expect(mnemonic).toBe(expectedMnemonic);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('user mode is deterministic from hex entropy', () => {
    const hex = '11'.repeat(16); // 16 bytes
    const user = new Uint8Array(16).fill(0x11);
    const digest = bitcoin.crypto.sha256(user);
    const expectedEntropy = Uint8Array.from(digest.subarray(0, 16));
    const expectedMnemonic = entropyToMnemonic(expectedEntropy, englishWordlist);

    const mnemonic = generateSeedMnemonic({
      wordCount: 12,
      mode: 'user',
      hexEntropy: hex,
    });
    expect(mnemonic).toBe(expectedMnemonic);
  });

  it('error messages do not echo secrets', () => {
    const secretDice = '654321'.repeat(10);
    try {
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'csprng',
        diceRolls: secretDice,
      });
      expect.unreachable();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(secretDice);
      expect(msg).not.toMatch(/654321/);
    }

    const secretHex = 'deadbeef'.repeat(4);
    try {
      generateSeedMnemonic({
        wordCount: 12,
        mode: 'mixed',
        hexEntropy: secretHex.slice(0, 7),
        getRandomValues: fixedRandom(new Uint8Array(16).fill(9)),
      });
      expect.unreachable();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain('deadbeef');
    }
  });
});
