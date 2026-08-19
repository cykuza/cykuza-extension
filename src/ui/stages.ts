/** Wallet stages — web wallet flow + extension-only settings sections. */
export type WalletStage =
  | 'loading'
  | 'error'
  | 'idle'
  | 'import-method'
  | 'password-creation'
  | 'mnemonic-display'
  | 'mnemonic-input'
  | 'private-key-import'
  | 'unlock'
  | 'ready'
  | 'receive'
  | 'send'
  | 'settings'
  | 'server-config'
  | 'security'
  | 'explorer'
  | 'about'
  | 'mnemonic-view'
  | 'private-key-view'
  | 'address-book'
  | 'daily-spend'
  | 'destroy';

export type ImportKind = 'mnemonic' | 'privateKey' | null;

/** Only used when the user opens Advanced options on create. */
export type CreateEntropy = {
  wordCount: 12 | 24;
  mode: 'csprng' | 'mixed' | 'user';
  diceRolls?: string;
  hexEntropy?: string;
};
