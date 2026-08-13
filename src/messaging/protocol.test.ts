import { describe, expect, it } from 'vitest';
import {
  parseWalletRequest,
  parseWalletResponse,
  PROTOCOL_VERSION,
  SendConfirmationSchema,
  SendEstimateSchema,
  WalletRequestSchema,
  WalletResponseSchema,
  WalletStatusSchema,
} from './protocol';

describe('protocol v10', () => {
  it('exports PROTOCOL_VERSION = 16', () => {
    expect(PROTOCOL_VERSION).toBe(16);
  });

  it('rejects protocol v5 envelopes', () => {
    const parsed = parseWalletRequest({
      protocol: 5,
      type: 'getStatus',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects foreign / garbage request shapes', () => {
    expect(parseWalletRequest(null).success).toBe(false);
    expect(parseWalletRequest([]).success).toBe(false);
    expect(parseWalletRequest('unlock').success).toBe(false);
    expect(
      parseWalletRequest({ protocol: PROTOCOL_VERSION, type: 'notARealType' }).success
    ).toBe(false);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'getStatus',
        extraField: 'nope',
      }).success
    ).toBe(false);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'unlock',
        password: 'x',
        injected: true,
      }).success
    ).toBe(false);
  });

  it('accepts setAutoLock within 1..1440', () => {
    const ok = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'setAutoLock',
      minutes: 15,
    });
    expect(ok.success).toBe(true);

    const low = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'setAutoLock',
      minutes: 0,
    });
    expect(low.success).toBe(false);

    const high = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'setAutoLock',
      minutes: 1441,
    });
    expect(high.success).toBe(false);
  });

  it('accepts setLockWhenPopupCloses and rejects extra keys', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setLockWhenPopupCloses',
        enabled: true,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setLockWhenPopupCloses',
        enabled: false,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setLockWhenPopupCloses',
        enabled: true,
        extra: 1,
      }).success
    ).toBe(false);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setLockWhenPopupCloses',
      }).success
    ).toBe(false);
  });

  it('accepts setExplorer with string or null', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setExplorer',
        template: 'https://explorer.example/tx/{txid}',
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setExplorer',
        template: null,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setExplorer',
      }).success
    ).toBe(false);
  });

  it('accepts setAddressBook, setDailySpendLimit, and setVerifyWithSecondServer', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setAddressBook',
        entries: [
          {
            label: 'Alice',
            address: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
            network: 'mainnet',
          },
        ],
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setDailySpendLimit',
        limitSats: 100_000,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setDailySpendLimit',
        limitSats: null,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setDailySpendLimit',
        limitSats: 0,
      }).success
    ).toBe(false);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setVerifyWithSecondServer',
        enabled: true,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setVerifyWithSecondServer',
        enabled: false,
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'setVerifyWithSecondServer',
        enabled: true,
        extra: 1,
      }).success
    ).toBe(false);
  });

  it('accepts revealSecret and estimateSend', () => {
    const reveal = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'revealSecret',
      password: 'secret-password',
      kind: 'mnemonic',
    });
    expect(reveal.success).toBe(true);

    const estimate = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'estimateSend',
      amountSats: 10_000,
      feeRate: 5,
      includeFee: true,
      to: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
    });
    expect(estimate.success).toBe(true);
  });

  it('accepts pendingBackupMnemonic and confirmSeedBackup', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'pendingBackupMnemonic',
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'confirmSeedBackup',
      }).success
    ).toBe(true);
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'pendingBackupMnemonic',
        extra: true,
      }).success
    ).toBe(false);
  });

  it('accepts previewSend with optional feeRate', () => {
    const withFee = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'previewSend',
      to: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
      amountSats: 10_000,
      includeFee: true,
      feeRate: 12,
    });
    expect(withFee.success).toBe(true);

    const withoutFee = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'previewSend',
      to: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
      amountSats: 10_000,
    });
    expect(withoutFee.success).toBe(true);
  });

  it('Confirm DTO schema requires safeguard flags', () => {
    const ok = SendConfirmationSchema.safeParse({
      to: 'cy1qtest',
      amountSats: 1000,
      fee: 141,
      total: 1141,
      includeFee: false,
      spendLimitExceeded: false,
      largeSend: true,
      dailySpendRemainingSats: 500,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data).not.toHaveProperty('password');
      expect(ok.data).not.toHaveProperty('hex');
      expect(ok.data).not.toHaveProperty('mnemonic');
      expect(ok.data.largeSend).toBe(true);
    }

    const missing = SendConfirmationSchema.safeParse({
      to: 'cy1qtest',
      amountSats: 1000,
      fee: 141,
      total: 1141,
      includeFee: false,
    });
    expect(missing.success).toBe(false);
  });

  it('SendEstimate schema validates shape', () => {
    const ok = SendEstimateSchema.safeParse({
      amountSats: 900,
      fee: 100,
      total: 1000,
      feeRate: 5,
      changeSats: 200,
      hasChange: true,
    });
    expect(ok.success).toBe(true);
  });

  it('status uses serverKind, not serverUrl', () => {
    const status = WalletStatusSchema.safeParse({
      hasVault: true,
      locked: false,
      network: 'mainnet',
      termsAccepted: true,
      autoLockMinutes: 15,
      lockWhenPopupCloses: true,
      seedBackupConfirmed: true,
      serverKind: 'builtin',
      serverStatus: 'idle',
      error: 'Connection failed',
      addressBook: [],
      dailySpendLimitSats: null,
      dailySpendUsedSats: 0,
      verifyWithSecondServer: true,
    });
    expect(status.success).toBe(true);
    if (status.success) {
      expect(status.data).not.toHaveProperty('serverUrl');
      expect(status.data.serverKind).toBe('builtin');
      expect(status.data.verifyWithSecondServer).toBe(true);
    }
  });

  it('success response may carry estimate + secret + feeRates status', () => {
    const res = WalletResponseSchema.safeParse({
      ok: true,
      status: {
        hasVault: true,
        locked: false,
        network: 'mainnet',
        termsAccepted: true,
        autoLockMinutes: 15,
        lockWhenPopupCloses: false,
        seedBackupConfirmed: true,
        secretKind: 'mnemonic',
        utxoCount: 2,
        feeRates: { slow: 2, standard: 5, estimated: true },
        balance: { confirmed: 1000, unconfirmed: 0 },
        serverKind: 'custom',
      },
      estimate: {
        amountSats: 1000,
        fee: 141,
        total: 1141,
        feeRate: 5,
        changeSats: 0,
        hasChange: false,
      },
      secret: 'abandon ability able',
      confirmation: {
        to: 'cy1q0h7njyq7dxprphuj7daxv8u5dr9lr0jhg25r59',
        amountSats: 1000,
        fee: 141,
        total: 1141,
        includeFee: false,
        spendLimitExceeded: false,
        largeSend: false,
        dailySpendRemainingSats: null,
      },
      confirmationToken: 'aa'.repeat(32),
      txid: 'bb'.repeat(32),
      probe: { version: ['ElectrumX', '1.4'] },
    });
    expect(res.success).toBe(true);
  });

  it('parseWalletResponse rejects malformed payloads', () => {
    expect(parseWalletResponse({ ok: true }).success).toBe(false);
    expect(parseWalletResponse({ ok: false }).success).toBe(false);
  });

  it('WalletRequestSchema covers send path types', () => {
    const types = WalletRequestSchema.options.map(
      (schema) => schema.shape.type.value
    );
    expect(types).toContain('previewSend');
    expect(types).toContain('send');
    expect(types).toContain('estimateSend');
    expect(types).toContain('setAutoLock');
    expect(types).toContain('setLockWhenPopupCloses');
    expect(types).toContain('popupHidden');
    expect(types).toContain('setExplorer');
    expect(types).toContain('setAddressBook');
    expect(types).toContain('setDailySpendLimit');
    expect(types).toContain('setVerifyWithSecondServer');
    expect(types).toContain('revealSecret');
    expect(types).toContain('pendingBackupMnemonic');
    expect(types).toContain('confirmSeedBackup');
  });

  it('create/import require trimmed password length >= 12', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'short',
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijk', // 11
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: '  abcdefghij  ', // trimmed 10
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijkl', // 12
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'import',
        password: '12345678901', // 11 digits
        secret: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
        kind: 'mnemonic',
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'import',
        password: '123456789012', // digit-only Weak is allowed
        secret: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
        kind: 'mnemonic',
      }).success
    ).toBe(true);
  });

  it('create/import/unlock accept optional passphrase; status may include passphraseRequired', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijkl',
        passphrase: 'twenty-fifth',
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'import',
        password: 'abcdefghijkl',
        secret:
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        kind: 'mnemonic',
        passphrase: 'twenty-fifth',
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'unlock',
        password: 'x',
        passphrase: 'twenty-fifth',
      }).success
    ).toBe(true);

    const status = WalletStatusSchema.safeParse({
      hasVault: true,
      locked: true,
      network: 'mainnet',
      termsAccepted: true,
      autoLockMinutes: 15,
      lockWhenPopupCloses: true,
      seedBackupConfirmed: true,
      passphraseRequired: true,
    });
    expect(status.success).toBe(true);
    if (status.success) {
      expect(status.data.passphraseRequired).toBe(true);
    }
  });

  it('create defaults wordCount 24 and entropyMode csprng', () => {
    const parsed = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'create',
      password: 'abcdefghijkl',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('create');
      if (parsed.data.type === 'create') {
        expect(parsed.data.wordCount).toBe(24);
        expect(parsed.data.entropyMode).toBe('csprng');
        expect(parsed.data.diceRolls).toBeUndefined();
        expect(parsed.data.hexEntropy).toBeUndefined();
      }
    }
  });

  it('create accepts entropy fields and rejects invalid enums', () => {
    const ok = parseWalletRequest({
      protocol: PROTOCOL_VERSION,
      type: 'create',
      password: 'abcdefghijkl',
      wordCount: 24,
      entropyMode: 'mixed',
      diceRolls: '1'.repeat(20),
      hexEntropy: 'aabbccddeeff0011',
    });
    expect(ok.success).toBe(true);
    if (ok.success && ok.data.type === 'create') {
      expect(ok.data.wordCount).toBe(24);
      expect(ok.data.entropyMode).toBe('mixed');
      expect(ok.data.diceRolls).toBe('1'.repeat(20));
      expect(ok.data.hexEntropy).toBe('aabbccddeeff0011');
    }

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijkl',
        wordCount: 18,
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijkl',
        entropyMode: 'yasmarang',
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'create',
        password: 'abcdefghijkl',
        extraEntropy: 'nope',
      }).success
    ).toBe(false);
  });

  it('unlock/reveal/send still accept short non-empty passwords', () => {
    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'unlock',
        password: 'x',
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'revealSecret',
        password: 'x',
        kind: 'mnemonic',
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'send',
        confirmationToken: 'aa'.repeat(32),
        password: 'x',
        toConfirmSuffix: 'short',
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'send',
        confirmationToken: 'aa'.repeat(32),
        password: 'x',
        toConfirmSuffix: 'toolong1',
      }).success
    ).toBe(false);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'send',
        confirmationToken: 'aa'.repeat(32),
        password: 'x',
        toConfirmSuffix: 'g25r59',
        allowSpendLimitOnce: true,
        acknowledgeLargeSend: true,
      }).success
    ).toBe(true);

    expect(
      parseWalletRequest({
        protocol: PROTOCOL_VERSION,
        type: 'send',
        confirmationToken: 'aa'.repeat(32),
        password: 'x',
      }).success
    ).toBe(false);
  });
});
