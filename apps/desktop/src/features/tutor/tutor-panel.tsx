import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from '@tanstack/react-router';
import {
  ArrowUp,
  Check,
  CircleAlert,
  CircleStop,
  Copy,
  FlaskConical,
  GraduationCap,
  KeyRound,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { DialogOverlay } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { useHasTutorKey } from './keys';
import { MOCK_NOTICE } from './mock-transport';
import { formatCostLine, formatSek, formatSekLimit } from './pricing';
import { useDailyCapSek } from './settings';
import { getTutorTransport } from './transport';
import {
  askTutor,
  cancelTutor,
  clearNotice,
  MAX_TOKENS_NOTE,
  REFUSAL_MESSAGE,
  resetConversation,
  useConversation,
  type ChatMessage,
} from './tutor-store';
import { TutorMarkdown } from './tutor-markdown';
import type { TutorContext } from './types';
import { capReachedMessage, dailyCapStatus, useUsageSummary } from './usage';
import './tutor.css';

export interface TutorPanelProps {
  context: TutorContext;
  /** Ready-made questions shown as buttons, e.g. `QUESTION_SUGGESTIONS`. */
  suggestions: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Copies text, with a fallback for webviews without the async clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted"
      onClick={() => void copyText(text).then(setCopied)}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Kopierat' : 'Kopiera svar'}
    </Button>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const streaming = message.status === 'streaming';
  const empty = message.text.trim() === '';
  return (
    <div className="flex flex-col gap-1">
      <div className="rounded-lg border border-line bg-paper px-4 py-3">
        {empty && streaming && (
          <p className="text-sm text-muted">
            Handledaren tänker
            <span className="tutor-caret" aria-hidden="true" />
          </p>
        )}
        {!empty && <TutorMarkdown>{message.text}</TutorMarkdown>}
        {streaming && !empty && <span className="tutor-caret" aria-hidden="true" />}
        {message.status === 'refused' && (
          <p className={cn('text-sm text-muted', !empty && 'mt-2')}>{REFUSAL_MESSAGE}</p>
        )}
        {message.status === 'aborted' && (
          <p className={cn('text-sm text-muted', !empty && 'mt-2')}>Avbrutet.</p>
        )}
        {message.status === 'error' && (
          <p className={cn('flex items-start gap-1.5 text-sm text-brick', !empty && 'mt-2')}>
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Det gick inte att få ett svar. {message.error ?? ''} Försök igen om en stund.
            </span>
          </p>
        )}
        {message.truncated && <p className="mt-2 text-sm text-muted">{MAX_TOKENS_NOTE}</p>}
      </div>
      {!streaming && !empty && <CopyButton text={message.text} />}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-8 self-end rounded-lg bg-accent-soft px-4 py-2.5 text-[0.9375rem] whitespace-pre-wrap">
      {message.text}
    </div>
  );
}

function NoKeyNotice({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-bg p-5">
      <KeyRound className="size-6 text-accent" aria-hidden="true" />
      <h3 className="font-semibold">Handledaren behöver en nyckel</h3>
      <p className="text-[0.9375rem] leading-relaxed">
        För att kunna svara behöver handledaren en API-nyckel från Anthropic. Du klistrar in den en
        gång under Inställningar → Studiehjälp. Den sparas säkert i Windows och syns aldrig i appen
        igen.
      </p>
      <Link
        to="/settings"
        hash="settings-assistant"
        onClick={onNavigate}
        className={buttonVariants({ variant: 'primary', size: 'md' })}
      >
        Gå till Inställningar
      </Link>
    </div>
  );
}

/**
 * The tutor chat as a sliding side panel. One conversation per `context.key`, kept while the
 * app is open. The context is read when a question is sent, so an answer she gives while the
 * panel is open is included in the next question.
 */
export function TutorPanel({ context, suggestions, open, onOpenChange }: TutorPanelProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay className="bg-ink/20 backdrop-blur-none" />
        <DialogPrimitive.Content
          className={cn(
            'tutor-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col',
            'border-l border-line bg-bg text-ink shadow-paper',
          )}
          // Shortcuts of the view behind (Enter = next question, digits = answers) must not
          // react to key presses inside the panel.
          onKeyDown={(event) => event.stopPropagation()}
          // PanelBody focuses the question field itself.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <PanelBody
            context={context}
            suggestions={suggestions}
            onClose={() => onOpenChange(false)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The panel's content. Mounted only while the panel is open, so the key and usage queries
 * do not run for every view that merely has the button.
 */
function PanelBody({
  context,
  suggestions,
  onClose,
}: Pick<TutorPanelProps, 'context' | 'suggestions'> & { onClose: () => void }) {
  const conversation = useConversation(context.key);
  const hasKey = useHasTutorKey();
  const usage = useUsageSummary();
  const cap = useDailyCapSek();
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const mock = getTutorTransport().kind === 'mock';

  const spent = usage.data?.today.costSek ?? 0;
  const capStatus = dailyCapStatus(spent, cap.value);
  const capReached = !cap.isLoading && usage.data !== undefined && capStatus.reached;
  const noKey = hasKey.data === false || conversation.notice?.kind === 'no-key';
  const { busy, messages } = conversation;
  const last = messages.at(-1);

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text]);

  // A key saved in Inställningar while the notice was shown: let her try again.
  useEffect(() => {
    if (hasKey.data === true && conversation.notice?.kind === 'no-key') clearNotice(context.key);
  }, [hasKey.data, conversation.notice, context.key]);

  const send = (text: string) => {
    if (text.trim() === '' || busy || capReached) return;
    setDraft('');
    void askTutor(context, text);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  };

  const blocked = noKey || capReached;

  useEffect(() => input.current?.focus(), []);

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line bg-paper px-5 py-4">
        <GraduationCap className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-lg leading-tight font-semibold">
            Fråga handledaren
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="truncate text-sm text-muted">
            {context.title}
          </DialogPrimitive.Description>
        </div>
        {(messages.length > 0 || busy) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetConversation(context.key);
              input.current?.focus();
            }}
          >
            <RotateCcw aria-hidden="true" />
            Ny konversation
          </Button>
        )}
        <DialogPrimitive.Close
          className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
          aria-label="Stäng"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </header>

      {mock && (
        <p className="flex items-center gap-2 border-b border-plan-yellow/60 bg-plan-yellow-soft px-5 py-2 text-sm">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          {MOCK_NOTICE}
        </p>
      )}

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        {noKey ? (
          <NoKeyNotice onNavigate={onClose} />
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-2 text-[0.9375rem] leading-relaxed">
            <p>
              Fråga om det du har framför dig. Handledaren ser{' '}
              {context.kind === 'question' ? 'frågan' : 'ärendet'} och{' '}
              {context.answered
                ? 'ditt svar, och kan gå igenom facit med dig.'
                : 'var du är, men avslöjar inte facit innan du svarat.'}
            </p>
            <p className="text-sm text-muted">
              Svaren anger lagrum men kan vara fel. Kontrollera mot lagtexten och ta
              bedömningsfrågor med din handledare.
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} message={m} />
            ) : (
              <AssistantMessage key={m.id} message={m} />
            ),
          )
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-line bg-paper px-5 py-4">
        <p role="status" className="sr-only">
          {busy
            ? 'Handledaren skriver ett svar.'
            : last?.role === 'assistant'
              ? 'Svaret är klart.'
              : ''}
        </p>
        {capReached && (
          <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm">
            {capReachedMessage(capStatus.capSek)}
          </p>
        )}
        {conversation.notice?.kind === 'cap' && !capReached && (
          <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm">
            {conversation.notice.text}
          </p>
        )}
        {!blocked && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Förslag på frågor" role="group">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className={cn(
                  'rounded-full border border-line-strong bg-paper px-3 py-1 text-sm',
                  'hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            Din fråga till handledaren
          </label>
          <textarea
            id={inputId}
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={blocked}
            placeholder={blocked ? '' : 'Skriv din fråga …'}
            className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-line-strong bg-paper px-3 py-2 text-[0.9375rem] placeholder:text-muted focus-visible:border-accent disabled:opacity-50"
          />
          {busy ? (
            <Button variant="secondary" onClick={() => cancelTutor(context.key)}>
              <CircleStop aria-hidden="true" />
              Avbryt
            </Button>
          ) : (
            <Button type="submit" disabled={blocked || draft.trim() === ''} aria-label="Skicka">
              <ArrowUp aria-hidden="true" />
            </Button>
          )}
        </form>
        <div className="flex flex-col gap-0.5 text-xs text-muted tabular-nums">
          {conversation.lastCost && <p>{formatCostLine(conversation.lastCost)}</p>}
          <p>
            I dag {formatSek(spent)} av taket {formatSekLimit(capStatus.capSek)}. Enter skickar,
            Skift+Enter ger ny rad.
          </p>
        </div>
      </footer>
    </>
  );
}
