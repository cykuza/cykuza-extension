## Summary

<!-- What changed and why (1–3 bullets). -->

## Checklist

- [ ] `npm run lint` / `check:leaks` / `test` / `compile` pass locally
- [ ] If this touches build, manifest, or Electrum defaults: `build` + `build:firefox` + `check:no-secrets`
- [ ] No secrets, seeds, passwords, `.env`, private keys, or **real** Electrum / server hostnames in the diff
- [ ] Permissions contract unchanged: `chrome.permissions.request` only from the **electrum-grant** page; popup opens that tab when needed; service worker uses `contains` / `remove` only
- [ ] No telemetry, analytics SDK, or account/cloud sync added

## Test plan

<!-- How you verified the change (commands and/or manual steps). -->
