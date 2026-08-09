import {
  buildElectrumGrantSearch,
  ELECTRUM_GRANT_PAGE,
  type ElectrumGrantParams,
} from '../domain/electrum/grantFlow';

/**
 * Open a packaged extension page in a new tab (popup-safe).
 * `path` is relative to the extension root; optional `search` is `?…` or raw query.
 */
export function openExtensionPage(path: string, search = ''): void {
  const suffix =
    !search
      ? ''
      : search.startsWith('?')
        ? search
        : `?${search}`;
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) + suffix });
}

/** Open the branded Electrum host-permission gate. */
export function openElectrumGrantPage(params: ElectrumGrantParams): void {
  openExtensionPage(ELECTRUM_GRANT_PAGE, buildElectrumGrantSearch(params));
}
