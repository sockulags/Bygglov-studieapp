import { describe, expect, it, vi } from 'vitest';
import type { TutorEvent, TutorRequest, TutorUsage } from './tauri';

const usage: TutorUsage = {
  inputTokens: 10,
  outputTokens: 2,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  model: 'claude-opus-5-5',
};

// The command resolves before the channel has delivered its last events, as can happen
// in the webview: the response and the channel messages travel separately.
vi.mock('@tauri-apps/api/core', () => {
  class Channel<T> {
    onmessage: (event: T) => void = () => {};
  }
  return {
    Channel,
    invoke: vi.fn((_command: string, args: { onEvent: Channel<TutorEvent> }) => {
      setTimeout(() => {
        args.onEvent.onmessage({ type: 'text', text: 'Hej' });
        args.onEvent.onmessage({ type: 'done', usage, stopReason: 'refusal' });
      }, 20);
      return Promise.resolve(usage);
    }),
  };
});

const request: TutorRequest = {
  model: 'claude-opus-5-5',
  maxTokens: 100,
  effort: 'medium',
  system: [],
  messages: [{ role: 'user', content: 'Fråga' }],
};

describe('tutorAsk', () => {
  it('resolves only after the final channel event has been delivered', async () => {
    const { tutorAsk } = await import('./tauri');
    const events: TutorEvent[] = [];
    const result = await tutorAsk(request, (event) => events.push(event));
    expect(result).toEqual(usage);
    expect(events.map((event) => event.type)).toEqual(['text', 'done']);
  });
});
