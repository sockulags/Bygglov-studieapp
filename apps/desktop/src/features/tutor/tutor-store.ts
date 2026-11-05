import { create } from 'zustand';
import { queryClient } from '@/app/query-client';
import { getDataStore, type DataStore } from '@/data';
import { costSek } from './pricing';
import { loadTutorSettings } from './settings';
import { buildTutorRequest } from './system-prompt';
import { getTutorTransport, type TutorTransport } from './transport';
import type { TutorContext, TutorMessage, TutorUsage } from './types';
import { capReachedMessage, dailyCapStatus, spentToday, usageKeys } from './usage';

/**
 * Chat state of the tutor, one conversation per context key (a question, a case, a case's
 * comparison view). Conversations live as long as the app is open; nothing of the chat is
 * written to disk, only the usage and cost of each answer (ai_usage).
 */

/** Shown instead of an empty answer when the API's safety filter declined to answer. */
export const REFUSAL_MESSAGE = 'Handledaren kan inte svara på just det här.';
export const NO_KEY_MESSAGE =
  'Ingen API-nyckel är sparad. Lägg in nyckeln under Inställningar → Studiehjälp.';
export const MAX_TOKENS_NOTE =
  'Svaret blev för långt och klipptes av. Be om en kortare förklaring.';

export type ChatMessageStatus = 'streaming' | 'done' | 'aborted' | 'refused' | 'error';

/** The cost of one answer, computed when the stream ended. */
export interface AnswerCost {
  usage: TutorUsage;
  costSek: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: ChatMessageStatus;
  /** Swedish error text for status "error". */
  error?: string;
  /** Set on assistant messages once the stream ended. */
  cost?: AnswerCost;
  /** The answer was cut at max_tokens. */
  truncated?: boolean;
}

export interface Conversation {
  messages: ChatMessage[];
  /** True while an answer is streaming. */
  busy: boolean;
  /** A message that blocks asking: the daily cap, a missing key. */
  notice: { kind: 'cap' | 'no-key'; text: string } | null;
  /** Cost of the latest answer that has ended. */
  lastCost: AnswerCost | null;
}

interface TutorStoreState {
  conversations: Record<string, Conversation>;
}

export const EMPTY_CONVERSATION: Conversation = Object.freeze({
  messages: [],
  busy: false,
  notice: null,
  lastCost: null,
}) as Conversation;

export const useTutorStore = create<TutorStoreState>()(() => ({ conversations: {} }));

/** The conversation for a context key (stable empty object when none exists). */
export function useConversation(key: string): Conversation {
  return useTutorStore((s) => s.conversations[key] ?? EMPTY_CONVERSATION);
}

function update(key: string, change: (c: Conversation) => Conversation): void {
  useTutorStore.setState((s) => ({
    conversations: {
      ...s.conversations,
      [key]: change(s.conversations[key] ?? EMPTY_CONVERSATION),
    },
  }));
}

function updateMessage(key: string, id: string, change: (m: ChatMessage) => ChatMessage): void {
  update(key, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? change(m) : m)) }));
}

let nextId = 0;
const newId = () => `m${++nextId}`;

/** Requests that are still streaming, by assistant message id. Cancelled ones stop updating. */
const live = new Map<string, { key: string; cancelled: boolean }>();

/** The API messages of the conversation so far: finished answers with their questions. */
export function historyOf(conversation: Conversation): TutorMessage[] {
  const history: TutorMessage[] = [];
  const { messages } = conversation;
  for (let i = 0; i + 1 < messages.length; i++) {
    const question = messages[i];
    const answer = messages[i + 1];
    if (question?.role !== 'user' || answer?.role !== 'assistant') continue;
    const usable =
      (answer.status === 'done' || answer.status === 'aborted') && answer.text.trim() !== '';
    if (!usable) continue;
    history.push(
      { role: 'user', content: question.text },
      { role: 'assistant', content: answer.text },
    );
    i += 1;
  }
  return history;
}

export interface AskDependencies {
  transport?: TutorTransport;
  store?: DataStore;
  now?: () => Date;
}

export type AskResult = 'answered' | 'cap' | 'no-key' | 'busy' | 'empty' | 'error' | 'cancelled';

/**
 * Sends a question in the conversation of `context`. Checks the daily cap and the key first,
 * streams the answer into the store and records the usage (also for a cancelled answer,
 * which the API still bills).
 */
export async function askTutor(
  context: TutorContext,
  question: string,
  deps: AskDependencies = {},
): Promise<AskResult> {
  const key = context.key;
  const text = question.trim();
  if (text === '') return 'empty';
  const before = useTutorStore.getState().conversations[key] ?? EMPTY_CONVERSATION;
  if (before.busy) return 'busy';

  const transport = deps.transport ?? getTutorTransport();
  const now = deps.now ?? (() => new Date());
  update(key, (c) => ({ ...c, busy: true, notice: null }));

  let store: DataStore;
  let settings: Awaited<ReturnType<typeof loadTutorSettings>>;
  try {
    store = deps.store ?? (await getDataStore());
    settings = await loadTutorSettings(store);
    const cap = dailyCapStatus(await spentToday(store, now()), settings.dailyCapSek);
    if (cap.reached) {
      update(key, (c) => ({
        ...c,
        busy: false,
        notice: { kind: 'cap', text: capReachedMessage(cap.capSek) },
      }));
      return 'cap';
    }
    if (!(await transport.hasKey())) {
      update(key, (c) => ({ ...c, busy: false, notice: { kind: 'no-key', text: NO_KEY_MESSAGE } }));
      return 'no-key';
    }
  } catch (error: unknown) {
    update(key, (c) => ({ ...c, busy: false }));
    console.error('Handledaren kunde inte starta', error);
    return 'error';
  }

  const request = buildTutorRequest(context, historyOf(before), text, settings.model);
  const userId = newId();
  const answerId = newId();
  update(key, (c) => ({
    ...c,
    messages: [
      ...c.messages,
      { id: userId, role: 'user', text, status: 'done' },
      { id: answerId, role: 'assistant', text: '', status: 'streaming' },
    ],
  }));
  const handle = { key, cancelled: false };
  live.set(answerId, handle);

  let finalStatus: ChatMessageStatus = 'done';
  let stopReason: string | null = null;
  let streamError: string | null = null;
  try {
    const usage = await transport.ask(request, (event) => {
      if (event.type === 'done') {
        stopReason = event.stopReason;
        return;
      }
      if (event.type === 'error') {
        streamError = event.message;
        return;
      }
      if (!handle.cancelled)
        updateMessage(key, answerId, (m) => ({ ...m, text: m.text + event.text }));
    });
    const cost: AnswerCost = { usage, costSek: costSek(usage, settings.sekPerUsd, settings.model) };
    await recordUsage(store, cost, context, now());
    if (streamError !== null) finalStatus = 'error';
    else if (stopReason === 'refusal') finalStatus = 'refused';
    if (handle.cancelled) {
      updateMessage(key, answerId, (m) => ({ ...m, cost }));
      update(key, (c) => ({ ...c, lastCost: cost }));
      return 'cancelled';
    }
    updateMessage(key, answerId, (m) => ({
      ...m,
      status: finalStatus,
      cost,
      ...(streamError !== null ? { error: streamError } : {}),
      ...(stopReason === 'max_tokens' ? { truncated: true } : {}),
    }));
    update(key, (c) => ({ ...c, busy: false, lastCost: cost }));
    return finalStatus === 'error' ? 'error' : 'answered';
  } catch (error: unknown) {
    if (handle.cancelled) return 'cancelled';
    const message = error instanceof Error ? error.message : String(error);
    updateMessage(key, answerId, (m) => ({ ...m, status: 'error', error: streamError ?? message }));
    update(key, (c) => ({ ...c, busy: false }));
    return 'error';
  } finally {
    live.delete(answerId);
  }
}

async function recordUsage(store: DataStore, cost: AnswerCost, context: TutorContext, at: Date) {
  try {
    await store.aiUsage.recordUsage({
      model: cost.usage.model,
      inputTokens: cost.usage.inputTokens,
      outputTokens: cost.usage.outputTokens,
      cacheReadTokens: cost.usage.cacheReadInputTokens,
      cacheWriteTokens: cost.usage.cacheCreationInputTokens,
      costSek: cost.costSek,
      contextKind: context.kind,
      ts: at.toISOString(),
    });
    await queryClient.invalidateQueries({ queryKey: usageKeys.all() });
  } catch (error: unknown) {
    // The answer is still shown; only the statistics miss it.
    console.error('Kunde inte spara förbrukningen', error);
  }
}

/**
 * Stops showing the answer that is streaming in a conversation. The IPC contract has no
 * cancel command, so the request runs to its end on the Rust side; its usage is still
 * recorded when it finishes. The partial text stays, marked as cancelled.
 */
export function cancelTutor(key: string): void {
  for (const [answerId, handle] of live) {
    if (handle.key !== key || handle.cancelled) continue;
    handle.cancelled = true;
    updateMessage(key, answerId, (m) => ({ ...m, status: 'aborted' }));
  }
  update(key, (c) => ({ ...c, busy: false }));
}

/** "Ny konversation": cancels a streaming answer and empties the conversation. */
export function resetConversation(key: string): void {
  cancelTutor(key);
  update(key, () => EMPTY_CONVERSATION);
}

/** Removes a blocking notice, e.g. after the key was saved. */
export function clearNotice(key: string): void {
  update(key, (c) => (c.notice === null ? c : { ...c, notice: null }));
}

/** Test helper: forgets every conversation. */
export function resetTutorStore(): void {
  for (const handle of live.values()) handle.cancelled = true;
  live.clear();
  useTutorStore.setState({ conversations: {} });
}
