import { describe, expect, it } from 'vitest';
import { chunkText, MOCK_ANSWER, MOCK_NOTICE, MockTransport } from './mock-transport';
import { buildTutorRequest } from './system-prompt';
import type { TutorEvent } from './types';

const request = () => buildTutorRequest(null, [], 'Hej', 'claude-opus-5-5');

describe('MockTransport', () => {
  it('streams the recorded answer in chunks and ends with usage', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    const events: TutorEvent[] = [];
    const usage = await transport.ask(request(), (e) => events.push(e));
    const texts = events.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe(MOCK_ANSWER);
    expect(MOCK_ANSWER).toContain(MOCK_NOTICE);
    const done = events.at(-1);
    expect(done).toEqual({ type: 'done', usage, stopReason: 'end_turn' });
    expect(usage.model).toBe('claude-opus-5-5');
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(transport.requests).toHaveLength(1);
  });

  it('writes the cache on the first request and reads it on the next', async () => {
    const transport = new MockTransport({ delayMs: 0 });
    const first = await transport.ask(request(), () => {});
    const second = await transport.ask(request(), () => {});
    expect(first.cacheCreationInputTokens).toBeGreaterThan(1000);
    expect(first.cacheReadInputTokens).toBe(0);
    expect(second.cacheReadInputTokens).toBe(first.cacheCreationInputTokens);
    expect(second.cacheCreationInputTokens).toBe(0);
  });

  it('checks the key prefix like the Rust side and never keeps the key', async () => {
    const transport = new MockTransport({ delayMs: 0, hasKey: false });
    expect(await transport.hasKey()).toBe(false);
    await expect(transport.ask(request(), () => {})).rejects.toThrow(/nyckel/i);
    await expect(transport.setKey('fel-nyckel')).rejects.toThrow(/sk-ant-/);
    await transport.setKey('sk-ant-test-123');
    expect(await transport.hasKey()).toBe(true);
    expect(JSON.stringify(transport)).not.toContain('sk-ant-test-123');
    expect((await transport.testKey('claude-haiku-5-5')).ok).toBe(true);
    await transport.clearKey();
    expect(await transport.hasKey()).toBe(false);
    expect((await transport.testKey('claude-haiku-5-5')).ok).toBe(false);
  });

  it('can play a refusal', async () => {
    const transport = new MockTransport({ delayMs: 0, stopReason: 'refusal' });
    const events: TutorEvent[] = [];
    await transport.ask(request(), (e) => events.push(e));
    expect(events.filter((e) => e.type === 'text')).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'refusal' });
  });

  it('splits text without losing characters', () => {
    const text = 'Ett två tre\n\nfyra fem sex sju åtta nio tio';
    expect(chunkText(text, 5).join('')).toBe(text);
  });
});
