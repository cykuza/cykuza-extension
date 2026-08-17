# Cykuza Wallet Extension

Non-custodial **Cyberyen** browser wallet (Manifest V3). Sister project to [`cykuza-web`](https://github.com/cykuza/cykuza-web) (explorer + web wallet).

**License:** [MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Privacy model

- **No accounts, no telemetry, no cloud sync.**
- Encrypted vault (Argon2id + AES-256-GCM ciphertext only) lives in `chrome.storage.local`.
- Settings (network, Electrum endpoints, auto-lock, terms, optional explorer template) are stored separately from the vault.
- Cold start of the service worker is always **locked**. Plaintext keys exist only in **service worker RAM** after unlock.
- UI never keeps seed/password in long-lived React context; form fields are cleared on unmount.
- Auto-lock via `chrome.alarms` (default **5** minutes for new installs, configurable in settings). Idle timer re-arms on successful refresh / reveal / send activity. Optional **reset idle lock when popup closes** (default on for new installs; off when migrating older settings) (re)arms that countdown on hide — it does **not** wipe keys immediately (Chrome host-permission prompts close the action popup).
- Unlock lockout: 5 failed attempts → 15 minutes (counter in `storage.local`).
- Destroy removes the vault; the terms-accepted flag may remain.
- No content scripts / dApp provider in v1.
- **No `console.*` logging** of URLs, addresses, or secrets (ESLint `no-console` + `npm run check:leaks`).
- Prod builds ship **without sourcemaps** (build-time Electrum env must not leak via maps).

### Storage inventory

Only `chrome.storage.local` (never `sync`, never cloud backup):

| Key | Contents |
|-----|----------|
| `vault_ciphertext` | Argon2id + AES-GCM sealed vault |
| `wallet_settings` | Network, Electrum endpoints (incl. custom URLs), auto-lock minutes, lock-when-popup-closes, verify-with-second-server, terms, optional explorer tx URL template, local address book, optional daily spend limit (sats) |
| `unlock_lockout` | Failed unlock counter / lockout deadline |
| `daily_spend` | Local calendar day key + sats spent today (limit enforcement only; not telemetry) |

Custom Electrum URLs in settings are inevitable for a self-hosted server; they stay on-device only.

### UI exposure (operational privacy)

| Surface | What is shown |
|---------|----------------|
| **Home** | Connection status only: `Connected` / `Connecting` / `Error` / `Not configured`, optionally `· Built-in` / `· Custom`. **Never** a raw `wss://` hostname. Amounts in **CY** (8 decimals). Network is chosen in Settings. |
| **Settings** | Server list masked by default (`wss://••••:50004`). Toggle **Show full URLs** to reveal until you leave the screen. Copy URL only via an explicit Copy button. Test results say `Connection OK` without echoing the URL. Optional block-explorer tx template (empty by default — no hardcoded explorer host). Address book addresses masked by default; optional daily spend limit. |
| **Send done** | Txid + Copy. Explorer link only if the user saved an `https://…/{txid}` template in Settings (`rel=noreferrer`). |
| **Errors** | Stable phrases (`Connection failed`, `Permission denied`). Raw WebSocket / DNS / full URL never appear in `status.error`. |

Settings is a shoulder-surfing surface when URLs are revealed — hide them when finished.

## Networks & Electrum

### Build without defaults

Official Electrum hostnames are a **build-time secret**, not in public git, README examples, or tests.

| Build | `CYKUZA_ELECTRUM_MAINNET_URLS` | Result |
|-------|-------------------------------|--------|
| Contributor / CI | unset or empty | Mainnet defaults `[]` — add a custom `wss://` in Settings |
| Release (maintainers) | CI / local `.env` (never committed) | Injected as install-time `host_permissions` + runtime defaults |

Copy [`.env.example`](.env.example); leave the var empty unless you intentionally set **your own** servers. Tests force an empty env; use `*.example` / `example.com` hosts only.

- **Mainnet:** optional build-time Electrum `wss://` defaults + custom servers (see table above).
- **Testnet:** no official Electrum defaults. Custom `wss://` only — never falls back to mainnet.
- **Self-host:** in-product guide `public/self-host-electrum.html` + [docs/self-host-electrum.md](docs/self-host-electrum.md). Shared defaults are convenience only (address visibility / honesty risks).
- **Transport:** `wss://` only (`ws://` is rejected).
- **Lifecycle (MV3):**
  - **Batch** (Refresh fallback, send, probe): connect-on-demand → `server.version` probe → RPCs → disconnect. No socket across idle SW periods.
  - **Watch** (unlocked popup): named Port `cykuza-chain-watch` keeps the SW alive; SW holds one `wss://` client with `blockchain.scripthash.subscribe` and pushes balance/history updates. Socket is closed when the Port disconnects (popup hide) or the vault locks.
- **Sticky last-good:** successful URL is stored as `activeUrl` and tried first on the next connect.
- **Permissions:** when build-time defaults exist, install-time `host_permissions` cover those hosts. Custom origins require an exact `https://host:port/*` grant before save/connect. Deny → server is not activated. Removing a custom server releases the permission when the origin is unused.

  | Place | `request` | `contains` | `remove` |
  |-------|-----------|------------|----------|
  | electrum-grant tab (Continue) | yes (first await in that click) | — | yes (temp Test when host not listed) |
  | Popup Network (Add / Test) | **never** | yes (open grant tab if missing) | via shared test helper / Remove |
  | Service worker | **never** | yes (filter / assert) | yes (release unused after Remove) |

  MV3 drops the user gesture across `chrome.runtime.sendMessage`, so `chrome.permissions.request` from the service worker silently fails. The grant tab is the sole `request()` surface; the SW only checks existing grants (`contains`) and may `remove` without a gesture. Ungranted custom candidates are skipped in failover; if none remain, the UX error is `No permitted Electrum servers…` (no hostname leaked).

## Stack

- [WXT](https://wxt.dev) 0.21 + React 19 + TypeScript 5.9 + Vite 8 + ESLint 10
- Amounts displayed in **CY** (8 decimal places; 1 CY = 1e8 sat)
- `bitcoinjs-lib` 7 / `bip32` 5 / `ecpair` 3 / `@scure/bip39` — BIP84 P2WPKH (coin type `802`, path `m/84'/802'/0'/0/0`); ECC via `@bitcoinerlab/secp256k1` (no Node polyfills / `elliptic`); seed entropy via `src/domain/seedEntropy.ts` (`csprng` / `mixed` / `user`, 12|24 words)
- `hash-wasm` Argon2id + Web Crypto AES-GCM
- Zod 4–validated messaging (strict request shapes)
- On-demand Electrum over `wss://`, plus UI-scoped watch while the popup Port is open

TypeScript stays on **5.9** until `typescript-eslint` supports 6+/7 (`peer` currently `<6.1.0`). That is a tooling constraint, not a runtime CVE surface.

## Develop

See [CONTRIBUTING.md](CONTRIBUTING.md) for Electrum setup from source.

```bash
cp .env.example .env   # optional: set CYKUZA_ELECTRUM_MAINNET_URLS for local defaults
                       # (WXT loads `.env` before manifest/vite callbacks — rebuild after edits)

npm install
npm run dev
```

Load the unpacked extension from `.output/chrome-mv3` (path printed by WXT) in `chrome://extensions` → Developer mode → Load unpacked. Firefox: `npm run build:firefox` → load `.output/firefox-mv3` via `about:debugging`. Without env defaults, add a custom `wss://` Electrum in Settings before Refresh.

Popup chrome is a fixed **360×560** CSS px window (no `vh`/`vw`, in-flow header + scrollable body). Self-hosted Hack fonts live under `public/fonts/` (CSP `'self'`). Visual language matches the cykuza-web wallet overlay (black canvas, hairline borders, inverted primary buttons).

```bash
npm run build        # Chrome/Edge/Brave (reads CYKUZA_ELECTRUM_MAINNET_URLS)
npm run build:firefox  # Firefox MV3 (same manifestVersion)
npm run zip
npm run zip:firefox
npm run lint
npm run check:leaks
npm run check:no-secrets  # after build + build:firefox; scans .output
npm test
npm run compile
```

CI (`.github/workflows/ci.yml`) and the local git **pre-push** hook run `npm run gate` (see `scripts/ci-gate.mjs`) **without** Electrum secrets: `audit:prod` → `audit:toolchain` → `lint` → `check:leaks` → `test` → `compile` → `build` → `build:firefox` → `check:no-secrets`. That gates tracked sources, shipped-dep advisories, allowlisted toolchain residuals only, and secret-free build artifacts. Release builds may inject `CYKUZA_ELECTRUM_MAINNET_URLS` into the store zip; do not run `check:no-secrets` on those secret-injected bundles.

`postinstall` runs `wxt prepare` only (local type stubs — no network telemetry).

### Release maintainers

Pipeline:

1. Store `CYKUZA_ELECTRUM_MAINNET_URLS` (comma-separated `wss://host:port`) as a **CI / build secret** — never in git, README, tests, or `.env` committed to the repo.
2. Release job: export the secret into the build environment → `npm run zip` and `npm run zip:firefox` (WXT reads env in `wxt.config.ts` for runtime defaults + install-time `host_permissions`).
3. Record SHA-256 digests of the browser zips (`shasum -a 256 .output/*.zip` or `npm run hash:artifacts`) in the release notes / checklist before upload.
4. Upload the browser zips to CWS / AMO. Official hosts in the **release** artifact are expected.
5. **AMO source upload:** attach WXT `*-sources.zip` (or this tree) on the version page. Build steps: [AMO_REVIEW.md](AMO_REVIEW.md). The archive must not include `.env` or real hostnames; put the exact `CYKUZA_ELECTRUM_MAINNET_URLS` string only in AMO *Notes to Reviewers*. Contributor/CI builds leave the env unset so `.output` stays secret-free (`check:no-secrets` must pass).

Optional private regression denylist: CI env `LEAK_DENYLIST` (do not put live hosts in `scripts/leak-denylist.txt` unless they already leaked publicly).

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor Electrum setup.
## Threat assumptions

This is a **hot wallet**: it trusts the browser/OS CSPRNG and that process memory is not compromised. Full OS/browser compromise is out of scope.

What this wallet **does** protect against / assume:

| Assumption | Detail |
|------------|--------|
| Local storage attacker | Access to `chrome.storage.local` sees only vault ciphertext, settings, and unlock lockout counter — not seed/password plaintext. |
| SW lifetime | Cold start / kill of the service worker drops RAM identity → wallet is locked. |
| UI surface | Popup does not hold seed/password in durable context; secrets appear only on short-lived screens and are cleared on navigate/unmount. |
| Password = decrypt | Unlock / reveal / send re-auth succeed only if vault decrypt works (no separate password-hash oracle). |
| Electrum trust | Chosen Electrum server sees addresses you query and can lie about balance/UTXOs/fees or censor broadcast. Build-time default hosts (when injected) are install-time; custom hosts require an explicit user grant. |
| Optional host scope | Manifest declares `optional_host_permissions: https://*/*` so Chrome can grant exact custom origins at runtime; grants are per-origin, not blanket. |
| Out of scope | Malware with full process memory access, compromised OS, or a malicious Electrum that the user explicitly authorized. Key wipe of JS strings is best-effort (GC + SW restart). |

### Versions

Bump when the corresponding shape or on-disk format changes (never silent vault rewrites).

| Surface | Current | Source |
|---------|---------|--------|
| Messaging protocol | **16** | `PROTOCOL_VERSION` in `src/messaging/protocol.ts` |
| Vault ciphertext | **1** (legacy) / **2** (legacy passphrase) / **3** (new seals) | `src/domain/vault.ts` — v2/v3 may set `passphraseRequired`; v2 passphrase wallets migrate to v3 on unlock; no silent v1 rewrite |
| Wallet settings | **7** | `SETTINGS_VERSION` in `src/domain/settings.ts` — includes `lockWhenPopupCloses`, address book, `dailySpendLimitSats`, `verifyWithSecondServer`, `seedBackupConfirmed` |

## Verification gate

Contributor / CI suite without `CYKUZA_ELECTRUM_MAINNET_URLS` (same command as git pre-push):

```bash
npm run gate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR rules.

## Accepted product boundaries (not backlog)

These are **model limits**, not unfinished work.

| Item | Notes |
|------|-------|
| Hot wallet / OS RNG / process memory | Inherent to a browser extension |
| Full SPV / hardware wallet | Separate products — out of scope |
| Dependabot / Renovate | Maintainer policy — manual review + CI audit only |
| Live Electrum verification | Maintainer-owned; CI stays Electrum-free (no production hosts in git) |
| Optional `https://*/*` declaration | Chrome MV3 constraint for exact-origin grants |
| JS string secret wipe | Best-effort only (GC + SW restart); see [SECURITY.md](SECURITY.md) |
| Electrum honesty | Authorized server may lie or censor; dual-server verify mitigates when ≥2 endpoints |

## Relation to cykuza-web

| Repo | Role |
|------|------|
| `cykuza-web` | Explorer + optional web wallet |
| `cykuza-extension` | Installable browser wallet |

Shared concepts (network params, BIP84 derivation, Electrum) live under `src/domain/`. Keep Cyberyen network params aligned with `cykuza-web/lib/cyberyenNetwork.ts`. This extension uses the correct single BIP84 leaf `m/84'/802'/0'/0/0` (do not port the web wallet's extra `/0/0` derive).

**UI parity** with the web wallet overlay means shared design tokens and composition patterns (chrome, balance hero, list rows, surface cards) — not identical Tailwind markup. The extension keeps CSS variables + semantic classes in the popup stylesheet.

## Security notes

- This is a **hot wallet** (browser extension): browser/OS RNG and process memory are trusted; Electrum servers see addresses you query. Full policy: [SECURITY.md](SECURITY.md).
- Password verification = successful vault decrypt (no separate password-hash oracle). Unlock failures (password or BIP39 passphrase) share one `Unlock failed` phrase.
- Versions: messaging protocol **16**; vault ciphertext **v1** (legacy) / **v2** (legacy passphrase) / **v3** (new seals; optional BIP39 `passphraseRequired` + 32-hex encrypted `seedFingerprint`); settings **v7**. New wallets default to **24-word** mnemonics. Unsupported vault versions fail closed; existing v1 wallets are never silently rewritten. v2 passphrase wallets re-seal as v3 on successful unlock. See [Versions](#versions).
- Electrum: with ≥2 configured endpoints, dual-server verify is required (`electrumTrust`); degraded / verify-off blocks Refresh and Send.
- Key wipe on lock is best-effort: mutable key buffers are zeroed; JS strings rely on GC + SW restart.
- Host permissions for build-time Electrum defaults (when injected) are install-time; custom `wss://` requires an explicit runtime grant.
- Extension CSP allows `'wasm-unsafe-eval'` only so Argon2 (hash-wasm) can compile; no remote script sources.
- Do not paste seed phrases into untrusted pages; only use this extension UI.
- Settings Electrum URLs are masked by default; revealing them is a shoulder-surfing risk — hide when finished.
- Supply-chain: production crypto deps are **exact-pinned**; CI dual-audits with `audit:prod` (fail-closed on shipped deps) and `audit:toolchain` (full tree; only documented residuals). Maintainers run `npm outdated` + both audit scripts at least monthly (and before releases). **No Dependabot / Renovate** — see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never `npm audit fix --force`; waivers only via `overrides` / vendor patch + a documented note.
