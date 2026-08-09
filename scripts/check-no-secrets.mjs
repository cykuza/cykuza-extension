#!/usr/bin/env node
/**
 * Artifact hygiene scanner for `.output` extension builds (CI / OSS gate).
 *
 * Intended for builds **without** CYKUZA_ELECTRUM_MAINNET_URLS. Release
 * bundles that inject official hosts will contain those strings by design —
 * do not run this gate on secret-injected artifacts.
 *
 * Checks:
 *  1. manifest: no tabs / scripting permissions
 *  2. manifest: no localhost / 127.0.0.1 / 0.0.0.0
 *  3. Non-allowlisted wss?:// / https?:// host literals in JS/HTML/JSON
 *  4. Private-key patterns (PEM, extended keys, WIF-like)
 *
 * Usage: node scripts/check-no-secrets.mjs
 * Requires prior: npm run build && npm run build:firefox
 * Exit 1 on any finding.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const OUTPUT_DIRS = ['chrome-mv3', 'firefox-mv3'];

const TEXT_EXTS = new Set(['.js', '.mjs', '.json', '.html', '.css', '.map']);

const FORBIDDEN_PERMISSIONS = new Set(['tabs', 'scripting']);

const LOCAL_HOST_RE = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i;

const WSS_HOST_RE =
  /\bwss?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9])(?::\d+)?/gi;
const HTTPS_HOST_RE =
  /\bhttps?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9])(?::\d+)?/gi;

/** PEM private key header. */
const PEM_PRIVATE_RE = /-----BEGIN[^-]*PRIVATE KEY-----/g;

/**
 * BIP32 extended private key prefixes + base58 payload.
 * Requires a non-trivial payload so bare "xprv" docs strings are less noisy;
 * real keys are ~111 chars.
 */
const EXTENDED_PRIV_RE = /\b([xtyuvz]prv)[1-9A-HJ-NP-Za-km-z]{80,}/g;

/**
 * WIF-like (uncompressed ~51 chars starting with 5, compressed ~52 with K/L).
 * Filtered further by isBase58Alphabetish().
 */
const WIF_RE = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g;

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Mock / reserved host suffixes (same policy as leak-scan). */
const ALLOWED_HOST_SUFFIXES = [
  '.example',
  '.example.com',
  '.example.org',
  '.example.net',
  'example.com',
  'example.org',
  'example.net',
  '.invalid',
  '.test',
  '.localhost',
];

/**
 * Vendored / xmlns / framework URLs that appear in production bundles.
 * Keep minimal — only hosts confirmed in `.output` without Electrum env.
 */
const ALLOWED_VENDOR_HOSTS = new Set([
  'feross.org',
  'www.w3.org',
  'w3.org',
  'reactjs.org',
  'react.dev',
  // Zod 4 ships JSON Schema $schema meta URIs (not fetched at runtime).
  'json-schema.org',
  // Docs link in public/self-host-electrum.html (not an Electrum endpoint).
  'electrumx.readthedocs.io',
]);

/**
 * @typedef {{ file: string, line: number, rule: string, match: string }} Finding
 */

/**
 * @param {string} hostname
 */
function isAllowedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  // Single-label (e.g. UI placeholder "host") — not a public FQDN.
  if (!h.includes('.')) return true;
  if (ALLOWED_VENDOR_HOSTS.has(h)) return true;
  for (const suffix of ALLOWED_HOST_SUFFIXES) {
    if (h === suffix || h.endsWith(suffix) || h === suffix.replace(/^\./, '')) {
      return true;
    }
  }
  if (/\.example$/.test(h)) return true;
  return false;
}

/**
 * Skip base58 alphabet constants from bitcoinjs / similar (not real WIFs).
 * @param {string} s
 */
function isBase58Alphabetish(s) {
  if (BASE58_ALPHABET.includes(s)) return true;
  const rev = [...BASE58_ALPHABET].reverse().join('');
  if (rev.includes(s)) return true;
  // Common lib pattern: digit run + upper alphabet + lower alphabet (or swap).
  if (
    /[A-Z]{10,}/.test(s) &&
    /[a-z]{10,}/.test(s) &&
    /ABCDEFGHJKLMNPQRSTUV/.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTS.has(extname(name)) || name === 'manifest.json') {
      out.push(full);
    }
  }
}

/**
 * @param {string} file
 * @param {string} content
 * @param {RegExp} re
 * @param {string} rule
 * @param {(m: string) => boolean} [allow]
 * @returns {Finding[]}
 */
function findMatches(file, content, re, rule, allow) {
  /** @type {Finding[]} */
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      const match = m[0];
      if (allow && allow(match)) continue;
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        rule,
        match: match.length > 80 ? `${match.slice(0, 77)}...` : match,
      });
    }
  }
  return findings;
}

/**
 * @param {string} manifestPath
 * @returns {Finding[]}
 */
function scanManifest(manifestPath) {
  /** @type {Finding[]} */
  const findings = [];
  const rel = relative(ROOT, manifestPath);
  let raw;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (e) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'manifest-read',
      match: String(e),
    });
    return findings;
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    findings.push({
      file: rel,
      line: 1,
      rule: 'manifest-json',
      match: 'invalid JSON',
    });
    return findings;
  }

  if (manifest.manifest_version !== 3) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'manifest-version',
      match: `manifest_version=${manifest.manifest_version}`,
    });
  }

  const permLists = [
    ['permissions', manifest.permissions],
    ['optional_permissions', manifest.optional_permissions],
  ];
  for (const [field, list] of permLists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (typeof p === 'string' && FORBIDDEN_PERMISSIONS.has(p)) {
        findings.push({
          file: rel,
          line: 1,
          rule: 'forbidden-permission',
          match: `${field}:${p}`,
        });
      }
    }
  }

  if (LOCAL_HOST_RE.test(raw)) {
    findings.push({
      file: rel,
      line: 1,
      rule: 'localhost',
      match: 'localhost/loopback in manifest',
    });
  }

  return findings;
}

/**
 * Scan built extension output directories for secrets / hygiene issues.
 * @param {{ root?: string, dirs?: string[] }} [opts]
 * @returns {Finding[]}
 */
export function scanOutput(opts = {}) {
  const root = opts.root ?? ROOT;
  const dirs = opts.dirs ?? OUTPUT_DIRS;
  /** @type {Finding[]} */
  const findings = [];

  for (const name of dirs) {
    const outDir = join(root, '.output', name);
    if (!existsSync(outDir)) {
      findings.push({
        file: `.output/${name}`,
        line: 1,
        rule: 'missing-output',
        match: 'directory missing — run npm run build && npm run build:firefox',
      });
      continue;
    }

    const manifestPath = join(outDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      findings.push({
        file: `.output/${name}/manifest.json`,
        line: 1,
        rule: 'missing-manifest',
        match: 'manifest.json missing',
      });
    } else {
      findings.push(...scanManifest(manifestPath));
    }

    const files = [];
    walk(outDir, files);

    const hostAllow = (match) => {
      try {
        const urlLike = match.includes('://') ? match : `wss://${match}`;
        const u = new URL(urlLike);
        return isAllowedHost(u.hostname);
      } catch {
        return false;
      }
    };

    for (const file of files) {
      // Manifest host/permission rules handled above; still scan for keys.
      const content = readFileSync(file, 'utf8');
      const isManifest = file.endsWith(`${name}/manifest.json`);

      if (!isManifest) {
        findings.push(
          ...findMatches(file, content, WSS_HOST_RE, 'wss-host', hostAllow)
        );
        findings.push(
          ...findMatches(file, content, HTTPS_HOST_RE, 'http-host', (match) => {
            if (match.includes('*')) return true;
            return hostAllow(match);
          })
        );
        findings.push(
          ...findMatches(file, content, LOCAL_HOST_RE, 'localhost')
        );
      }

      findings.push(
        ...findMatches(file, content, PEM_PRIVATE_RE, 'pem-private')
      );
      findings.push(
        ...findMatches(file, content, EXTENDED_PRIV_RE, 'extended-private')
      );
      findings.push(
        ...findMatches(file, content, WIF_RE, 'wif-like', (match) =>
          isBase58Alphabetish(match)
        )
      );
    }
  }

  return findings;
}

function main() {
  const findings = scanOutput();
  if (findings.length === 0) {
    process.stdout.write('check-no-secrets: ok\n');
    process.exit(0);
  }
  for (const f of findings) {
    process.stderr.write(`${f.file}:${f.line}: [${f.rule}] ${f.match}\n`);
  }
  process.stderr.write(`check-no-secrets: ${findings.length} finding(s)\n`);
  process.exit(1);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
