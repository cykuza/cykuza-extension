import {
  OPTIONAL_HOST_PERMISSIONS,
  parseElectrumMainnetUrls,
  toHostPermissionPatterns,
} from './src/domain/electrum/defaults';
import { resolveChromiumBinary } from './scripts/resolve-chromium-binary';
import { defineConfig } from 'wxt';

/**
 * Electrum defaults must be read inside config callbacks — not at module top
 * level. WXT loads `.env` into `process.env` only after the config file is
 * evaluated; top-level reads always see an empty string and produce builds
 * with no built-in hosts (see WXT env docs: use function form for manifest).
 */
function electrumMainnetEnvRaw(): string {
  // Git pre-push / GitHub CI (`npm run gate`) must emit secret-free artifacts.
  // Maintainer `.env` is ignored for that path; `npm run zip` still injects.
  if (process.env.CYKUZA_GATE === '1') return '';
  return process.env.CYKUZA_ELECTRUM_MAINNET_URLS ?? '';
}

function electrumMainnetUrlsFromEnv(): string[] {
  return parseElectrumMainnetUrls(electrumMainnetEnvRaw());
}

// web-ext/chrome-launcher only auto-discovers Google Chrome. Resolve any
// Chromium-family binary (Chrome, Brave, Edge, …) so `npm run dev` works
// on machines that ship a Chromium browser without Chrome itself.
const chromiumBinary = resolveChromiumBinary();
if (!chromiumBinary) {
  // Config-time operator notice (not extension runtime telemetry).
  process.stderr.write(
    '[cykuza] No Chromium browser found (Chrome/Brave/Edge/Chromium). ' +
      'Dev server will build without auto-opening a browser. Set CHROME_PATH ' +
      'or load .output/chrome-mv3-dev unpacked manually.\n'
  );
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Force MV3 for all browsers (WXT defaults Firefox/Safari to MV2, which
  // strips optional_host_permissions and breaks custom Electrum grants).
  manifestVersion: 3,
  webExt: chromiumBinary
    ? {
        binaries: {
          // Default `wxt` target is chrome; map it to the resolved Chromium binary.
          chrome: chromiumBinary,
        },
      }
    : {
        // Build + HMR still work; operator loads the unpacked output manually.
        disabled: true,
      },
  manifest: () => {
    const electrumMainnetUrls = electrumMainnetUrlsFromEnv();
    return {
      name: 'Cykuza Wallet',
      description:
        'Non-custodial Cyberyen wallet. Keys never leave your device. Encrypted vault ciphertext only — no telemetry, no cloud.',
      permissions: ['storage', 'alarms'],
      host_permissions: toHostPermissionPatterns(electrumMainnetUrls),
      optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],
      // hash-wasm Argon2 needs WebAssembly; MV3 default CSP blocks wasm without this.
      content_security_policy: {
        extension_pages:
          "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      },
      // Firefox MV3 requires a stable id for signing; declare no vendor telemetry.
      browser_specific_settings: {
        gecko: {
          id: 'wallet@cykuza',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
      icons: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
      action: {
        default_title: 'Cykuza Wallet',
      },
    };
  },
  vite: (env) => {
    const electrumMainnetEnv = electrumMainnetEnvRaw();
    return {
      define: {
        // Same string used for host_permissions — keep manifest + runtime aligned.
        'import.meta.env.CYKUZA_ELECTRUM_MAINNET_URLS': JSON.stringify(
          electrumMainnetEnv
        ),
        // bitcoinjs-family packages expect Node's global; map it for the SW.
        global: 'globalThis',
      },
      resolve: {
        alias: {
          // Ensure the Buffer polyfill resolves in the browser SW bundle.
          buffer: 'buffer/',
        },
      },
      optimizeDeps: {
        include: ['buffer'],
      },
      build: {
        // Dev keeps inline maps; prod must not ship sourcemaps (env secrets).
        sourcemap: env.command === 'serve' ? 'inline' : false,
      },
    };
  },
});
