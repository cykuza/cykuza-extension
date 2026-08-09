# Security Policy

## Reporting a vulnerability

Report security issues **privately**. Do not open a public GitHub issue or PR with exploit details, seed phrases, private keys, or passwords.

Preferred channels (use whichever is available for this repository):

1. **GitHub Security Advisories** — *Security* → *Report a vulnerability* on the repo page.
2. Contact the maintainers privately (see the GitHub org / repo owner profile for a contact path).

Please include:

- Affected version / commit and browser (Chrome / Firefox).
- Clear steps to reproduce and expected vs actual impact.
- Whether the issue leaks keys, bypasses unlock, or weakens host-permission gating.

**Do not** include real seed phrases, passwords, or production Electrum hostnames in the report. Use placeholders.

We aim to acknowledge valid reports and coordinate a fix before any public disclosure.

## Threat model (summary)

Full detail: [README → Threat assumptions](README.md#threat-assumptions).

- **Hot wallet:** Cykuza is a browser extension hot wallet. It trusts the browser/OS CSPRNG and that process memory is not compromised.
- **No accounts, telemetry, or cloud sync.** Vault ciphertext and settings stay in `chrome.storage.local` on-device.
- **Plaintext keys** exist only in **service worker RAM** after unlock; cold start is locked. The UI does not keep seed/password in long-lived React context.
- **Electrum trust:** the chosen server sees addresses you query and can lie about UTXOs/fees or censor broadcast. Custom hosts need an explicit user permission grant.
- **`chrome.permissions.request`** only from the electrum-grant page (user gesture); the popup opens that tab when a custom host is not yet allowed; the service worker may only `contains` / `remove`.
- **Build-time Electrum defaults** are CI secrets, not in public source. Contributor builds with an empty env use custom `wss://` only.

## In scope

- Vault crypto (Argon2id / AES-GCM), unlock lockout, auto-lock (`chrome.alarms`; popup hide re-arms the idle countdown when enabled — no instant wipe).
- Seed entropy generation UX (`src/domain/seedEntropy.ts`: CSPRNG / mixed / user modes, 12|24 words; mix rule `SHA256(csprng ‖ user)` truncated).
- Messaging / RPC validation between popup and service worker.
- Electrum client error redaction and secret hygiene in source / build artifacts.
- Host-permission gating for custom Electrum origins.
- Supply-chain issues in **shipped** wallet crypto dependencies.

## Out of scope

- Malware or an attacker with full process / memory access, or a compromised OS / browser profile.
- A malicious Electrum server the user explicitly authorized.
- Social engineering, phishing, or physical access to an unlocked machine (including shoulder-surfing of Settings when Electrum URLs are revealed).
- Bugs in Chromium / Firefox / OS outside this extension’s control.
- Best-effort wipe of JS string secrets (GC + SW restart); not a hard memory guarantee.
- Known CVEs confined to **dev / build toolchain** (e.g. WXT Firefox zip helpers, Vitest/Vite) that do not ship in the MV3 wallet crypto path — deliberate majors only, via `package.json` `overrides` + a note here (not silent `--force` bumps). See [Accepted product boundaries](README.md#accepted-product-boundaries-not-backlog).
- Explicit product deferrals: Dependabot/Renovate, full SPV, hardware-wallet bridge, automatic silent vault v1 rewrite — see [Accepted product boundaries](README.md#accepted-product-boundaries-not-backlog).

## Supply chain

- **No Dependabot / Renovate.** Maintainers upgrade dependencies manually (`npm outdated` + `npm audit` at least monthly and before releases).
- **Dual CI audit** (after `npm ci`):
  1. `npm run audit:prod` — `npm audit --omit=dev --audit-level=high` — **fail-closed** for production / shipped dependencies (wallet crypto path).
  2. `npm run audit:toolchain` — full-tree audit; high/critical findings fail unless they are on the **documented residual allowlist** in `scripts/audit-toolchain.mjs` (mirrored below). No `.npmrc` / audit-ignore silence; never `npm audit fix --force`.
- Temporary waivers for other packages: pin via `package.json` `overrides` and note the reason here (or in the README accepted-boundaries).

### Documented toolchain residual (`image-size` / `web-ext`)

| Item | Detail |
|------|--------|
| Advisories | [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) |
| Severity model | DoS only (**C:N I:N A:H**) — infinite loop in ICNS / JXL / HEIF parsers |
| Dependency path | `wxt` → `web-ext` → `addons-linter` → `image-size@2.0.2` (**dev/build only**) |
| Extension runtime | **Not present** in the MV3 wallet bundle (vault / Electrum / UI) |
| Upstream | `image-size` npm package has no release beyond 2.0.2; upstream repo archived — no official fix yet |
| Rejected “fixes” | Downgrade to `web-ext@5` / older WXT via `npm audit fix --force` (breaks current Firefox MV3 tooling) |
| Operational controls | Extension icons are PNG under `public/`; do not run addons-linter against untrusted third-party zips in CI |
| Follow-up | Vendor-patch or replace when Mozilla ships an `addons-linter` without the archived parser; then remove the allowlist entries and restore a clean full-tree audit |

Until that follow-up lands, README / checklists must not claim a blanket “0 vulnerabilities” for the full install tree — only that **prod audit is clean** and toolchain residuals are explicitly allowlisted.

## Versions

| Surface | Current | Notes |
|---------|---------|--------|
| Messaging protocol | **15** | `PROTOCOL_VERSION` — bump when request/response shapes change |
| Vault ciphertext | **1** / **2** / **3** | See [Vault format](#vault-format) |
| Wallet settings | **6** | `SETTINGS_VERSION` — auto-lock, lock-when-popup-closes, address book, daily spend limit, verify-with-second-server |

## Vault format

On-disk vault ciphertext uses **format version 1, 2, or 3**.

| Version | Envelope | Notes |
|---------|----------|--------|
| **1** | `version`, `salt`, `iv`, `ciphertext` | Legacy wallets. Still opened; **never** silently rewritten. |
| **2** | v1 fields + `passphraseRequired: boolean` | Legacy passphrase envelopes. When `passphraseRequired` is true, the AES payload includes an **8-hex** `seedFingerprint`. Still opened; passphrase wallets **re-seal as v3** on successful unlock (auth-gated migration). |
| **3** | same fields as v2 | All **new** seals. Passphrase wallets store a **32-hex** (16-byte) `seedFingerprint`. |

Unsupported versions fail closed. Corrupt/unparseable vault blobs set `hasVault: true` and `vaultCorrupt: true` (create/import blocked; destroy to recover). There is no automatic v1→v2/v3 migration.

**BIP39 passphrase (optional, new wallets):** Never stored in the vault. Failed unlock (wrong vault password **or** wrong BIP39 passphrase) returns the same user-facing `Unlock failed` copy so the UI does not reveal which factor failed. Reveal/send re-auth uses the vault password only; derivation already holds key material from unlock.

**Electrum trust:** With **two or more** configured endpoints, dual-server verify is **required**. `verify_off` or `degraded` (fewer than two permitted hosts) blocks Refresh / preview / broadcast. Single-endpoint setups remain allowed with an informational banner (inherent server trust).
