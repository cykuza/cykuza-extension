# Run your own Electrum server

Cykuza may ship **shared Electrum defaults** (via `CYKUZA_ELECTRUM_MAINNET_URLS` at build time), the same model as cykuza-web’s `NEXT_PUBLIC_ELECTRUMX_*`. Those hosts are convenience only: they can see addresses you query and may lie about balances, history, fees, or broadcast.

A personal `wss://` server you control is the stronger trust model.

## Packaged guide

Extension users open the in-product page:

- `public/self-host-electrum.html` (Settings → About, Network, Terms, Home/Send advisory)

## Operator steps

1. Run a Cyberyen full node and [ElectrumX](https://electrumx.readthedocs.io/) (or compatible) against it.
2. Serve Electrum over TLS as `wss://your-host:port`. The wallet rejects `ws://`.
3. Prefer two independent hosts if dual-server verify should mean more than one operator.
4. In the extension: **Settings → Network** → add your URL → grant host permission → optionally remove built-in endpoints → keep **Verify with second server** on when ≥2 endpoints are configured.

## Builds

| Build | Defaults |
|-------|----------|
| Contributor / CI (env empty) | Mainnet `[]` — custom `wss://` required |
| Release / local `.env` | Injected shared defaults + install-time `host_permissions` |

Never commit production hostnames. See README § Networks & Electrum.
