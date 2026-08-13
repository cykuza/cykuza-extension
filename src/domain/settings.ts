import { isValidAddress } from './address';
import {
  DEFAULT_ELECTRUM_MAINNET,
  isDefaultElectrumUrl,
} from './electrum/defaults';
import { parseWssUrl } from './electrum/url';
import { parseExplorerTxTemplate } from './explorer';
import {
  MAX_ADDRESS_BOOK_ENTRIES,
  MAX_ADDRESS_BOOK_LABEL_LENGTH,
} from './limits';
import type { NetworkType } from './network';

export { parseWssUrl } from './electrum/url';
export { isDefaultElectrumUrl } from './electrum/defaults';
export {
  ADDRESS_CONFIRM_SUFFIX_LENGTH,
  MAX_ADDRESS_BOOK_ENTRIES,
  MAX_ADDRESS_BOOK_LABEL_LENGTH,
  addressConfirmSuffix,
  matchesAddressConfirmSuffix,
} from './limits';

export const SETTINGS_VERSION = 7 as const;
export const DEFAULT_AUTO_LOCK_MINUTES = 5;

/** Built-in mainnet endpoint reference (URL must be in build-time DEFAULT_ELECTRUM_MAINNET). */
export type DefaultElectrumEndpoint = {
  kind: 'default';
  url: string;
};

/** User-supplied Electrum endpoint. */
export type CustomElectrumEndpoint = {
  kind: 'custom';
  url: string;
};

export type ElectrumEndpoint = DefaultElectrumEndpoint | CustomElectrumEndpoint;

/** Per-network Electrum configuration: ordered endpoints + sticky last-good URL. */
export interface ElectrumNetworkConfig {
  endpoints: ElectrumEndpoint[];
  /** Last successfully probed wss:// URL, or null. */
  activeUrl: string | null;
}

export interface ElectrumConfig {
  mainnet: ElectrumNetworkConfig;
  testnet: ElectrumNetworkConfig;
}

/** Local address book entry (counterparties). Never synced / never logged. */
export interface AddressBookEntry {
  label: string;
  address: string;
  network: NetworkType;
}

export interface WalletSettings {
  version: typeof SETTINGS_VERSION;
  network: NetworkType;
  electrum: ElectrumConfig;
  autoLockMinutes: number;
  /**
   * When the popup hides, (re)arm idle auto-lock instead of wiping immediately.
   * Immediate teardown breaks Chrome host-permission prompts and brief focus
   * switches; plaintext dwell stays bounded by autoLockMinutes (default 5).
   * New installs default on; pre-v4 settings migrate to off.
   */
  lockWhenPopupCloses: boolean;
  termsAccepted: boolean;
  /**
   * Optional https://…/{txid} template for Send-done explorer link.
   * Null = no link (default). Never a built-in production host.
   */
  explorerTxTemplate: string | null;
  /** Local-only labeled recipients. */
  addressBook: AddressBookEntry[];
  /**
   * Optional daily spend limit in sats (wallet debit). Null = disabled.
   * Usage counter lives in separate `daily_spend` storage.
   */
  dailySpendLimitSats: number | null;
  /**
   * When true and ≥2 permitted Electrum endpoints exist, Refresh
   * cross-checks balance/UTXO fingerprint on a second server.
   * Default on; no-op when fewer than two permitted URLs.
   */
  verifyWithSecondServer: boolean;
  /**
   * True after create-flow seed backup + quiz (or import).
   * Missing field migrates to true so existing vaults are not trapped.
   * `create` writes false before sealing so popup remount cannot skip backup.
   */
  seedBackupConfirmed: boolean;
}

/** Explicit reason when no Electrum endpoints are available for a network. */
export class ElectrumUnconfiguredError extends Error {
  readonly code = 'electrum_unconfigured' as const;

  constructor(network: NetworkType) {
    super(
      network === 'testnet'
        ? 'Testnet has no official Electrum servers. Add a custom wss:// endpoint in Settings.'
        : 'No Electrum endpoints configured. Add a custom wss:// endpoint in Settings.'
    );
    this.name = 'ElectrumUnconfiguredError';
  }
}

export function defaultMainnetElectrumConfig(): ElectrumNetworkConfig {
  return {
    endpoints: DEFAULT_ELECTRUM_MAINNET.map((url) => ({
      kind: 'default' as const,
      url,
    })),
    activeUrl: null,
  };
}

export function defaultTestnetElectrumConfig(): ElectrumNetworkConfig {
  return {
    endpoints: [],
    activeUrl: null,
  };
}

export function defaultElectrumConfig(): ElectrumConfig {
  return {
    mainnet: defaultMainnetElectrumConfig(),
    testnet: defaultTestnetElectrumConfig(),
  };
}

export function defaultSettings(): WalletSettings {
  return {
    version: SETTINGS_VERSION,
    network: 'mainnet',
    electrum: defaultElectrumConfig(),
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    lockWhenPopupCloses: true,
    termsAccepted: false,
    explorerTxTemplate: null,
    addressBook: [],
    dailySpendLimitSats: null,
    verifyWithSecondServer: true,
    seedBackupConfirmed: true,
  };
}

function normalizeAddressBookLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.trim().slice(0, MAX_ADDRESS_BOOK_LABEL_LENGTH);
  if (!label) return null;
  // Strip / reject control characters without a control-char regex class.
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  return label;
}

function normalizeAddressBookEntry(raw: unknown): AddressBookEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { label?: unknown; address?: unknown; network?: unknown };
  const network: NetworkType | null =
    obj.network === 'mainnet' || obj.network === 'testnet' ? obj.network : null;
  if (!network) return null;
  const label = normalizeAddressBookLabel(obj.label);
  if (!label) return null;
  if (typeof obj.address !== 'string') return null;
  const address = obj.address.trim();
  if (!isValidAddress(address, network)) return null;
  return { label, address, network };
}

function normalizeAddressBook(raw: unknown): AddressBookEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AddressBookEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_ADDRESS_BOOK_ENTRIES) break;
    const entry = normalizeAddressBookEntry(item);
    if (!entry) continue;
    const key = `${entry.network}:${entry.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function normalizeDailySpendLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n <= 0) return null;
  return n;
}

function normalizeEndpoint(
  raw: unknown,
  network: NetworkType
): ElectrumEndpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { kind?: unknown; url?: unknown };
  if (typeof obj.url !== 'string') return null;
  let url: string;
  try {
    url = parseWssUrl(obj.url);
  } catch {
    return null;
  }
  if (obj.kind === 'default') {
    // Defaults only exist on mainnet and must match the built-in list.
    if (network !== 'mainnet' || !isDefaultElectrumUrl(url)) return null;
    return { kind: 'default', url };
  }
  if (obj.kind === 'custom') {
    // Custom must not masquerade as a default built-in on mainnet.
    if (network === 'mainnet' && isDefaultElectrumUrl(url)) {
      return { kind: 'default', url };
    }
    return { kind: 'custom', url };
  }
  return null;
}

function normalizeNetworkConfig(
  raw: unknown,
  network: NetworkType
): ElectrumNetworkConfig {
  const defaults =
    network === 'mainnet'
      ? defaultMainnetElectrumConfig()
      : defaultTestnetElectrumConfig();

  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Partial<ElectrumNetworkConfig>;

  const seen = new Set<string>();
  const endpoints: ElectrumEndpoint[] = [];
  if (Array.isArray(obj.endpoints)) {
    for (const item of obj.endpoints) {
      const ep = normalizeEndpoint(item, network);
      if (!ep || seen.has(ep.url)) continue;
      seen.add(ep.url);
      endpoints.push(ep);
    }
  }

  // Mainnet empty → restore build-time defaults when present; empty build = custom-only.
  // Testnet empty is intentional (unconfigured until user adds custom).
  const finalEndpoints =
    endpoints.length > 0
      ? endpoints
      : network === 'mainnet'
        ? defaults.endpoints
        : [];

  let activeUrl: string | null = null;
  if (typeof obj.activeUrl === 'string') {
    try {
      const parsed = parseWssUrl(obj.activeUrl);
      if (finalEndpoints.some((e) => e.url === parsed)) {
        activeUrl = parsed;
      }
    } catch {
      activeUrl = null;
    }
  }

  return { endpoints: finalEndpoints, activeUrl };
}

/**
 * Migrate legacy v1 `{ customServers: { mainnet, testnet } }` into ElectrumConfig.
 * Mainnet: defaults first, then custom wss URLs not already in defaults.
 * Testnet: custom only.
 */
function migrateV1CustomServers(raw: unknown): ElectrumConfig {
  const result = defaultElectrumConfig();
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as {
    mainnet?: unknown;
    testnet?: unknown;
  };

  const migrateList = (
    list: unknown,
    network: NetworkType
  ): ElectrumEndpoint[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: ElectrumEndpoint[] = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      let url: string;
      try {
        url = parseWssUrl(item);
      } catch {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      if (network === 'mainnet' && isDefaultElectrumUrl(url)) {
        out.push({ kind: 'default', url });
      } else {
        out.push({ kind: 'custom', url });
      }
    }
    return out;
  };

  const mainnetCustom = migrateList(obj.mainnet, 'mainnet');
  if (mainnetCustom.length > 0) {
    // If legacy had a non-empty custom list, that list replaced defaults.
    result.mainnet = { endpoints: mainnetCustom, activeUrl: null };
  }

  const testnetCustom = migrateList(obj.testnet, 'testnet');
  result.testnet = { endpoints: testnetCustom, activeUrl: null };

  return result;
}

export function normalizeSettings(raw: unknown): WalletSettings {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;

  const storedVersion =
    typeof obj.version === 'number' && Number.isFinite(obj.version)
      ? Math.floor(obj.version)
      : 0;

  const network: NetworkType =
    obj.network === 'testnet' || obj.network === 'mainnet'
      ? obj.network
      : defaults.network;

  const autoLockMinutes =
    typeof obj.autoLockMinutes === 'number' &&
    Number.isFinite(obj.autoLockMinutes) &&
    obj.autoLockMinutes >= 1
      ? Math.min(Math.floor(obj.autoLockMinutes), 1440)
      : defaults.autoLockMinutes;

  // Pre-v4 blobs without the field default off (avoid surprising existing users).
  // New installs / post-v4 defaults stay on via defaultSettings().
  const lockWhenPopupCloses =
    typeof obj.lockWhenPopupCloses === 'boolean'
      ? obj.lockWhenPopupCloses
      : storedVersion < 4
        ? false
        : defaults.lockWhenPopupCloses;

  let electrum: ElectrumConfig;
  if (obj.electrum && typeof obj.electrum === 'object') {
    const e = obj.electrum as Partial<ElectrumConfig>;
    electrum = {
      mainnet: normalizeNetworkConfig(e.mainnet, 'mainnet'),
      testnet: normalizeNetworkConfig(e.testnet, 'testnet'),
    };
  } else if (obj.customServers && typeof obj.customServers === 'object') {
    // Legacy v1 migration.
    electrum = migrateV1CustomServers(obj.customServers);
  } else {
    electrum = defaultElectrumConfig();
  }

  let explorerTxTemplate: string | null = null;
  if (typeof obj.explorerTxTemplate === 'string') {
    try {
      explorerTxTemplate = parseExplorerTxTemplate(obj.explorerTxTemplate);
    } catch {
      explorerTxTemplate = null;
    }
  }

  // Missing field → on (security-positive default).
  const verifyWithSecondServer =
    typeof obj.verifyWithSecondServer === 'boolean'
      ? obj.verifyWithSecondServer
      : true;

  // Missing field → true (grandfather existing vaults). Explicit false stays false.
  const seedBackupConfirmed = obj.seedBackupConfirmed !== false;

  return {
    version: SETTINGS_VERSION,
    network,
    electrum,
    autoLockMinutes,
    lockWhenPopupCloses,
    termsAccepted: obj.termsAccepted === true,
    explorerTxTemplate,
    addressBook: normalizeAddressBook(obj.addressBook),
    dailySpendLimitSats: normalizeDailySpendLimit(obj.dailySpendLimitSats),
    verifyWithSecondServer,
    seedBackupConfirmed,
  };
}

/** Resolve ordered wss:// URLs for a network config (no permission checks). */
export function resolveElectrumUrls(
  config: ElectrumNetworkConfig
): readonly string[] {
  return config.endpoints.map((e) => e.url);
}

/**
 * Resolve Electrum endpoints for the active (or specified) network.
 * Mainnet uses build-time defaults when present (after normalize).
 * Empty build or testnet returns [] when unconfigured — never falls back across networks.
 */
export function resolveElectrumServers(
  settings: WalletSettings,
  network: NetworkType = settings.network
): readonly string[] {
  return resolveElectrumUrls(settings.electrum[network]);
}

/**
 * Order URLs for failover: sticky activeUrl first (if still in list), then rest.
 */
export function orderUrlsForConnect(
  urls: readonly string[],
  activeUrl: string | null
): string[] {
  if (!activeUrl || !urls.includes(activeUrl)) {
    return [...urls];
  }
  return [activeUrl, ...urls.filter((u) => u !== activeUrl)];
}

/**
 * Resolve connect candidates or throw ElectrumUnconfiguredError.
 * Applies sticky last-good ordering.
 */
export function getConnectCandidates(
  settings: WalletSettings,
  network: NetworkType = settings.network
): string[] {
  const config = settings.electrum[network];
  const urls = resolveElectrumUrls(config);
  if (urls.length === 0) {
    throw new ElectrumUnconfiguredError(network);
  }
  return orderUrlsForConnect(urls, config.activeUrl);
}

/** Public view of Electrum config for UI / status (no secrets). */
export function publicElectrumView(
  settings: WalletSettings,
  network: NetworkType = settings.network
): {
  network: NetworkType;
  endpoints: ElectrumEndpoint[];
  activeUrl: string | null;
  configured: boolean;
} {
  const config = settings.electrum[network];
  return {
    network,
    endpoints: config.endpoints.map((e) => ({ ...e })),
    activeUrl: config.activeUrl,
    configured: config.endpoints.length > 0,
  };
}

export function addCustomEndpoint(
  settings: WalletSettings,
  network: NetworkType,
  rawUrl: string
): WalletSettings {
  const url = parseWssUrl(rawUrl);
  const config = settings.electrum[network];
  if (config.endpoints.some((e) => e.url === url)) {
    return settings;
  }
  const endpoint: ElectrumEndpoint =
    network === 'mainnet' && isDefaultElectrumUrl(url)
      ? { kind: 'default', url }
      : { kind: 'custom', url };
  return {
    ...settings,
    electrum: {
      ...settings.electrum,
      [network]: {
        ...config,
        endpoints: [...config.endpoints, endpoint],
      },
    },
  };
}

export function removeEndpoint(
  settings: WalletSettings,
  network: NetworkType,
  url: string
): WalletSettings {
  const config = settings.electrum[network];
  const endpoints = config.endpoints.filter((e) => e.url !== url);
  // Mainnet must keep at least defaults if everything was removed.
  const nextEndpoints =
    endpoints.length === 0 && network === 'mainnet'
      ? defaultMainnetElectrumConfig().endpoints
      : endpoints;
  const activeUrl =
    config.activeUrl && nextEndpoints.some((e) => e.url === config.activeUrl)
      ? config.activeUrl
      : null;
  return {
    ...settings,
    electrum: {
      ...settings.electrum,
      [network]: { endpoints: nextEndpoints, activeUrl },
    },
  };
}

export function reorderEndpoint(
  settings: WalletSettings,
  network: NetworkType,
  url: string,
  direction: 'up' | 'down'
): WalletSettings {
  const config = settings.electrum[network];
  const index = config.endpoints.findIndex((e) => e.url === url);
  if (index < 0) return settings;
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= config.endpoints.length) return settings;
  const endpoints = [...config.endpoints];
  const tmp = endpoints[index]!;
  endpoints[index] = endpoints[swapWith]!;
  endpoints[swapWith] = tmp;
  return {
    ...settings,
    electrum: {
      ...settings.electrum,
      [network]: { ...config, endpoints },
    },
  };
}

export function setActiveUrl(
  settings: WalletSettings,
  network: NetworkType,
  activeUrl: string | null
): WalletSettings {
  const config = settings.electrum[network];
  if (activeUrl !== null) {
    const parsed = parseWssUrl(activeUrl);
    if (!config.endpoints.some((e) => e.url === parsed)) {
      return settings;
    }
    activeUrl = parsed;
  }
  return {
    ...settings,
    electrum: {
      ...settings.electrum,
      [network]: { ...config, activeUrl },
    },
  };
}

/** Collect custom wss URLs that still need (or own) optional host permissions. */
export function customElectrumUrls(settings: WalletSettings): string[] {
  const urls: string[] = [];
  for (const network of ['mainnet', 'testnet'] as const) {
    for (const ep of settings.electrum[network].endpoints) {
      if (ep.kind === 'custom') urls.push(ep.url);
    }
  }
  return urls;
}

export function isCustomEndpoint(
  settings: WalletSettings,
  url: string
): boolean {
  for (const network of ['mainnet', 'testnet'] as const) {
    const ep = settings.electrum[network].endpoints.find((e) => e.url === url);
    if (ep) return ep.kind === 'custom';
  }
  return false;
}

export function setAddressBook(
  settings: WalletSettings,
  entries: AddressBookEntry[]
): WalletSettings {
  return {
    ...settings,
    addressBook: normalizeAddressBook(entries),
  };
}

export function addAddressBookEntry(
  settings: WalletSettings,
  entry: { label: string; address: string; network: NetworkType }
): WalletSettings {
  return setAddressBook(settings, [...settings.addressBook, entry]);
}

export function removeAddressBookEntry(
  settings: WalletSettings,
  network: NetworkType,
  address: string
): WalletSettings {
  const normalized = address.trim().toLowerCase();
  return setAddressBook(
    settings,
    settings.addressBook.filter(
      (e) =>
        !(e.network === network && e.address.toLowerCase() === normalized)
    )
  );
}

export function setDailySpendLimit(
  settings: WalletSettings,
  limitSats: number | null
): WalletSettings {
  return {
    ...settings,
    dailySpendLimitSats: normalizeDailySpendLimit(limitSats),
  };
}

export function setVerifyWithSecondServer(
  settings: WalletSettings,
  enabled: boolean
): WalletSettings {
  return {
    ...settings,
    verifyWithSecondServer: enabled === true,
  };
}

export function setSeedBackupConfirmed(
  settings: WalletSettings,
  confirmed: boolean
): WalletSettings {
  return {
    ...settings,
    seedBackupConfirmed: confirmed === true,
  };
}

/** Fraction of confirmed balance that triggers a large-send warning. */
export const LARGE_SEND_BALANCE_FRACTION = 0.5;

export function isLargeSend(
  totalSats: number,
  confirmedBalanceSats: number
): boolean {
  if (
    !Number.isFinite(totalSats) ||
    !Number.isFinite(confirmedBalanceSats) ||
    confirmedBalanceSats <= 0
  ) {
    return false;
  }
  return totalSats > confirmedBalanceSats * LARGE_SEND_BALANCE_FRACTION;
}
