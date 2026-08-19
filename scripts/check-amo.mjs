#!/usr/bin/env node
/**
 * AMO artifact gate: Firefox MV3 bundle must not ship innerHTML assignment
 * or Function-constructor eval (addons-linter + text scan).
 *
 * Requires prior: npm run build:firefox
 * Usage: node scripts/check-amo.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIREFOX_DIR = join(ROOT, '.output/firefox-mv3');
const LINTER_BIN = join(ROOT, 'node_modules/addons-linter/bin/addons-linter');

const JS_EXT = new Set(['.js', '.mjs']);

const AMO_FAIL_CODES = new Set([
  'UNSAFE_VAR_ASSIGNMENT',
  'DANGEROUS_EVAL',
  'NO_IMPLIED_EVAL',
]);

/**
 * @typedef {{ file: string, rule: string, match: string }} Finding
 */

/**
 * @param {string} src
 * @returns {Array<{ rule: string, match: string }>}
 */
export function scanJsForAmoUnsafe(src) {
  /** @type {Array<{ rule: string, match: string }>} */
  const hits = [];
  const inner = src.match(/\.innerHTML\s*=/g);
  if (inner) {
    for (const match of inner) hits.push({ rule: 'innerHTML-assign', match });
  }
  const ctor = src.match(/\bnew Function\b/g);
  if (ctor) {
    for (const match of ctor) hits.push({ rule: 'new-Function', match });
  }
  const alias = src.match(/\bnew F\(/g);
  if (alias) {
    for (const match of alias) hits.push({ rule: 'new-F', match });
  }
  return hits;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function collectJsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (JS_EXT.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} dir
 * @returns {Finding[]}
 */
export function scanFirefoxBundle(dir) {
  /** @type {Finding[]} */
  const findings = [];
  for (const file of collectJsFiles(dir)) {
    const src = readFileSync(file, 'utf8');
    for (const hit of scanJsForAmoUnsafe(src)) {
      findings.push({
        file: relative(ROOT, file),
        rule: hit.rule,
        match: hit.match,
      });
    }
  }
  return findings;
}

/**
 * @param {string} unpackedDir
 * @returns {{ ok: boolean, messages: Array<{ file?: string, code?: string, message?: string, type?: string }> }}
 */
export function runAddonsLinter(unpackedDir) {
  if (!existsSync(LINTER_BIN)) {
    return {
      ok: false,
      messages: [
        {
          message: `addons-linter missing at ${relative(ROOT, LINTER_BIN)}`,
        },
      ],
    };
  }

  const result = spawnSync(
    process.execPath,
    [
      LINTER_BIN,
      unpackedDir,
      '--min-manifest-version=3',
      '--output=json',
    ],
    { encoding: 'utf8', cwd: ROOT }
  );

  const stdout = result.stdout ?? '';
  const jsonStart = stdout.indexOf('{');
  if (jsonStart < 0) {
    return {
      ok: false,
      messages: [
        {
          message: `addons-linter produced no JSON (status ${result.status}): ${stdout || result.stderr || 'empty'}`,
        },
      ],
    };
  }

  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    const messages = [
      ...(parsed.errors ?? []),
      ...(parsed.warnings ?? []),
      ...(parsed.notices ?? []),
    ];
    return { ok: true, messages };
  } catch (err) {
    return {
      ok: false,
      messages: [
        {
          message: `addons-linter JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

function runCli() {
  if (!existsSync(FIREFOX_DIR)) {
    process.stderr.write(
      'check-amo: missing .output/firefox-mv3 (run npm run build:firefox)\n'
    );
    process.exit(1);
  }

  /** @type {string[]} */
  const failures = [];

  const textHits = scanFirefoxBundle(FIREFOX_DIR);
  for (const hit of textHits) {
    failures.push(`${hit.file}: ${hit.rule} (${hit.match})`);
  }

  const lint = runAddonsLinter(FIREFOX_DIR);
  if (!lint.ok) {
    for (const msg of lint.messages) {
      failures.push(msg.message ?? 'addons-linter failed');
    }
  } else {
    for (const msg of lint.messages) {
      if (msg.type === 'notice') continue;
      if (!AMO_FAIL_CODES.has(msg.code ?? '')) continue;
      failures.push(
        `${msg.file ?? 'addon'}: ${msg.code} ${msg.message ?? ''}`.trim()
      );
    }
  }

  if (failures.length > 0) {
    process.stderr.write('check-amo: failed\n');
    for (const line of failures) {
      process.stderr.write(`  ${line}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('check-amo: ok\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
