import { describe, expect, it } from 'vitest';
import {
  costSek,
  costUsd,
  formatCostLine,
  formatSek,
  formatSekLimit,
  modelName,
  priceFor,
} from './pricing';
import type { TutorUsage } from './types';

const usage = (overrides: Partial<TutorUsage> = {}): TutorUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  model: 'claude-opus-5-5',
  ...overrides,
});

describe('cost of an answer', () => {
  it('prices Opus 5.5: 4 USD in, 20 out, 0.20 cache read, 5 cache write per MTok', () => {
    expect(costUsd(usage({ inputTokens: 1_000_000 }))).toBeCloseTo(4);
    expect(costUsd(usage({ outputTokens: 1_000_000 }))).toBeCloseTo(20);
    expect(costUsd(usage({ cacheReadInputTokens: 1_000_000 }))).toBeCloseTo(0.2);
    expect(costUsd(usage({ cacheCreationInputTokens: 1_000_000 }))).toBeCloseTo(5);
    // A typical follow-up: 3 000 tokens of system prompt from the cache, 1 500 new, 400 out.
    const typical = usage({ inputTokens: 1500, cacheReadInputTokens: 3000, outputTokens: 400 });
    expect(costUsd(typical)).toBeCloseTo((1500 * 4 + 3000 * 0.2 + 400 * 20) / 1e6, 10);
    expect(costSek(typical, 10.5)).toBeCloseTo(0.1533, 4);
  });

  it('prices Haiku 5.5: 0.10 in, 0.50 out, 0.01 cache read, 0.125 cache write per MTok', () => {
    const haiku = (o: Partial<TutorUsage>) => usage({ model: 'claude-haiku-5-5', ...o });
    expect(costUsd(haiku({ inputTokens: 1_000_000 }))).toBeCloseTo(0.1);
    expect(costUsd(haiku({ outputTokens: 1_000_000 }))).toBeCloseTo(0.5);
    expect(costUsd(haiku({ cacheReadInputTokens: 1_000_000 }))).toBeCloseTo(0.01);
    expect(costUsd(haiku({ cacheCreationInputTokens: 1_000_000 }))).toBeCloseTo(0.125);
    expect(costSek(haiku({ inputTokens: 2000, outputTokens: 1000 }), 10)).toBeCloseTo(0.007);
  });

  it('makes cache reads much cheaper than uncached input', () => {
    const cold = usage({ cacheCreationInputTokens: 3000, inputTokens: 500, outputTokens: 300 });
    const warm = usage({ cacheReadInputTokens: 3000, inputTokens: 500, outputTokens: 300 });
    expect(costUsd(warm)).toBeLessThan(costUsd(cold));
    expect(costUsd(usage({ cacheReadInputTokens: 3000 }))).toBeCloseTo(
      costUsd(usage({ inputTokens: 3000 })) / 20,
    );
  });

  it('recognises dated model ids and never underprices an unknown model', () => {
    expect(priceFor('claude-haiku-5-5-20261001').input).toBe(0.1);
    expect(priceFor('claude-something-else').input).toBe(4);
    expect(priceFor('claude-something-else', 'claude-haiku-5-5').input).toBe(0.1);
    expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5');
    expect(modelName('x-model')).toBe('x-model');
  });
});

describe('formatting', () => {
  const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

  it('shows kronor with two decimals and tiny amounts as under 1 öre', () => {
    expect(nbsp(formatSek(0.1533))).toBe('0,15 kr');
    expect(nbsp(formatSek(12.3))).toBe('12,30 kr');
    expect(nbsp(formatSek(0))).toBe('0,00 kr');
    expect(formatSek(0.001)).toBe('under 1 öre');
    expect(nbsp(formatSekLimit(20))).toBe('20 kr');
    expect(nbsp(formatSekLimit(12.5))).toBe('12,5 kr');
  });

  it('describes the latest answer with tokens and model', () => {
    const line = nbsp(
      formatCostLine({
        usage: usage({ inputTokens: 512, cacheReadInputTokens: 2900, outputTokens: 312 }),
        costSek: 0.14,
      }),
    );
    expect(line).toBe(
      'Senaste svaret: ca 0,14 kr · 3 412 tokens in, varav 2 900 från cache · 312 ut · Opus 5.5',
    );
  });
});
