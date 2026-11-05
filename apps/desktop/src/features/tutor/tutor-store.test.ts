import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDataStore, type DataStore } from '@/data';
import { buildQuestionContext } from './context';
import { MockTransport } from './mock-transport';
import { costSek } from './pricing';
import { TUTOR_SETTING_KEYS } from './settings';
import { multipleChoice } from './test-question';
import type { TutorTransport } from './transport';
import {
  askTutor,
  cancelTutor,
  historyOf,
  NO_KEY_MESSAGE,
  resetConversation,
  resetTutorStore,
  useTutorStore,
} from './tutor-store';
import type { TutorEvent, TutorRequest, TutorUsage } from './types';
import { dailyCapStatus, startOfLocalDay, startOfNextLocalDay } from './usage';

const NOW = new Date(2026, 10, 5, 14, 30);
const context = buildQuestionContext(multipleChoice, { type: 'flerval', selected: 0 });
const conversation = () => useTutorStore.getState().conversations[context.key];

let store: DataStore;

beforeEach(() => {
  store = createMemoryDataStore(() => NOW);
  resetTutorStore();
});
afterEach(() => resetTutorStore());

describe('daily cost cap', () => {
  it('is reached when today has cost at least the cap', () => {
    expect(dailyCapStatus(19.99, 20)).toMatchObject({ reached: false });
    expect(dailyCapStatus(19.99, 20).remainingSek).toBeCloseTo(0.01);
    expect(dailyCapStatus(20, 20)).toMatchObject({ reached: true, remainingSek: 0 });
    expect(dailyCapStatus(0, 0).reached).toBe(true);
  });

  it('uses the local day', () => {
    expect(startOfLocalDay(NOW)).toEqual(new Date(2026, 10, 5));
    expect(startOfNextLocalDay(NOW)).toEqual(new Date(2026, 10, 6));
  });

  it('refuses new questions when today has reached the cap, counting only today', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    await store.settings.set(TUTOR_SETTING_KEYS.dailyCapSek, 5);
    const yesterday = new Date(2026, 10, 4, 12).toISOString();
    await store.aiUsage.recordUsage({
      model: 'claude-opus-5-5',
      inputTokens: 1,
      outputTokens: 1,
      costSek: 100,
      contextKind: 'case',
      ts: yesterday,
    });
    expect(await askTutor(context, 'Hej', { transport, store, now: () => NOW })).toBe('answered');

    await store.aiUsage.recordUsage({
      model: 'claude-opus-5-5',
      inputTokens: 1,
      outputTokens: 1,
      costSek: 5,
      contextKind: 'case',
      ts: NOW.toISOString(),
    });
    expect(await askTutor(context, 'Igen', { transport, store, now: () => NOW })).toBe('cap');
    expect(transport.requests).toHaveLength(1);
    expect(conversation()?.notice?.kind).toBe('cap');
    expect(conversation()?.notice?.text).toMatch(/kostnadstak på 5\skr är nått/);
    expect(conversation()?.busy).toBe(false);
  });
});

describe('askTutor', () => {
  it('streams the answer, records usage and cost, and sends the history next time', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    await store.settings.set(TUTOR_SETTING_KEYS.sekPerUsd, 11);
    expect(
      await askTutor(context, '  Förklara djupare ', { transport, store, now: () => NOW }),
    ).toBe('answered');
    const c = conversation();
    expect(c?.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'done'],
      ['assistant', 'done'],
    ]);
    expect(c?.messages[0]?.text).toBe('Förklara djupare');
    expect(c?.messages[1]?.text).toContain('Testläge');
    expect(c?.lastCost?.costSek).toBeCloseTo(costSek(c!.lastCost!.usage, 11));

    const rows = await store.aiUsage.listUsage();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'claude-opus-5-5',
      contextKind: 'question',
      ts: NOW.toISOString(),
    });
    expect(rows[0]?.costSek).toBeCloseTo(c!.lastCost!.costSek);

    await askTutor(context, 'Och sedan?', { transport, store, now: () => NOW });
    const second = transport.requests[1];
    expect(second?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second?.messages[2]?.content).toBe('Och sedan?');
    expect(second?.system[2]?.text).toContain('lov-042');
    expect(await store.aiUsage.totals()).toMatchObject({ requests: 2 });
  });

  it('shows the refusal message path and leaves refused answers out of the history', async () => {
    const transport = new MockTransport({ delayMs: 0, stopReason: 'refusal' });
    expect(await askTutor(context, 'Något', { transport, store })).toBe('answered');
    expect(conversation()?.messages[1]).toMatchObject({ status: 'refused', text: '' });
    expect(historyOf(conversation()!)).toEqual([]);
  });

  it('asks for a key when none is stored', async () => {
    const transport = new MockTransport({ delayMs: 0, hasKey: false });
    expect(await askTutor(context, 'Hej', { transport, store })).toBe('no-key');
    expect(conversation()?.notice).toEqual({ kind: 'no-key', text: NO_KEY_MESSAGE });
    expect(conversation()?.messages).toEqual([]);
  });

  it('marks a failed request with the error from the app', async () => {
    const failing = {
      kind: 'tauri',
      hasKey: async () => true,
      setKey: async () => {},
      clearKey: async () => {},
      testKey: async (model: string) => ({ ok: true, model, message: '' }),
      ask: async (_req: TutorRequest, onEvent: (e: TutorEvent) => void): Promise<TutorUsage> => {
        onEvent({ type: 'text', text: 'Början' });
        onEvent({ type: 'error', message: 'Anthropic svarade 529: överbelastad.' });
        throw new Error('Anthropic svarade 529: överbelastad.');
      },
    } satisfies TutorTransport;
    expect(await askTutor(context, 'Hej', { transport: failing, store })).toBe('error');
    expect(conversation()?.messages[1]).toMatchObject({
      status: 'error',
      text: 'Början',
      error: 'Anthropic svarade 529: överbelastad.',
    });
    expect(conversation()?.busy).toBe(false);
    expect(await store.aiUsage.listUsage()).toEqual([]);
  });

  it('cancels: the partial text stays, the usage is still recorded when the stream ends', async () => {
    let finish: (usage: TutorUsage) => void = () => {};
    let emit: (e: TutorEvent) => void = () => {};
    const slow = {
      kind: 'tauri',
      hasKey: async () => true,
      setKey: async () => {},
      clearKey: async () => {},
      testKey: async (model: string) => ({ ok: true, model, message: '' }),
      ask: (_req: TutorRequest, onEvent: (e: TutorEvent) => void) =>
        new Promise<TutorUsage>((resolve) => {
          emit = onEvent;
          finish = resolve;
        }),
    } satisfies TutorTransport;

    const pending = askTutor(context, 'Hej', { transport: slow, store });
    await new Promise((r) => setTimeout(r, 0));
    emit({ type: 'text', text: 'Halva ' });
    expect(conversation()?.busy).toBe(true);
    cancelTutor(context.key);
    emit({ type: 'text', text: 'svaret' });
    expect(conversation()?.busy).toBe(false);
    expect(conversation()?.messages[1]).toMatchObject({ status: 'aborted', text: 'Halva ' });

    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      model: 'claude-opus-5-5',
    };
    finish(usage);
    expect(await pending).toBe('cancelled');
    expect(await store.aiUsage.listUsage()).toHaveLength(1);
    expect(conversation()?.messages[1]?.cost?.usage).toEqual(usage);
  });

  it('starts a new conversation', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    await askTutor(context, 'Hej', { transport, store });
    resetConversation(context.key);
    expect(conversation()?.messages).toEqual([]);
    expect(conversation()?.lastCost).toBeNull();
  });

  it('ignores empty questions', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    expect(await askTutor(context, '   ', { transport, store })).toBe('empty');
    expect(transport.requests).toEqual([]);
  });
});
