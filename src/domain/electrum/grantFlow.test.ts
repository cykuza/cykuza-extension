import { describe, expect, it } from 'vitest';
import {
  buildElectrumGrantSearch,
  electrumGrantHostLabel,
  parseElectrumGrantSearch,
} from './grantFlow';

describe('electrum grantFlow', () => {
  it('round-trips action + url query params', () => {
    const search = buildElectrumGrantSearch({
      action: 'test',
      url: 'wss://electrum.example:50004',
    });
    expect(parseElectrumGrantSearch(search)).toEqual({
      action: 'test',
      url: 'wss://electrum.example:50004',
    });
  });

  it('rejects missing params', () => {
    expect(parseElectrumGrantSearch('')).toBeNull();
    expect(parseElectrumGrantSearch('?action=add')).toBeNull();
    expect(parseElectrumGrantSearch('?url=wss://x.example:50004')).toBeNull();
    expect(parseElectrumGrantSearch('?action=nope&url=wss://x.example:50004')).toBeNull();
  });

  it('labels host:port for grant UI', () => {
    expect(electrumGrantHostLabel('wss://electrum.example:50004')).toBe(
      'electrum.example:50004'
    );
  });
});
