# AMO reviewer build (Firefox MV3)

This add-on is produced by [WXT](https://wxt.dev) + Vite. The uploaded XPI contains
minified/bundled JavaScript (and local Argon2 Wasm via `hash-wasm`). That is
**minification / bundling**, not obfuscation. There is no remote code.

Admin reviewers only: attach this repository (or the WXT `*-sources.zip`) on the
version page and follow the steps below so the rebuild matches the submitted XPI.

## Environment used for the submitted 0.1.3 XPI

| Item | Value |
|------|--------|
| OS | macOS (Darwin), arm64 |
| Node.js | 24.12.0 (`engines.node`: `>=22`) |
| npm | 11.7.0 |
| Lockfile | `package-lock.json` (required) |

AMO’s default VM is Ubuntu 24.04 ARM64 + Node 24. Please use **Node 24.x** (not
Node 22) so Vite chunk hashes match. If only ZIP metadata/timestamps differ,
compare unpacked `.output/firefox-mv3/` file contents.

Do **not** use web-based minifiers. All tools are local and open source (`wxt`,
`vite`, `npm`).

## Official Electrum endpoints (required for a bit-exact match)

Release XPIs inject built-in mainnet Electrum `wss://` URLs via the environment
variable `CYKUZA_ELECTRUM_MAINNET_URLS` (comma-separated). The values are **not**
in git or in this file.

**Set the same string used for the uploaded XPI** (see *Notes to Reviewers* on
the AMO version page — private to admin reviewers). Then:

```bash
npm ci
export CYKUZA_ELECTRUM_MAINNET_URLS='<exact string from Notes to Reviewers>'
npm run zip:firefox
```

Artifacts:

- XPI-equivalent zip: `.output/cykuza-extension-0.1.3-firefox.zip`
- Unpacked: `.output/firefox-mv3/` (load via `about:debugging` if needed)
- Sources zip (this tree, no `.env`): `.output/cykuza-extension-0.1.3-sources.zip`

Do **not** run `npm run check:no-secrets` on a secret-injected release build
(official hosts are expected in that artifact).

A contributor build with the env **unset** is intentional (custom Electrum only)
and will **not** match the store XPI.

## What to verify

- Manifest MV3; `gecko.id` = `wallet@cykuza`; `data_collection_permissions.required: ["none"]`
- Permissions: `storage`, `alarms`; optional hosts `https://*/*` (exact custom Electrum grants)
- No content scripts; no remote script URLs
- CSP `wasm-unsafe-eval` is only for local Argon2 Wasm
- Zod is configured `jitless` (no `Function` JIT). A Vite plugin in
  `scripts/amo-safe-vendors.mjs` removes React DOM `innerHTML` assignment and
  Zod’s `Function` probe from production chunks; `npm run check:amo` must pass.

## Privacy / support

- https://www.cykuza.xyz/privacy
- https://www.cykuza.xyz/extension
- https://github.com/cykuza/cykuza-extension
