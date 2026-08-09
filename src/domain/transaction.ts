import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, type ECPairInterface } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';
import { assertValidAddress } from './address';
import { TxError } from './errors';
import { getNetwork, type NetworkType } from './network';

// bitcoinjs-lib v7 requires an explicit ECC library for signing helpers.
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

const validator = (
  pubkey: Uint8Array,
  msghash: Uint8Array,
  signature: Uint8Array
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

/** Dust threshold for change outputs (legacy P2PKH dust; parity with cykuza-web). */
export const DUST_THRESHOLD = 546;

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
}

export interface SpendTarget {
  toAddress: string;
  amountSats: number;
  feeRate: number;
  fromAddress: string;
  keyPair: ECPairInterface;
  utxos: Utxo[];
  networkType: NetworkType;
  includeFee?: boolean;
}

/**
 * Immutable spend plan produced by selection + fee estimation.
 * Used by both preview (Confirm DTO) and PSBT construction so fee/selection
 * never diverge between the two paths.
 */
export interface SpendPlan {
  toAddress: string;
  fromAddress: string;
  networkType: NetworkType;
  includeFee: boolean;
  /** Amount the recipient receives (after fee deduction when includeFee). */
  amountSats: number;
  /** Estimated fee used for UTXO selection (before dust absorption). */
  estimatedFee: number;
  /** Actual fee: estimatedFee + dust absorbed when change is omitted. */
  fee: number;
  /** Wallet debit: recipient + fee when !includeFee; requested amount when includeFee. */
  total: number;
  /** Entered amount before includeFee adjustment. */
  requestedAmountSats: number;
  feeRate: number;
  selectedUtxos: Utxo[];
  totalIn: number;
  change: number;
  hasChange: boolean;
}

export function estimateVBytes(inputCount: number, outputCount: number): number {
  return Math.ceil(10 + inputCount * 68 + outputCount * 31);
}

/**
 * Build a spend plan: sequential first-fit UTXO selection (Electrum order),
 * P2WPKH vbytes heuristic, dust change omission.
 *
 * includeFee=false: recipient gets amountSats; fee is added on top (total = amount + fee).
 * includeFee=true:  entered amountSats is the wallet debit; recipient gets amount − fee.
 */
export function planSpend(params: {
  toAddress: string;
  fromAddress: string;
  amountSats: number;
  feeRate: number;
  utxos: Utxo[];
  networkType: NetworkType;
  includeFee?: boolean;
  /** When true, validate addresses (preview / external entry). */
  validateAddresses?: boolean;
}): SpendPlan {
  const {
    toAddress,
    fromAddress,
    amountSats,
    feeRate,
    utxos,
    networkType,
    includeFee = false,
    validateAddresses = true,
  } = params;

  if (amountSats <= 0 || !Number.isFinite(amountSats)) {
    throw new TxError('INVALID_AMOUNT');
  }
  if (!utxos.length) {
    throw new TxError('NO_UTXOS');
  }

  if (validateAddresses) {
    assertValidAddress(toAddress, networkType);
    assertValidAddress(fromAddress, networkType);
  }

  const rate = Math.max(1, Math.ceil(feeRate));
  const selectedUtxos: Utxo[] = [];
  let totalIn = 0;
  let estimatedFee = 0;

  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalIn += utxo.value;
    const outputCount = includeFee ? 1 : 2;
    estimatedFee = Math.ceil(
      estimateVBytes(selectedUtxos.length, outputCount) * rate
    );
    const needed = includeFee ? amountSats : amountSats + estimatedFee;
    if (totalIn >= needed) break;
  }

  const recipientAmount = includeFee
    ? Math.max(0, amountSats - estimatedFee)
    : amountSats;

  if (includeFee && recipientAmount <= 0) {
    throw new TxError('AMOUNT_TOO_SMALL');
  }

  const rawChange = totalIn - recipientAmount - estimatedFee;
  if (rawChange < 0) {
    throw new TxError('INSUFFICIENT');
  }

  // Dust change is omitted and absorbed into the miner fee (parity with web).
  const hasChange = rawChange > DUST_THRESHOLD;
  const finalChange = hasChange ? rawChange : 0;
  const actualFee = hasChange ? estimatedFee : estimatedFee + rawChange;
  const total = includeFee ? amountSats : recipientAmount + actualFee;

  return {
    toAddress,
    fromAddress,
    networkType,
    includeFee,
    amountSats: recipientAmount,
    estimatedFee,
    fee: actualFee,
    total,
    requestedAmountSats: amountSats,
    feeRate: rate,
    selectedUtxos: selectedUtxos.map((u) => ({ ...u })),
    totalIn,
    change: finalChange,
    hasChange,
  };
}

/**
 * Soft fee estimate matching cykuza-web shape.
 * Returns zeros for empty UTXOs / non-positive amount; does not validate addresses.
 */
export function estimateFee(params: {
  amountSats: number;
  feeRate: number;
  utxos: Utxo[];
  includeFee?: boolean;
}): { estimatedFee: number; actualAmountSats: number; totalNeeded: number } {
  const { amountSats, feeRate, utxos, includeFee = false } = params;
  if (!utxos.length || amountSats <= 0) {
    return { estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 };
  }
  try {
    const plan = planSpend({
      toAddress: '',
      fromAddress: '',
      amountSats,
      feeRate,
      utxos,
      networkType: 'mainnet',
      includeFee,
      validateAddresses: false,
    });
    return {
      estimatedFee: plan.estimatedFee,
      actualAmountSats: plan.amountSats,
      totalNeeded: includeFee
        ? plan.requestedAmountSats
        : plan.amountSats + plan.estimatedFee,
    };
  } catch {
    return { estimatedFee: 0, actualAmountSats: 0, totalNeeded: 0 };
  }
}

/**
 * Build and sign a P2WPKH PSBT from a SpendPlan (preferred) or raw SpendTarget.
 * bitcoinjs-lib v7 uses bigint for output / witness values.
 */
export function buildAndSignTx(
  params: SpendTarget | { plan: SpendPlan; keyPair: ECPairInterface }
): { hex: string; fee: number } {
  let plan: SpendPlan;
  let keyPair: ECPairInterface;

  if ('plan' in params) {
    plan = params.plan;
    keyPair = params.keyPair;
  } else {
    plan = planSpend({
      toAddress: params.toAddress,
      fromAddress: params.fromAddress,
      amountSats: params.amountSats,
      feeRate: params.feeRate,
      utxos: params.utxos,
      networkType: params.networkType,
      includeFee: params.includeFee,
      validateAddresses: true,
    });
    keyPair = params.keyPair;
  }

  if (plan.amountSats <= 0) {
    throw new TxError('AMOUNT_TOO_SMALL');
  }

  const network = getNetwork(plan.networkType);
  const psbt = new bitcoin.Psbt({ network });
  const payment = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  const script = payment.output;
  if (!script) throw new Error('Unable to derive script for signing');

  for (const u of plan.selectedUtxos) {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script, value: BigInt(u.value) },
    });
  }

  psbt.addOutput({ address: plan.toAddress, value: BigInt(plan.amountSats) });
  if (plan.hasChange && plan.change > DUST_THRESHOLD) {
    psbt.addOutput({ address: plan.fromAddress, value: BigInt(plan.change) });
  }

  plan.selectedUtxos.forEach((_, idx) => {
    psbt.signInput(idx, keyPair);
    psbt.validateSignaturesOfInput(idx, validator);
  });
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  const outSum = tx.outs.reduce((sum, o) => sum + Number(o.value), 0);
  const fee = plan.totalIn - outSum;
  return { hex: tx.toHex(), fee };
}

export function cyToSats(amount: number): number {
  return Math.floor(amount * 1e8);
}

export function satsToCy(sats: number): number {
  return sats / 1e8;
}

/** Preset sat/vB rates plus whether they came from usable Electrum estimates. */
export interface FeeRates {
  slow: number;
  standard: number;
  /**
   * True when both Electrum `estimatefee` values were usable (finite & > 0).
   * False when the daemon returned -1 / invalid — rates are the 1 sat/vB floor.
   */
  estimated: boolean;
}

/** True when Electrum `estimatefee` returned a usable CY/kB rate (not -1 / empty). */
export function isUsableElectrumFeeEstimate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

/** Electrum `blockchain.estimatefee` (CY/kB) → sats/vbyte, minimum 1. */
export function btcPerKbToSatsPerVbyte(rate: number): number {
  if (!isUsableElectrumFeeEstimate(rate)) return 1;
  return Math.max(Math.ceil((rate * 1e8) / 1000), 1);
}

/**
 * Normalize a slow/standard Electrum estimatefee pair to sats/vbyte.
 * Ensures standard is never slower than slow (server quirks).
 * Sets `estimated` only when both raw values were usable.
 */
export function normalizeFeeRates(
  slowRaw: number,
  standardRaw: number
): FeeRates {
  const estimated =
    isUsableElectrumFeeEstimate(slowRaw) &&
    isUsableElectrumFeeEstimate(standardRaw);
  const slow = btcPerKbToSatsPerVbyte(slowRaw);
  const standard = btcPerKbToSatsPerVbyte(standardRaw);
  return {
    slow,
    standard: Math.max(standard, slow),
    estimated,
  };
}

/** Map Electrum listunspent rows to internal UTXO shape. */
export function mapElectrumUtxos(
  rows: Array<{ tx_hash: string; tx_pos: number; value: number }>
): Utxo[] {
  return rows.map((u) => ({
    txid: u.tx_hash,
    vout: u.tx_pos,
    value: u.value,
  }));
}
