# Contributing

Cykuza Wallet is an open-source, non-custodial Cyberyen browser extension. Contributions welcome.

Security vulnerabilities: report **privately** via [SECURITY.md](SECURITY.md) — do not open a public issue/PR with exploit details or secrets.

## Develop with your own Electrum

Official mainnet Electrum hosts are **not** in the public source. Release builds inject them via CI secrets. From a source checkout you need your own `wss://` Electrum (or leave the wallet unconfigured until you add one in Settings).

1. Copy the env template and optionally set local defaults:

```bash
cp .env.example .env
# Optional — your own servers only (never commit .env):
# CYKUZA_ELECTRUM_MAINNET_URLS=wss://your-electrum.example:50004
```

2. Install and run:

```bash
npm install
npm run dev
```

`npm run dev` opens a Chromium-family browser with the extension loaded. It prefers Google Chrome when installed, otherwise Brave / Edge / Chromium (or whatever `CHROME_PATH` points to). If none is found, the build still runs — load `.output/chrome-mv3-dev` unpacked manually. For Firefox: `npm run build:firefox` → `.output/firefox-mv3` via `about:debugging`.

3. If `CYKUZA_ELECTRUM_MAINNET_URLS` is empty (default), open **Settings** and add a custom `wss://` endpoint. Chrome will prompt for host permission; the service worker never calls `permissions.request`.

## Pull request rules

Before opening a PR, `npm run gate` must stay green (same steps as GitHub Actions). `npm install` installs a **pre-push** hook that runs this gate automatically:

```bash
npm run gate
```

Also:

- **No secrets in the diff:** seeds, passwords, private keys, `.env`, or **real** Electrum / server hostnames. Tests may use `*.example` / `example.com` only.
- **No telemetry / analytics SDKs**, accounts, or cloud sync.
- **Permissions:** `chrome.permissions.request` only from the **electrum-grant** page (user gesture). Popup Network uses `contains` and opens that tab when a grant is missing. Service worker: `contains` / `remove` only — never `request`.
- Red CI = do not merge. Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) checklist.

## Dependencies

- **Manual review only — no Dependabot / Renovate.** Deliberate version bumps after reading changelogs / advisories; never `npm audit fix --force`.
- **Cadence:** maintainers run `npm outdated` + both audit scripts at least **monthly**, and again before any release. Production crypto deps are exact-pinned in `package.json`; prefer upgrading those promptly.
- **CI dual audit** (after `npm ci`):
  1. `npm run audit:prod` — shipped/runtime deps; fails on high/critical.
  2. `npm run audit:toolchain` — full tree; fails on any high/critical **outside** the documented residual allowlist (see [SECURITY.md](SECURITY.md) — currently `image-size` DoS via `web-ext` / `addons-linter` only).
- **Waivers:** do not silence audit with ignore files or `.npmrc` suppressions. Prefer fixing via `package.json` `overrides` or a vendor patch; document in SECURITY.md. Never `npm audit fix --force`.

## Release maintainers

1. Set `CYKUZA_ELECTRUM_MAINNET_URLS` (comma-separated `wss://…`) as a CI / build secret — never commit real hosts.
2. Release build: inject the secret into the environment → `npm run zip` / `npm run zip:firefox` → upload store artifacts. Official hosts in those zips are expected.
3. Record SHA-256 digests of the browser zips (`shasum -a 256 .output/*.zip` or `npm run hash:artifacts`) in the release checklist / notes.
4. Public source (`git archive`, GitHub source zip, WXT `*-sources.zip`) must omit `.env` and real hosts. Contributor/CI builds leave the env unset; `check:no-secrets` must pass on `.output`.
5. Firefox AMO: upload `*-sources.zip` on the version page and follow [AMO_REVIEW.md](AMO_REVIEW.md). Put official Electrum URLs only in AMO *Notes to Reviewers* (not in git).

See README → Release maintainers. Optional private regression denylist: CI env `LEAK_DENYLIST` (do not put live hosts in `scripts/leak-denylist.txt` unless they already leaked publicly).
