#!/usr/bin/env node
/**
 * Full-tree npm audit gate with an explicit, documented residual allowlist.
 *
 * Production / shipped deps are gated separately:
 *   npm audit --omit=dev --audit-level=high
 *
 * This script audits the entire install (including WXT / web-ext). High/critical
 * findings outside the allowlist fail the job. Known residuals must be listed
 * here and in SECURITY.md — never silent ignore files.
 *
 * Residual (until a patched image-size or Mozilla drops the dep):
 *   GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq — DoS (C:N I:N A:H) in
 *   image-size parsers used only by addons-linter (dev/build). Not present in
 *   the MV3 wallet bundle. Upstream image-size is archived; no fixed npm release.
 *
 * Usage: node scripts/audit-toolchain.mjs
 * Exit 0 when clean or only allowlisted advisories; exit 1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Advisory GHSA ids that may appear until vendor-patch lands (uppercase). */
const ALLOWED_ADVISORY_IDS = new Set([
  'GHSA-W3RX-R6R6-PGPR',
  'GHSA-5P2G-FCMC-QVQQ',
]);

/** Packages that may transitively report via the allowlisted image-size DoS. */
const ALLOWED_VIA_PACKAGES = new Set([
  'image-size',
  'addons-linter',
  'web-ext',
  'wxt',
]);

/**
 * @param {unknown} via
 * @returns {{ ids: string[], packages: string[] }}
 */
function collectVia(via) {
  const ids = [];
  const packages = [];
  if (!Array.isArray(via)) return { ids, packages };
  for (const entry of via) {
    if (typeof entry === 'string') {
      packages.push(entry);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (entry);
      if (typeof obj.url === 'string') {
        const m = obj.url.match(/GHSA-[a-z0-9-]+/i);
        if (m) ids.push(m[0].toUpperCase());
      }
      if (typeof obj.source === 'string' && /^GHSA-/i.test(obj.source)) {
        ids.push(obj.source.toUpperCase());
      }
      if (typeof obj.name === 'string') packages.push(obj.name);
    }
  }
  return { ids, packages };
}

/**
 * @param {Record<string, unknown>} vuln
 * @param {string} name
 */
function isAllowlistedFinding(name, vuln) {
  const severity = String(vuln.severity ?? '').toLowerCase();
  if (severity !== 'high' && severity !== 'critical') return true;

  // Only the documented residual package set may be waived.
  if (!ALLOWED_VIA_PACKAGES.has(name)) return false;

  const { ids, packages } = collectVia(vuln.via);

  for (const id of ids) {
    if (!ALLOWED_ADVISORY_IDS.has(id.toUpperCase())) return false;
  }

  for (const pkg of packages) {
    if (!ALLOWED_VIA_PACKAGES.has(pkg)) return false;
  }

  return true;
}

function main() {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  // npm audit exits non-zero when vulns exist; still parse stdout.
  let report;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    process.stderr.write('audit-toolchain: failed to parse npm audit JSON\n');
    process.exit(1);
  }

  const vulns = /** @type {Record<string, Record<string, unknown>>} */ (
    report.vulnerabilities ?? {}
  );
  const blocked = [];

  for (const [name, vuln] of Object.entries(vulns)) {
    if (!isAllowlistedFinding(name, vuln)) {
      blocked.push({
        name,
        severity: vuln.severity,
        via: vuln.via,
      });
    }
  }

  if (blocked.length > 0) {
    process.stderr.write(
      'audit-toolchain: high/critical findings outside documented residual:\n'
    );
    process.stderr.write(JSON.stringify(blocked, null, 2) + '\n');
    process.exit(1);
  }

  const residual = Object.keys(vulns).filter((name) => {
    const sev = String(vulns[name]?.severity ?? '').toLowerCase();
    return sev === 'high' || sev === 'critical';
  });

  if (residual.length > 0) {
    process.stdout.write(
      `audit-toolchain: ok (documented residual only: ${residual.join(', ')})\n`
    );
  } else {
    process.stdout.write('audit-toolchain: ok (no high/critical)\n');
  }
  process.exit(0);
}

main();
