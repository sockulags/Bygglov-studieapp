/**
 * Deterministic pseudo-random numbers so a session can be recreated (and tested) from its
 * seed. Not for anything security related.
 */

export type Seed = number | string;

/** FNV-1a hash of a string to a 32-bit unsigned integer. */
export function hashSeed(seed: Seed): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: returns a function yielding floats in [0, 1). */
export function createRandom(seed: Seed): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/** A seed for callers that do not need reproducibility. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
