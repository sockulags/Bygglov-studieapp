import type { TutorEvent, TutorKeyTestResult, TutorRequest, TutorUsage } from './types';
import type { TutorTransport } from './transport';

/** Shown in the panel whenever the mock is in use. */
export const MOCK_NOTICE = 'Testläge, inget AI-anrop görs';

/** The recorded answer the mock streams (Markdown, like a real answer). */
export const MOCK_ANSWER = `**${MOCK_NOTICE}.** Det här är ett inspelat svar som visar hur handledaren ser ut i webbläsarläget.

I den installerade appen svarar handledaren på riktigt, utifrån frågan eller ärendet du har framför dig. Ett svar brukar se ut ungefär så här:

- Lovplikten för en tillbyggnad följer av **9 kap. 9 § PBL**, och den bygglovsbefriade tillbyggnaden på högst 30 kvm finns i **9 kap. 10 §**.
- Inom 4,5 meter från tomtgränsen krävs ändå lov om inte grannen gett sitt skriftliga medgivande (**9 kap. 34–35 §§**).

Vad tror du själv: vilken uppgift i ansökan hade du kontrollerat först?`;

export interface MockTransportOptions {
  /** Delay between streamed chunks in ms (0 in tests). Default 25. */
  delayMs?: number;
  /** Whether a key counts as stored from the start. Default true, so the panel can be tried. */
  hasKey?: boolean;
  /** Override the recorded answer. */
  answer?: string;
  /** Stop reason in the final `done` event, e.g. "refusal" to try that path. */
  stopReason?: string;
}

const KEY_PREFIX = 'sk-ant-';

/** Rough token estimate (about four characters per token) for the mock's usage figures. */
function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

function wait(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/** Splits text into small chunks at word boundaries, like a stream of deltas. */
export function chunkText(text: string, size = 12): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  let chunk = '';
  for (const word of words) {
    chunk += word;
    if (chunk.length >= size) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  if (chunk !== '') chunks.push(chunk);
  return chunks;
}

/**
 * Browser-mode transport: never calls an AI and never stores a key (only whether one was
 * "saved"). Streams `MOCK_ANSWER` with usage figures estimated from the prompt, priced like
 * the requested model, so the cost line and the daily cap behave as in the app.
 */
export class MockTransport implements TutorTransport {
  readonly kind = 'mock' as const;
  private keyStored: boolean;
  private readonly delayMs: number;
  private readonly answer: string;
  private readonly stopReason: string;
  /** Requests received, newest last (tests inspect what would have been sent). */
  readonly requests: TutorRequest[] = [];
  private asks = 0;

  constructor(options: MockTransportOptions = {}) {
    this.keyStored = options.hasKey ?? true;
    this.delayMs = options.delayMs ?? 25;
    this.answer = options.answer ?? MOCK_ANSWER;
    this.stopReason = options.stopReason ?? 'end_turn';
  }

  async hasKey(): Promise<boolean> {
    return this.keyStored;
  }

  async setKey(key: string): Promise<void> {
    if (!key.trim().startsWith(KEY_PREFIX)) {
      throw new Error(
        `Nyckeln ska börja med "${KEY_PREFIX}". Kopiera hela nyckeln från Anthropic Console.`,
      );
    }
    this.keyStored = true;
  }

  async clearKey(): Promise<void> {
    this.keyStored = false;
  }

  async testKey(model: string): Promise<TutorKeyTestResult> {
    await wait(this.delayMs);
    return this.keyStored
      ? {
          ok: true,
          model,
          message: `${MOCK_NOTICE}. Nyckeln testas bara i den installerade appen.`,
        }
      : { ok: false, model, message: 'Ingen nyckel är sparad.' };
  }

  async ask(request: TutorRequest, onEvent: (event: TutorEvent) => void): Promise<TutorUsage> {
    if (!this.keyStored) throw new Error('Ingen API-nyckel är sparad.');
    this.requests.push(request);
    this.asks += 1;
    const cached = request.system.filter((b) => b.cache);
    const cachedChars = cached.reduce((sum, b) => sum + b.text.length, 0);
    const uncachedChars =
      request.system.filter((b) => !b.cache).reduce((sum, b) => sum + b.text.length, 0) +
      request.messages.reduce((sum, m) => sum + m.content.length, 0);

    const text = this.stopReason === 'refusal' ? '' : this.answer;
    for (const chunk of chunkText(text)) {
      await wait(this.delayMs);
      onEvent({ type: 'text', text: chunk });
    }
    // The first request writes the cache, later ones read it, as with the real API.
    const cachedTokens = cachedChars === 0 ? 0 : estimateTokens(cachedChars);
    const usage: TutorUsage = {
      inputTokens: estimateTokens(uncachedChars),
      outputTokens: estimateTokens(text.length),
      cacheReadInputTokens: this.asks > 1 ? cachedTokens : 0,
      cacheCreationInputTokens: this.asks > 1 ? 0 : cachedTokens,
      model: request.model,
    };
    onEvent({ type: 'done', usage, stopReason: this.stopReason });
    return usage;
  }
}
