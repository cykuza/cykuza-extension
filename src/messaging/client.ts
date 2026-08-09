import {
  PROTOCOL_VERSION,
  parseWalletResponse,
  type WalletRequest,
  type WalletResponse,
} from './protocol';

/** Request body without the protocol envelope field. */
export type WalletRpcRequest = {
  [K in WalletRequest['type']]: Omit<
    Extract<WalletRequest, { type: K }>,
    'protocol'
  >;
}[WalletRequest['type']];

/**
 * Typed RPC from popup/UI into the service worker trust boundary.
 * Validates response with Zod before returning.
 * Callers must clear password/secret fields after the call.
 */
export async function walletRpc(
  request: WalletRpcRequest
): Promise<WalletResponse> {
  const envelope = {
    protocol: PROTOCOL_VERSION,
    ...request,
  } as WalletRequest;

  const raw = await chrome.runtime.sendMessage(envelope);
  if (raw === undefined) {
    return {
      ok: false,
      error:
        'No response from background. Reload the extension and try again.',
    };
  }
  const parsed = parseWalletResponse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }
  return parsed.data;
}
