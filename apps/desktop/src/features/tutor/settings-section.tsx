import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, FlaskConical, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { SettingsRow, SettingsSection } from '@/features/settings/settings-layout';
import { tutorKeys, useHasTutorKey } from './keys';
import { MOCK_NOTICE } from './mock-transport';
import { formatSek, formatSekLimit, TUTOR_MODEL_INFO, TUTOR_MODELS } from './pricing';
import {
  dailyCapSchema,
  formatDecimal,
  parseDecimal,
  sekPerUsdSchema,
  useDailyCapSek,
  useSekPerUsd,
  useTutorModel,
  type TutorSettings,
} from './settings';
import { getTutorTransport } from './transport';
import { useUsageSummary } from './usage';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Okänt fel.';

/* ------------------------------------------------------------------------------ key */

function KeyRow() {
  const queryClient = useQueryClient();
  const hasKey = useHasTutorKey();
  const model = useTutorModel();
  const inputId = useId();
  const hintId = useId();
  const [apiKey, setApiKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const transport = getTutorTransport();

  const refresh = () => queryClient.invalidateQueries({ queryKey: tutorKeys.hasKey() });

  const save = useMutation({
    mutationFn: (key: string) => transport.setKey(key.trim()),
    onSuccess: async () => {
      setApiKey('');
      setVisible(false);
      setReplacing(false);
      setMessage({
        tone: 'ok',
        text: 'Nyckeln är sparad. Tryck på "Testa nyckeln" för att se att den fungerar.',
      });
      await refresh();
    },
    onError: (error) => setMessage({ tone: 'error', text: errorText(error) }),
  });

  const clear = useMutation({
    mutationFn: () => transport.clearKey(),
    onSuccess: async () => {
      setMessage({ tone: 'ok', text: 'Nyckeln är borttagen från datorn.' });
      await refresh();
    },
    onError: (error) => setMessage({ tone: 'error', text: errorText(error) }),
  });

  const test = useMutation({
    mutationFn: () => transport.testKey(model.value),
    onSuccess: (result) =>
      setMessage({
        tone: result.ok ? 'ok' : 'error',
        text: result.ok
          ? `Nyckeln fungerar (${TUTOR_MODEL_INFO[model.value].name}). ${result.message}`.trim()
          : result.message,
      }),
    onError: (error) => setMessage({ tone: 'error', text: errorText(error) }),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (apiKey.trim() === '') return;
    setMessage(null);
    save.mutate(apiKey);
  };

  const stored = hasKey.data === true;
  const showInput = !stored || replacing;
  const busy = save.isPending || clear.isPending || test.isPending;

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">API-nyckel</p>
        {stored && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Sparad på datorn
          </span>
        )}
      </div>
      {showInput && (
        <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
          <label htmlFor={inputId} className="sr-only">
            API-nyckel
          </label>
          <div className="relative min-w-0 flex-1">
            <KeyRound
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id={inputId}
              type={visible ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={hintId}
              className="h-10 w-full rounded-md border border-line-strong bg-paper pr-11 pl-9 font-mono text-sm placeholder:text-muted focus-visible:border-accent"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Dölj nyckeln' : 'Visa nyckeln'}
              aria-pressed={visible}
              className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="submit" disabled={busy || apiKey.trim() === ''}>
            {save.isPending ? 'Sparar …' : 'Spara nyckel'}
          </Button>
          {replacing && (
            <Button variant="ghost" onClick={() => setReplacing(false)}>
              Avbryt
            </Button>
          )}
        </form>
      )}
      {stored && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => test.mutate()} disabled={busy}>
            {test.isPending ? 'Testar …' : 'Testa nyckeln'}
          </Button>
          {!replacing && (
            <Button variant="ghost" onClick={() => setReplacing(true)} disabled={busy}>
              Byt nyckel
            </Button>
          )}
          <Button variant="danger" onClick={() => clear.mutate()} disabled={busy}>
            <Trash2 aria-hidden="true" />
            Ta bort nyckeln
          </Button>
        </div>
      )}
      <p
        aria-live="polite"
        className={cn(
          'text-sm',
          message?.tone === 'error' ? 'text-brick' : message ? 'text-success' : 'sr-only',
        )}
      >
        {message?.text ?? ''}
      </p>
      <p id={hintId} className="text-sm text-muted">
        Nyckeln sparas i Windows Autentiseringshanteraren, aldrig i klartext på disken eller i
        appens databas, och den kan inte visas igen. Frågorna går direkt från appen till Anthropic.
      </p>
      {transport.kind === 'mock' && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          {MOCK_NOTICE}: i webbläsaren sparas ingen nyckel och handledaren svarar med ett inspelat
          svar.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------- model */

function ModelRow() {
  const model = useTutorModel();
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-3 px-6 py-5">
      <legend className="float-left mb-3 font-medium">Modell</legend>
      <div className="clear-both grid gap-2 sm:grid-cols-2">
        {TUTOR_MODELS.map((id) => {
          const info = TUTOR_MODEL_INFO[id];
          const checked = model.value === id;
          return (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-md border bg-paper p-3',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                checked
                  ? 'border-accent bg-accent-soft/60'
                  : 'border-line-strong hover:bg-accent-soft/40',
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={name}
                  value={id}
                  checked={checked}
                  onChange={() => void model.setValue(id)}
                  className="accent-[var(--accent)]"
                />
                <span className="font-medium">{info.name}</span>
                <span className="text-sm text-muted">{info.tagline}</span>
              </span>
              <span className="text-sm text-muted">{info.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------- number settings */

function NumberSetting({
  label,
  hint,
  unit,
  value,
  onSave,
  validate,
}: {
  label: string;
  hint: string;
  unit: string;
  value: number;
  onSave: (value: number) => Promise<void>;
  validate: (value: number) => boolean;
}) {
  const id = useId();
  const errorId = useId();
  const [text, setText] = useState(formatDecimal(value));
  const [error, setError] = useState<string | null>(null);
  // A new stored value (loaded or saved) replaces what is in the field.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(formatDecimal(value));
  }

  const commit = () => {
    const parsed = parseDecimal(text);
    if (parsed === null || !validate(parsed)) {
      setError('Skriv ett tal, till exempel 10,5.');
      return;
    }
    setError(null);
    if (parsed !== value) void onSave(parsed);
  };

  return (
    <SettingsRow label={label} hint={error ?? hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-10 w-24 rounded-md border bg-paper px-3 text-right tabular-nums focus-visible:border-accent',
            error ? 'border-brick' : 'border-line-strong',
          )}
        />
        <span className="text-sm text-muted">{unit}</span>
        {error && (
          <span id={errorId} className="sr-only">
            {error}
          </span>
        )}
      </div>
    </SettingsRow>
  );
}

/* ---------------------------------------------------------------------------- usage */

function UsageRow({ capSek }: { capSek: TutorSettings['dailyCapSek'] }) {
  const usage = useUsageSummary();
  const data = usage.data;
  const cells: { label: string; value: string; sub?: string }[] = data
    ? [
        {
          label: 'I dag',
          value: formatSek(data.today.costSek),
          sub: `av ${formatSekLimit(capSek)}`,
        },
        { label: 'Denna månad', value: formatSek(data.month.costSek) },
        { label: 'Totalt', value: formatSek(data.total.costSek) },
        {
          label: 'Antal frågor',
          value: String(data.total.requests),
          sub: `${data.today.requests} i dag, ${data.month.requests} denna månad`,
        },
      ]
    : [];
  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <p className="font-medium">Förbrukning</p>
      {usage.isLoading ? (
        <p className="text-sm text-muted">Hämtar …</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cells.map((c) => (
            <div key={c.label} className="rounded-md border border-line bg-bg px-3 py-2">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{c.value}</dd>
              {c.sub && <dd className="text-xs text-muted">{c.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm text-muted">
        Ungefärlig kostnad räknad på Anthropics listpriser och växelkursen ovan. Den faktiska
        kostnaden och månadstaket syns i Anthropic Console.
      </p>
    </div>
  );
}

/** Inställningar → Studiehjälp: key, model, exchange rate, daily cap and usage. */
export function TutorSettingsSection() {
  const rate = useSekPerUsd();
  const cap = useDailyCapSek();
  return (
    <SettingsSection
      id="settings-assistant"
      title="Studiehjälp"
      description="AI-handledaren förklarar svar djupare och ger en första återkoppling på beslutsutkast. Kräver en API-nyckel från Anthropic."
    >
      <KeyRow />
      <ModelRow />
      <NumberSetting
        label="Växelkurs"
        hint="Kronor per amerikansk dollar, för att visa kostnaden i kronor."
        unit="kr/USD"
        value={rate.value}
        onSave={rate.setValue}
        validate={(v) => sekPerUsdSchema.safeParse(v).success}
      />
      <NumberSetting
        label="Dagligt kostnadstak"
        hint="När taket är nått tar handledaren inte emot fler frågor förrän nästa dag."
        unit="kr"
        value={cap.value}
        onSave={cap.setValue}
        validate={(v) => dailyCapSchema.safeParse(v).success}
      />
      <UsageRow capSek={cap.value} />
    </SettingsSection>
  );
}
