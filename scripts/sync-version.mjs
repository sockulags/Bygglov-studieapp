#!/usr/bin/env node
// Copies the version from the root package.json (the single source of truth, docs/06)
// to apps/desktop/package.json, tauri.conf.json, Cargo.toml and Cargo.lock.
//
// Usage:
//   node scripts/sync-version.mjs          write the root version everywhere
//   node scripts/sync-version.mjs --check  exit 1 if any file differs (for CI)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CRATE_NAME = 'bygglov-studieapp';

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = rootPkg.version;
if (typeof version !== 'string' || !SEMVER.test(version)) {
  console.error(`Ogiltig version i package.json: ${JSON.stringify(version)}`);
  process.exit(1);
}

/**
 * Replace the top-level "version" of a JSON file. Done as a text replacement so the
 * file keeps its formatting (prettier style), then verified by parsing the result.
 */
function syncJson(file) {
  const text = readFileSync(file, 'utf8');
  const before = JSON.parse(text).version;
  const match = /^( {2}"version":\s*")([^"]*)(")/m.exec(text);
  if (!match) throw new Error(`Hittade ingen toppnivå-"version" i ${file}`);
  const next = text.replace(match[0], `${match[1]}${version}${match[3]}`);
  if (JSON.parse(next).version !== version) {
    throw new Error(`Kunde inte sätta versionen i ${file}`);
  }
  return { before, next, changed: before !== version };
}

/** Replace `version = "…"` inside the [package] table of Cargo.toml. */
function syncCargoToml(file) {
  const text = readFileSync(file, 'utf8');
  // \r?\n: the Windows runner checks files out with CRLF unless .gitattributes says otherwise.
  const match = /(\[package\][^[]*?\r?\nversion\s*=\s*")([^"]+)(")/.exec(text);
  if (!match) throw new Error(`Hittade ingen version under [package] i ${file}`);
  const before = match[2];
  const next = text.replace(match[0], `${match[1]}${version}${match[3]}`);
  return { before, next, changed: before !== version };
}

/** Replace the version of our own crate in Cargo.lock so `cargo build --locked` keeps working. */
function syncCargoLock(file) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(
    `(\\[\\[package\\]\\]\\r?\\nname = "${CRATE_NAME}"\\r?\\nversion = ")([^"]+)(")`,
  );
  const match = pattern.exec(text);
  if (!match) throw new Error(`Hittade inte paketet ${CRATE_NAME} i ${file}`);
  const before = match[2];
  const next = text.replace(match[0], `${match[1]}${version}${match[3]}`);
  return { before, next, changed: before !== version };
}

const targets = [
  { file: join(root, 'apps/desktop/package.json'), sync: syncJson },
  { file: join(root, 'apps/desktop/src-tauri/tauri.conf.json'), sync: syncJson },
  { file: join(root, 'apps/desktop/src-tauri/Cargo.toml'), sync: syncCargoToml },
  { file: join(root, 'apps/desktop/src-tauri/Cargo.lock'), sync: syncCargoLock, optional: true },
];

let mismatches = 0;
for (const { file, sync, optional } of targets) {
  const name = relative(root, file);
  if (!existsSync(file)) {
    if (optional) continue;
    console.error(`Saknas: ${name}`);
    process.exit(1);
  }
  const { before, next, changed } = sync(file);
  if (!changed) {
    console.log(`  ok      ${name} (${version})`);
    continue;
  }
  mismatches += 1;
  if (checkOnly) {
    console.error(`  avviker ${name}: ${before} (ska vara ${version})`);
  } else {
    writeFileSync(file, next);
    console.log(`  uppdaterad ${name}: ${before} -> ${version}`);
  }
}

if (checkOnly && mismatches > 0) {
  console.error(`\n${mismatches} fil(er) har inte version ${version}. Kör "pnpm version:sync".`);
  process.exit(1);
}
