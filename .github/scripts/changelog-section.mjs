#!/usr/bin/env node
// Prints the body of one version's section in CHANGELOG.md (Keep a Changelog format),
// used as the GitHub Release body by release.yml.
//
// Usage: node .github/scripts/changelog-section.mjs 0.2.0 [path/to/CHANGELOG.md]
// Exits 1 if the section is missing or empty, so a release cannot ship without notes.

/* global process, console */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
const file =
  process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md');

if (!version) {
  console.error('Ange en version, t.ex. 0.2.0');
  process.exit(1);
}

const lines = readFileSync(file, 'utf8').split(/\r?\n/);
// Matches "## [0.2.0] - 2026-11-20" and "## 0.2.0".
const heading = /^##\s+\[?([^\]\s]+)\]?/;

const start = lines.findIndex((line) => heading.exec(line)?.[1] === version);
if (start === -1) {
  console.error(
    `Hittade ingen sektion för ${version} i ${file}. Flytta "Oförsläppt" till en ny versionssektion.`,
  );
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  // The next version section or the link reference block ends this section.
  if (/^##\s/.test(lines[i]) || /^\[[^\]]+\]:\s/.test(lines[i])) {
    end = i;
    break;
  }
}

const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
if (!body) {
  console.error(`Sektionen för ${version} i ${file} är tom.`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);
