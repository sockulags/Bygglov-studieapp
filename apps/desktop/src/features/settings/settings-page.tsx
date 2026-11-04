import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { checkForUpdate, getAppVersion, isTauri, runtimeLabel, type UpdateCheckResult } from '@/lib/tauri';
import { cn } from '@/lib/cn';
import { useUiStore, type TextSize, type Theme } from '@/store/ui';

interface SectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

function SettingsSection({ id, title, description, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="grid gap-4 md:grid-cols-[240px_1fr] md:gap-8">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0 max-w-md">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-medium">
            {label}
          </label>
        ) : (
          <p className="font-medium">{label}</p>
        )}
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Accessible segmented control built on native radio inputs (arrow keys work). */
function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-bg p-1"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted',
              'transition-colors duration-[var(--duration-fast)] hover:text-ink',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              checked && 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--line)]',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {Icon && <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />}
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

const themeOptions: SegmentOption<Theme>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Ljust', icon: Sun },
  { value: 'dark', label: 'Mörkt', icon: Moon },
];

const textSizeOptions: SegmentOption<TextSize>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Större' },
  { value: 'xlarge', label: 'Störst' },
];

function AppearanceSection() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const textSize = useUiStore((s) => s.textSize);
  const setTextSize = useUiStore((s) => s.setTextSize);

  return (
    <SettingsSection
      id="settings-appearance"
      title="Utseende"
      description="Tema och textstorlek. Ändringarna syns direkt och sparas på den här datorn."
    >
      <SettingsRow label="Tema" hint="System följer Windows inställning för ljust eller mörkt läge.">
        <Segmented name="theme" label="Tema" value={theme} options={themeOptions} onChange={setTheme} />
      </SettingsRow>
      <SettingsRow label="Textstorlek" hint="Gäller all text i appen, även handlingar och beslut.">
        <Segmented
          name="text-size"
          label="Textstorlek"
          value={textSize}
          options={textSizeOptions}
          onChange={setTextSize}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

function updateMessage(result: UpdateCheckResult | undefined): string | null {
  if (!result) return null;
  switch (result.status) {
    case 'unsupported':
      return 'Uppdateringar fungerar bara i den installerade appen, inte i webbläsaren.';
    case 'up-to-date':
      return 'Du har den senaste versionen.';
    case 'available':
      return `En ny version finns (${result.version}). Den visas överst i appen när den är redo att installeras.`;
    case 'error':
      return 'Det gick inte att söka efter uppdateringar just nu. Kontrollera nätverket och försök igen senare.';
  }
}

function UpdatesSection() {
  const version = useQuery({ queryKey: ['app-version'], queryFn: getAppVersion, staleTime: Infinity });
  const check = useMutation({ mutationFn: checkForUpdate });
  const message = updateMessage(check.data);
  const inTauri = isTauri();

  return (
    <SettingsSection
      id="settings-updates"
      title="Uppdateringar"
      description="Appen söker själv efter nya versioner när den startar. Nya frågor och ärenden följer med uppdateringarna."
    >
      <SettingsRow label="Version" hint={runtimeLabel()}>
        <span className="rounded-sm border border-line bg-bg px-2 py-1 font-mono text-sm tabular-nums">
          {version.data ?? '…'}
        </span>
      </SettingsRow>
      <SettingsRow
        label="Sök efter uppdatering"
        hint={
          <span aria-live="polite">
            {message ??
              (inTauri
                ? 'Kontrollera om en nyare version finns.'
                : 'Tillgängligt i den installerade appen.')}
          </span>
        }
      >
        <Button
          variant="secondary"
          onClick={() => check.mutate()}
          disabled={check.isPending || !inTauri}
        >
          <RefreshCw className={cn(check.isPending && 'animate-spin')} aria-hidden="true" />
          {check.isPending ? 'Söker …' : 'Sök nu'}
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

function StudyHelpSection() {
  const inputId = useId();
  const hintId = useId();
  const [apiKey, setApiKey] = useState('');
  const [visible, setVisible] = useState(false);

  return (
    <SettingsSection
      id="settings-assistant"
      title="Studiehjälp"
      description="AI-stöd som förklarar svar djupare och ger en första återkoppling på beslutsutkast. Kräver en API-nyckel från Anthropic."
    >
      <div className="flex flex-col gap-3 px-6 py-5">
        <label htmlFor={inputId} className="font-medium">
          API-nyckel
        </label>
        <div className="flex flex-wrap gap-2">
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
          <Button disabled title="Studiehjälpen är inte aktiverad i den här versionen">
            Spara nyckel
          </Button>
        </div>
        <p id={hintId} className="text-sm text-muted">
          Nyckeln sparas i Windows Autentiseringshanteraren, aldrig i klartext på disken. Studiehjälpen
          aktiveras i en kommande version; fram till dess sparas ingenting härifrån.
        </p>
      </div>
    </SettingsSection>
  );
}

function DataSection() {
  const pending = 'Aktiveras när studiedatan sparas lokalt i en kommande version.';
  return (
    <SettingsSection
      id="settings-data"
      title="Data"
      description="Din studiedata ligger bara på den här datorn. Exportera den för att flytta den eller ha en säkerhetskopia."
    >
      <SettingsRow label="Exportera studiedata" hint="Sparar svar, repetition och ärenden som en JSON-fil.">
        <Button variant="secondary" disabled title={pending}>
          <Download aria-hidden="true" />
          Exportera
        </Button>
      </SettingsRow>
      <SettingsRow label="Importera studiedata" hint="Läser in en tidigare exporterad fil.">
        <Button variant="secondary" disabled title={pending}>
          <Upload aria-hidden="true" />
          Importera
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Återställ"
        hint="Raderar all studiedata och börjar om från början. Går inte att ångra."
      >
        <Button variant="danger" disabled title={pending}>
          <RotateCcw aria-hidden="true" />
          Återställ
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Inställningar" description="Utseende, uppdateringar, studiehjälp och din data." />
      <div className="flex flex-col gap-10">
        <AppearanceSection />
        <UpdatesSection />
        <StudyHelpSection />
        <DataSection />
      </div>
    </>
  );
}
