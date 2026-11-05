import type { TutorUsage } from './types';

/**
 * Models the tutor can use and their list prices (USD per million tokens). The cost of an
 * answer is computed from the usage the API reports: uncached input, output (thinking
 * included), cache reads and cache writes are billed separately.
 */

export const TUTOR_MODELS = ['claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type TutorModelId = (typeof TUTOR_MODELS)[number];

export const DEFAULT_TUTOR_MODEL: TutorModelId = 'claude-opus-5-5';

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface TutorModelInfo {
  id: TutorModelId;
  /** Name shown in Inställningar. */
  name: string;
  /** One-word description shown next to the name. */
  tagline: string;
  description: string;
  /** USD per million tokens. */
  price: ModelPrice;
}

export const TUTOR_MODEL_INFO: Record<TutorModelId, TutorModelInfo> = {
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    tagline: 'bäst',
    description: 'Resonerar bäst kring lagrum, motiveringar och bedömningar.',
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  'claude-haiku-5-5': {
    id: 'claude-haiku-5-5',
    name: 'Haiku 5.5',
    tagline: 'snabb och billig',
    description: 'Räcker för korta förklaringar. Ungefär en fyrtiondel av kostnaden.',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
};

export function isTutorModel(value: string): value is TutorModelId {
  return (TUTOR_MODELS as readonly string[]).includes(value);
}

/**
 * Price for the model the API reports. The API may answer with a longer id (a dated
 * snapshot); unknown models are priced as the requested one, or as Opus when unknown, so
 * the cost is never underestimated.
 */
export function priceFor(model: string, fallback: TutorModelId = DEFAULT_TUTOR_MODEL): ModelPrice {
  const known = TUTOR_MODELS.find((id) => model === id || model.startsWith(`${id}-`));
  return TUTOR_MODEL_INFO[known ?? fallback].price;
}

/** Cost of one answer in USD. */
export function costUsd(usage: TutorUsage, fallback?: TutorModelId): number {
  const p = priceFor(usage.model, fallback);
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadInputTokens * p.cacheRead +
      usage.cacheCreationInputTokens * p.cacheWrite) /
    1_000_000
  );
}

export const DEFAULT_SEK_PER_USD = 10.5;

/** Cost of one answer in SEK at `sekPerUsd`. */
export function costSek(usage: TutorUsage, sekPerUsd: number, fallback?: TutorModelId): number {
  return costUsd(usage, fallback) * sekPerUsd;
}

const kronor = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeKronor = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('sv-SE');

/** "0,14 kr", "12,30 kr", "under 1 öre". */
export function formatSek(value: number): string {
  if (value > 0 && value < 0.005) return 'under 1 öre';
  return `${kronor.format(value)} kr`;
}

/** "20 kr", "12,5 kr": for limits she typed herself. */
export function formatSekLimit(value: number): string {
  return `${wholeKronor.format(value)} kr`;
}

/** "12 345". */
export function formatTokens(value: number): string {
  return integer.format(value);
}

/** All input tokens of a request: uncached, read from cache and written to cache. */
export function totalInputTokens(usage: TutorUsage): number {
  return usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
}

/** "Opus 5.5" for a model id the API reports; the id itself when unknown. */
export function modelName(model: string): string {
  const id = TUTOR_MODELS.find((m) => model === m || model.startsWith(`${m}-`));
  return id ? TUTOR_MODEL_INFO[id].name : model;
}

/** "Senaste svaret: ca 0,14 kr · 3 412 tokens in, varav 2 900 från cache · 312 ut · Opus 5.5". */
export function formatCostLine(cost: { usage: TutorUsage; costSek: number }): string {
  const { usage } = cost;
  const cached = usage.cacheReadInputTokens;
  return [
    `Senaste svaret: ca ${formatSek(cost.costSek)}`,
    `${formatTokens(totalInputTokens(usage))} tokens in${
      cached > 0 ? `, varav ${formatTokens(cached)} från cache` : ''
    }`,
    `${formatTokens(usage.outputTokens)} ut`,
    modelName(usage.model),
  ].join(' · ');
}
