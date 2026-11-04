/** Helpers shared by the SQLite and in-memory stores so both behave identically. */

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export const DEFAULT_RECENT_SESSIONS = 20;

/** Serialises a JSON payload the way the database stores it. Rejects `undefined`. */
export function toJson(value: unknown, what: string): string {
  if (value === undefined) throw new TypeError(`${what}: value must not be undefined.`);
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError(`${what}: value is not JSON-serialisable.`);
  return json;
}

export function fromJson(text: string | null): unknown {
  return text === null ? null : (JSON.parse(text) as unknown);
}

/** Normalises any accepted timestamp input to ISO 8601 UTC so text comparison sorts correctly. */
export function toIso(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid timestamp: ${String(value)}`);
  return date.toISOString();
}

export function optionalIso(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

export function assertLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`Invalid limit: ${limit}`);
  return limit;
}

/** Returns a deep copy through JSON, mirroring a round trip via the database. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Applies a partial update, ignoring keys whose value is `undefined` (null is kept). */
export function applyPatch<T extends object>(current: T, patch: Partial<T>): T {
  const next = { ...current };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) next[key] = value as T[keyof T];
  }
  return next;
}
