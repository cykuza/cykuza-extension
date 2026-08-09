#!/usr/bin/env node
/**
 * Operational privacy leak scanner for OSS source (not .output bundles).
 *
 * Checks:
 *  1. console.log/debug/info/warn/error in src/ + entrypoints/
 *  2. Non-allowlisted wss?:// dotted-host literals in src/, *.md, configs
 *  3. IPv4 literals (except 127.0.0.1)
 *  4. Optional denylist (scripts/leak-denylist.txt + LEAK_DENYLIST env)
 *
 * Allowlisted host suffixes: .example, example.com/org/net, localhost,
 * .invalid, .test, .localhost
 *
 * Usage: node scripts/leak-scan.mjs
 * Exit 1 on any finding (CI gate).
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.output',
  '.wxt',
  '.git',
  'dist',
  'coverage',
  'web-ext-artifacts',
]);

/** Reserved / mock host suffixes safe in OSS tests and docs. */
const ALLOWED_HOST_SUFFIXES = [
  '.example',
  '.example.com',
  '.example.org',
  '.example.net',
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  '.localhost',
  '.invalid',
  '.test',
];

/** Docs / tooling hosts that may appear in comments or config URLs (not Electrum). */
const ALLOWED_DOC_HOSTS = new Set([
  'wxt.dev',
  'github.com',
  'developer.chrome.com',
  'developer.mozilla.org',
]);

/**
 * @param {string} ip
 */
function isAllowedIpv4(ip) {
  if (ip === '127.0.0.1') return true;
  // RFC 5737 documentation ranges
  if (ip.startsWith('192.0.2.')) return true;
  if (ip.startsWith('198.51.100.')) return true;
  if (ip.startsWith('203.0.113.')) return true;
  return false;
}

const CONSOLE_RE = /\bconsole\.(log|debug|info|warn|error)\b/g;
const WSS_HOST_RE = /\bwss?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9])(?::\d+)?/gi;
const HTTPS_HOST_RE =
  /\bhttps?:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9])(?::\d+)?/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * @typedef {{ file: string, line: number, rule: string, match: string }} Finding
 */

/**
 * @param {string} hostname
 */
function isAllowedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.')) {
    // Single-label (e.g. "host") — not a public FQDN; ignore for host-literal scan.
    return true;
  }
  if (h === '127.0.0.1') return true;
  if (ALLOWED_DOC_HOSTS.has(h)) return true;
  for (const suffix of ALLOWED_HOST_SUFFIXES) {
    if (h === suffix || h.endsWith(suffix) || h === suffix.replace(/^\./, '')) {
      return true;
    }
    // "*.example" style: ends with .example
    if (suffix.startsWith('.') && h.endsWith(suffix)) return true;
  }
  // electrum-a.example etc.
  if (/\.example$/.test(h)) return true;
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
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTS.has(extname(name)) || name === 'Dockerfile') {
      out.push(full);
    }
  }
}

/**
 * @returns {string[]}
 */
function loadDenylist() {
  const items = new Set();
  const filePath = join(ROOT, 'scripts/leak-denylist.txt');
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      items.add(t.toLowerCase());
    }
  }
  const env = process.env.LEAK_DENYLIST ?? '';
  for (const part of env.split(/[,\s]+/)) {
    const t = part.trim().toLowerCase();
    if (t) items.add(t);
  }
  return [...items];
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
        match,
      });
    }
  }
  return findings;
}

/**
 * Scan the repository source tree for privacy leaks.
 * @param {{ root?: string }} [opts]
 * @returns {Finding[]}
 */
export function scanRepo(opts = {}) {
  const root = opts.root ?? ROOT;
  /** @type {Finding[]} */
  const findings = [];
  const denylist = loadDenylist();

  // 1) console.* in src/ + entrypoints/
  const consoleRoots = [join(root, 'src'), join(root, 'entrypoints')];
  for (const dir of consoleRoots) {
    if (!existsSync(dir)) continue;
    const files = [];
    walk(dir, files);
    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        // Still forbid console in tests — use expect, not console dumps.
      }
      const content = readFileSync(file, 'utf8');
      findings.push(
        ...findMatches(file, content, CONSOLE_RE, 'console')
      );
    }
  }

  // 2) Host literals in src/, markdown, configs (not .output)
  const hostScanFiles = [];
  walk(join(root, 'src'), hostScanFiles);
  walk(join(root, 'entrypoints'), hostScanFiles);
  for (const name of [
    'README.md',
    'CONTRIBUTING.md',
    'wxt.config.ts',
    'vitest.config.ts',
    'package.json',
    '.env.example',
  ]) {
    const p = join(root, name);
    if (existsSync(p)) hostScanFiles.push(p);
  }
  // Also walk docs at root *.md
  try {
    for (const name of readdirSync(root)) {
      if (name.endsWith('.md') && !hostScanFiles.includes(join(root, name))) {
        hostScanFiles.push(join(root, name));
      }
    }
  } catch {
    /* ignore */
  }

  const hostAllow = (match) => {
    try {
      // Extract hostname from URL-like match
      const urlLike = match.includes('://') ? match : `wss://${match}`;
      const u = new URL(urlLike);
      return isAllowedHost(u.hostname);
    } catch {
      return false;
    }
  };

  for (const file of hostScanFiles) {
    const content = readFileSync(file, 'utf8');
    // Skip the leak scanner itself and denylist file (patterns / instructions).
    const rel = relative(root, file);
    if (rel.startsWith('scripts/')) continue;

    const isMarkdown = rel.endsWith('.md');

    // wss:// hosts are Electrum endpoints — scan everywhere (including docs).
    findings.push(
      ...findMatches(file, content, WSS_HOST_RE, 'wss-host', hostAllow)
    );

    // https:// host literals in source (not markdown — docs may link to GitHub/WXT).
    if (!isMarkdown) {
      findings.push(
        ...findMatches(file, content, HTTPS_HOST_RE, 'http-host', (match) => {
          if (match.includes('*')) return true;
          return hostAllow(match);
        })
      );
      findings.push(
        ...findMatches(
          file,
          content,
          IPV4_RE,
          'ipv4',
          (match) => isAllowedIpv4(match)
        )
      );
    }

    // Denylist substrings (including markdown).
    if (denylist.length > 0) {
      const lines = content.split('\n');
      for (const needle of denylist) {
        if (!needle) continue;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            findings.push({
              file: rel,
              line: i + 1,
              rule: 'denylist',
              match: needle,
            });
          }
        }
      }
    }
  }

  return findings;
}

function main() {
  const findings = scanRepo();
  if (findings.length === 0) {
    process.stdout.write('leak-scan: ok\n');
    process.exit(0);
  }
  for (const f of findings) {
    process.stderr.write(
      `${f.file}:${f.line}: [${f.rule}] ${f.match}\n`
    );
  }
  process.stderr.write(`leak-scan: ${findings.length} finding(s)\n`);
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main();
}
