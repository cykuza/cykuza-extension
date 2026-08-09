#!/usr/bin/env node
/**
 * Print SHA-256 digests of WXT zip artifacts under `.output/`.
 *
 * Intended for release checklists after `npm run zip` / `npm run zip:firefox`.
 * Exit 0 when no zips are present (prints a short note). Exit 1 on I/O errors.
 *
 * Usage: node scripts/hash-artifacts.mjs
 *        npm run hash:artifacts
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUTPUT_DIR = join(ROOT, '.output');

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function main() {
  if (!existsSync(OUTPUT_DIR)) {
    console.log('No .output directory — nothing to hash.');
    return;
  }

  let entries;
  try {
    entries = readdirSync(OUTPUT_DIR);
  } catch (err) {
    console.error(`Failed to read .output: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const zips = [];
  for (const name of entries) {
    if (!name.endsWith('.zip')) continue;
    const full = join(OUTPUT_DIR, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch (err) {
      console.error(`Failed to stat ${name}: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    zips.push(full);
  }

  zips.sort((a, b) => a.localeCompare(b));

  if (zips.length === 0) {
    console.log('No .zip artifacts in .output — nothing to hash.');
    return;
  }

  for (const filePath of zips) {
    let digest;
    try {
      digest = sha256File(filePath);
    } catch (err) {
      console.error(
        `Failed to hash ${relative(ROOT, filePath)}: ${err instanceof Error ? err.message : err}`,
      );
      process.exit(1);
    }
    console.log(`${digest}  ${relative(ROOT, filePath)}`);
  }
}

main();
