/**
 * Minimal semver comparison for app versions ("0.2.0", "1.0.0-beta.1").
 * Returns a negative number if a < b, 0 if equal and a positive number if a > b.
 * Build metadata (+…) is ignored; a prerelease sorts before its release.
 */
export function compareVersions(a: string, b: string): number {
  const [coreA = '', preA] = stripBuild(a).split('-', 2) as [string, string | undefined];
  const [coreB = '', preB] = stripBuild(b).split('-', 2) as [string, string | undefined];
  const partsA = coreA.split('.').map(toNumber);
  const partsB = coreB.split('.').map(toNumber);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return comparePrerelease(preA, preB);
}

function stripBuild(version: string): string {
  return version.trim().replace(/^v/, '').split('+', 1)[0] ?? '';
}

function toNumber(part: string): number {
  const n = Number.parseInt(part, 10);
  return Number.isNaN(n) ? 0 : n;
}

function comparePrerelease(a: string, b: string): number {
  const idsA = a.split('.');
  const idsB = b.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const x = idsA[i];
    const y = idsB[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx - ny;
    } else if (nx !== null) {
      return -1;
    } else if (ny !== null) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
