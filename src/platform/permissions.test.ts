import { describe, expect, it, vi, beforeEach } from 'vitest';

const { BUILTIN } = vi.hoisted(() => ({
  BUILTIN: 'wss://builtin.example:50004',
}));

vi.mock('../domain/electrum/defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/electrum/defaults')>();
  const list = [BUILTIN] as const;
  return {
    ...actual,
    DEFAULT_ELECTRUM_MAINNET: list,
    isDefaultElectrumUrl: (url: string) => (list as readonly string[]).includes(url),
  };
});

import { toHostPermissionPattern } from '../domain/electrum/defaults';

const contains = vi.fn();
const request = vi.fn();
const remove = vi.fn();

vi.stubGlobal('chrome', {
  permissions: { contains, request, remove },
});

describe('permissions', () => {
  beforeEach(() => {
    contains.mockReset();
    request.mockReset();
    remove.mockReset();
  });

  it('builtin defaults skip chrome.permissions for request and has', async () => {
    const { requestHostPermission, hasHostPermission } = await import(
      '../platform/permissions'
    );
    await expect(requestHostPermission(BUILTIN)).resolves.toBe(true);
    await expect(hasHostPermission(BUILTIN)).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(contains).not.toHaveBeenCalled();
  });

  it('requestHostPermission calls request without a contains pre-check (gesture)', async () => {
    const { requestHostPermission } = await import('../platform/permissions');
    request.mockResolvedValue(true);
    const url = 'wss://custom.example:50004';
    await expect(requestHostPermission(url)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: [toHostPermissionPattern(url)],
    });
    // Invariant: no contains() before request — preserves MV3 user gesture.
    expect(contains).not.toHaveBeenCalled();
  });

  it('requestHostPermission deny returns false', async () => {
    const { requestHostPermission } = await import('../platform/permissions');
    request.mockResolvedValue(false);
    await expect(
      requestHostPermission('wss://custom.example:50004')
    ).resolves.toBe(false);
    expect(contains).not.toHaveBeenCalled();
  });

  it('hasHostPermission uses contains for custom URLs', async () => {
    const { hasHostPermission } = await import('../platform/permissions');
    contains.mockResolvedValue(true);
    await expect(
      hasHostPermission('wss://custom.example:50004')
    ).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({
      origins: ['https://custom.example:50004/*'],
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('assertHostPermission throws HostPermissionRequiredError without hostname', async () => {
    const { assertHostPermission, HostPermissionRequiredError } = await import(
      '../platform/permissions'
    );
    contains.mockResolvedValue(false);
    await expect(
      assertHostPermission('wss://custom.example:50004')
    ).rejects.toBeInstanceOf(HostPermissionRequiredError);
    await expect(
      assertHostPermission('wss://custom.example:50004')
    ).rejects.toThrow(
      'Allow this Electrum host from the Cykuza grant tab first.'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('assertHostPermission resolves when granted', async () => {
    const { assertHostPermission } = await import('../platform/permissions');
    contains.mockResolvedValue(true);
    await expect(
      assertHostPermission('wss://custom.example:50004')
    ).resolves.toBeUndefined();
  });

  it('filterPermittedUrls preserves order and drops ungranted', async () => {
    const { filterPermittedUrls } = await import('../platform/permissions');
    // defaults always pass; custom.a granted; custom.b denied
    contains.mockImplementation(async ({ origins }: { origins: string[] }) => {
      return origins[0] === 'https://custom.a.example:50004/*';
    });
    const result = await filterPermittedUrls([
      'wss://custom.a.example:50004',
      BUILTIN,
      'wss://custom.b.example:50004',
    ]);
    expect(result).toEqual(['wss://custom.a.example:50004', BUILTIN]);
    expect(request).not.toHaveBeenCalled();
  });

  it('releaseHostPermission removes exact pattern; skips defaults', async () => {
    const { releaseHostPermission } = await import('../platform/permissions');
    remove.mockResolvedValue(true);
    await releaseHostPermission('wss://a.example:50004');
    expect(remove).toHaveBeenCalledWith({
      origins: ['https://a.example:50004/*'],
    });

    remove.mockClear();
    await releaseHostPermission(BUILTIN);
    expect(remove).not.toHaveBeenCalled();
  });

  it('releases permission only when origin unused', async () => {
    const { releaseHostPermissionIfUnused } = await import(
      '../platform/permissions'
    );
    remove.mockResolvedValue(true);
    await releaseHostPermissionIfUnused('wss://a.example:50004', [
      'wss://b.example:50004',
    ]);
    expect(remove).toHaveBeenCalledWith({
      origins: ['https://a.example:50004/*'],
    });

    remove.mockClear();
    await releaseHostPermissionIfUnused('wss://a.example:50004', [
      'wss://a.example:50004',
      'wss://b.example:50004',
    ]);
    expect(remove).not.toHaveBeenCalled();
  });
});
