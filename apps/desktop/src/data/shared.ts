/** Helpers shared by the SQLite and in-memory stores so both behave identically. */

import type { AiContextKind, AiUsageRange, NewAiUsage } from './types';

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
export function applyPatch<T extends object>(current: T, patch: Partial<NoInfer<T>>): T {
  const next = { ...current };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) next[key] = value as T[keyof T];
  }
  return next;
}

const AI_CONTEXT_KINDS: readonly AiContextKind[] = ['question', 'case', 'decision', 'general'];

function tokenCount(value: number | undefined, what: string): number {
  const n = value ?? 0;
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${what}: invalid token count ${n}`);
  return n;
}

/** Validated values of a usage row, with defaults applied (both stores use this). */
export function normalizeNewAiUsage(input: NewAiUsage, now: () => string) {
  if (!Number.isFinite(input.costSek) || input.costSek < 0) {
    throw new RangeError(`ai usage: invalid cost ${input.costSek}`);
  }
  if (!AI_CONTEXT_KINDS.includes(input.contextKind)) {
    throw new RangeError(`ai usage: unknown context kind ${String(input.contextKind)}`);
  }
  if (input.model.trim() === '') throw new RangeError('ai usage: model must not be empty');
  return {
    ts: input.ts === undefined ? now() : toIso(input.ts),
    model: input.model,
    inputTokens: tokenCount(input.inputTokens, 'inputTokens'),
    outputTokens: tokenCount(input.outputTokens, 'outputTokens'),
    cacheReadTokens: tokenCount(input.cacheReadTokens, 'cacheReadTokens'),
    cacheWriteTokens: tokenCount(input.cacheWriteTokens, 'cacheWriteTokens'),
    costSek: input.costSek,
    contextKind: input.contextKind,
  };
}

/** The range bounds as ISO strings (null when unbounded). */
export function usageRangeBounds(range: AiUsageRange | undefined): {
  from: string | null;
  to: string | null;
} {
  return {
    from: range?.from === undefined ? null : toIso(range.from),
    to: range?.to === undefined ? null : toIso(range.to),
  };
}
