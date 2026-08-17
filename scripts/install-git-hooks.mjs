#!/usr/bin/env node
/**
 * Copy checked-in git hooks into `.git/hooks` (no `git config`).
 * Invoked from postinstall so clones get a CI-matching pre-push gate.
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveGitDir() {
  const marker = join(ROOT, '.git');
  if (!existsSync(marker)) return null;
  try {
    const st = readFileSync(marker, 'utf8');
    const m = st.match(/^gitdir:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    // `.git` is a directory
  }
  return marker;
}

function main() {
  const gitDir = resolveGitDir();
  if (!gitDir) return;

  const src = join(ROOT, '.githooks/pre-push');
  if (!existsSync(src)) {
    process.stderr.write('install-git-hooks: missing .githooks/pre-push\n');
    process.exit(1);
  }

  const hooksDir = join(gitDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const dest = join(hooksDir, 'pre-push');
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
}

main();
