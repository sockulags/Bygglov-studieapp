import { AlertTriangle, Plus, Send, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import { formatKronor, type DecisionDraft, type DeliveryMethod } from '@/engine';
import { cn } from '@/lib/cn';
import { useKeydown } from '@/lib/use-keydown';
import { caseLawRefs, recipientSuggestions } from '../case-model';
import {
  appealText,
  DELIVERY_OPTIONS,
  OUTCOME_OPTIONS,
  parseFee,
  taxaLabel,
  taxaLines,
  validateDecisionDraft,
  type DraftField,
  type DraftIssue,
} from './decision-text';

export interface DecisionFormProps {
  caseFile: CaseFile;
  draft: DecisionDraft;
  onChange: (draft: DecisionDraft) => void;
  onSubmit: (draft: DecisionDraft) => void;
  diaryNumber?: string | undefined;
}

const fieldClass =
  'w-full rounded-md border border-line-strong bg-paper px-3 text-[0.9375rem] focus-visible:border-accent';

function Section({
  number,
  title,
  hint,
  children,
  invalid = false,
  id,
}: {
  number: number;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <fieldset
      id={id}
      className={cn('rounded-lg border bg-paper p-4', invalid ? 'border-brick/60' : 'border-line')}
    >
      <legend className="px-1 text-sm font-semibold">
        <span className="mr-1.5 text-muted tabular-nums">{number}.</span>
        {title}
      </legend>
      {hint && <p className="mb-2 text-sm text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

/**
 * Beslutsmallen (docs/03): the form follows the parts of a real decision. Form checks
 * (what is missing) are shown on submission; whether the decision is right is assessed
 * only after it has been handed in.
 */
export function DecisionForm({
  caseFile,
  draft,
  onChange,
  onSubmit,
  diaryNumber,
}: DecisionFormProps) {
  const baseId = useId();
  const [issues, setIssues] = useState<DraftIssue[] | null>(null);
  const [freeRef, setFreeRef] = useState('');
  const [feeInput, setFeeInput] = useState(() =>
    draft.avgift === null ? '' : String(draft.avgift),
  );
  const alertRef = useRef<HTMLDivElement>(null);
  const refs = caseLawRefs(caseFile);
  const suggestions = recipientSuggestions(caseFile);
  const taxa = taxaLines(caseFile.taxa);
  const feeValue = parseFee(feeInput);
  const feeInvalid = feeValue !== null && Number.isNaN(feeValue);

  const update = (patch: Partial<DecisionDraft>) => {
    const next = { ...draft, ...patch };
    onChange(next);
    // Re-check while the issue list is shown, so fixed points disappear.
    if (issues) setIssues(validateDecisionDraft(next));
  };
  const issueFor = (field: DraftField) => issues?.find((i) => i.field === field);

  const toggleRef = (ref: string) =>
    update({
      lagstod: draft.lagstod.includes(ref)
        ? draft.lagstod.filter((r) => r !== ref)
        : [...draft.lagstod, ref],
    });
  const addFreeRef = () => {
    const ref = freeRef.trim();
    if (ref === '') return;
    if (!draft.lagstod.includes(ref)) update({ lagstod: [...draft.lagstod, ref] });
    setFreeRef('');
  };
  const setFee = (text: string) => {
    setFeeInput(text);
    const value = parseFee(text);
    update({ avgift: value === null || Number.isNaN(value) ? null : value });
  };
  const setRecipient = (index: number, patch: Partial<DecisionDraft['expediering'][number]>) =>
    update({
      expediering: draft.expediering.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    });

  const submit = (force = false) => {
    const found = validateDecisionDraft(draft);
    if (found.length > 0 && !force) {
      setIssues(found);
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    onSubmit(draft);
  };

  // 1–5 choose the outcome when focus is not in a text field.
  useKeydown((event) => {
    if (!/^[1-5]$/.test(event.key)) return;
    const option = OUTCOME_OPTIONS[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    update({ utfall: option.value });
  });

  return (
    <form
      className="flex flex-col gap-4"
      aria-label="Beslutsformulär"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        // Enter in a one-line field should not hand in the decision by accident.
        const target = event.target;
        if (event.key === 'Enter' && target instanceof HTMLInputElement) event.preventDefault();
      }}
    >
      <Section number={1} title="Beslut">
        <div role="radiogroup" aria-label="Beslut" className="flex flex-col gap-1.5">
          {OUTCOME_OPTIONS.map((option, index) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2',
                draft.utfall === option.value
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name={`${baseId}-utfall`}
                value={option.value}
                checked={draft.utfall === option.value}
                onChange={() => update({ utfall: option.value })}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{option.label}</span>
                <span className="block text-sm text-muted">{option.hint}</span>
              </span>
              <kbd className="mt-0.5 rounded-sm border border-line-strong bg-bg px-1.5 text-xs text-muted">
                {index + 1}
              </kbd>
            </label>
          ))}
        </div>
      </Section>

      <Section
        number={2}
        title="Lagstöd för beslutet"
        hint="Välj ur ärendets lagrum eller skriv in andra, t.ex. PBL 9 kap. 56 §."
        invalid={issueFor('lagstod') !== undefined}
      >
        {refs.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1" aria-label="Ärendets lagrum">
            {refs.map((ref) => (
              <li key={ref}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-0.5 hover:bg-accent-soft/50">
                  <input
                    type="checkbox"
                    checked={draft.lagstod.includes(ref)}
                    onChange={() => toggleRef(ref)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="font-serif">{ref}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <label htmlFor={`${baseId}-ref`} className="sr-only">
            Annat lagrum
          </label>
          <input
            id={`${baseId}-ref`}
            value={freeRef}
            placeholder="Annat lagrum, t.ex. PBL 9 kap. 56 §"
            onChange={(event) => setFreeRef(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addFreeRef();
              }
            }}
            className={cn(fieldClass, 'h-9 flex-1')}
          />
          <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addFreeRef}>
            <Plus aria-hidden="true" />
            Lägg till
          </Button>
        </div>
        {draft.lagstod.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Valt lagstöd">
            {draft.lagstod.map((ref) => (
              <span
                key={ref}
                className="inline-flex h-7 items-center gap-1 rounded-sm border border-accent/30 bg-accent-soft pr-1 pl-2 font-serif text-[0.8125rem] text-accent"
              >
                {ref}
                <button
                  type="button"
                  onClick={() => update({ lagstod: draft.lagstod.filter((r) => r !== ref) })}
                  className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-accent/15"
                  aria-label={`Ta bort ${ref}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section
        number={3}
        title="Beslutsmotivering"
        hint="Skälen för beslutet: vilka regler som tillämpats och vilka omständigheter som avgjort."
        invalid={issueFor('motivering') !== undefined}
      >
        <label htmlFor={`${baseId}-motivering`} className="sr-only">
          Beslutsmotivering
        </label>
        <textarea
          id={`${baseId}-motivering`}
          value={draft.motivering}
          rows={9}
          onChange={(event) => update({ motivering: event.target.value })}
          className={cn(fieldClass, 'py-2 font-serif leading-relaxed')}
        />
      </Section>

      <Section
        number={4}
        title="Villkor och upplysningar"
        hint="T.ex. startbesked, giltighetstid, kungörelse, kontrollansvarig. En tom rad ger nytt stycke."
      >
        <label htmlFor={`${baseId}-upplysningar`} className="sr-only">
          Villkor och upplysningar
        </label>
        <textarea
          id={`${baseId}-upplysningar`}
          value={draft.villkor_upplysningar}
          rows={6}
          onChange={(event) => update({ villkor_upplysningar: event.target.value })}
          className={cn(fieldClass, 'py-2 font-serif leading-relaxed')}
        />
      </Section>

      <Section
        number={5}
        title="Avgift"
        hint="Enligt ärendets taxa. Tänk på reduktionen om tidsfristen har överskridits (12 kap. 8 a § PBL)."
        invalid={issueFor('avgift') !== undefined || feeInvalid}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${baseId}-avgift`} className="sr-only">
            Avgift i kronor
          </label>
          <input
            id={`${baseId}-avgift`}
            inputMode="numeric"
            autoComplete="off"
            value={feeInput}
            aria-invalid={feeInvalid || undefined}
            onChange={(event) => setFee(event.target.value)}
            className={cn(fieldClass, 'h-10 w-40 tabular-nums')}
          />
          <span className="text-muted">kr</span>
        </div>
        {feeInvalid && (
          <p className="mt-1 text-sm text-brick">Skriv avgiften som ett belopp i kronor.</p>
        )}
        {taxa.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {taxa.map((line) => (
              <Button
                key={line.key}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFee(String(line.amount))}
                title="Fyll i beloppet enligt taxan"
              >
                Taxan: {taxaLabel(line.key)}, {formatKronor(line.amount)}
              </Button>
            ))}
          </div>
        )}
      </Section>

      <Section
        number={6}
        title="Hur man överklagar"
        invalid={issueFor('overklagandehanvisning') !== undefined}
      >
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={draft.overklagandehanvisning}
            onChange={(event) => update({ overklagandehanvisning: event.target.checked })}
            aria-describedby={
              issueFor('overklagandehanvisning') ? `${baseId}-appeal-error` : undefined
            }
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Överklagandehänvisning</span>
            <span className="block text-sm text-muted">Skriver in standardtexten i beslutet.</span>
          </span>
        </label>
        {issueFor('overklagandehanvisning') && (
          <p id={`${baseId}-appeal-error`} className="mt-2 text-sm text-brick">
            {issueFor('overklagandehanvisning')?.message}
          </p>
        )}
        {draft.overklagandehanvisning && (
          <div
            className="mt-3 rounded-md bg-bg px-3 py-2.5 font-serif text-sm leading-relaxed"
            aria-label="Standardtext om överklagande"
          >
            {appealText(caseFile, { diaryNumber, outcome: draft.utfall }).map((p, i) => (
              <p key={i} className={i > 0 ? 'mt-2' : undefined}>
                {p}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section
        number={7}
        title="Expediering"
        hint="Vem ska delges beslutet, vem ska få meddelande och vem får det för kännedom?"
        invalid={issueFor('expediering') !== undefined}
      >
        <datalist id={`${baseId}-mottagare`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {draft.expediering.length > 0 && (
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-1 font-medium">Mottagare</th>
                <th className="pb-1 font-medium">Sätt</th>
                <th className="w-8 pb-1">
                  <span className="sr-only">Ta bort</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.expediering.map((recipient, index) => (
                <tr key={index}>
                  <td className="py-1 pr-2">
                    <input
                      list={`${baseId}-mottagare`}
                      value={recipient.mottagare}
                      aria-label={`Mottagare ${index + 1}`}
                      onChange={(event) => setRecipient(index, { mottagare: event.target.value })}
                      className={cn(fieldClass, 'h-9')}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={recipient.satt}
                      aria-label={`Sätt för mottagare ${index + 1}`}
                      onChange={(event) =>
                        setRecipient(index, { satt: event.target.value as DeliveryMethod })
                      }
                      className={cn(fieldClass, 'h-9 pr-1')}
                    >
                      {DELIVERY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-8 px-0"
                      aria-label={`Ta bort mottagare ${index + 1}`}
                      onClick={() =>
                        update({ expediering: draft.expediering.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            update({
              expediering: [
                ...draft.expediering,
                {
                  mottagare: draft.expediering.length === 0 ? (suggestions[0] ?? '') : '',
                  satt: 'delges',
                },
              ],
            })
          }
        >
          <Plus aria-hidden="true" />
          Lägg till mottagare
        </Button>
        <ul className="mt-3 flex flex-col gap-0.5 text-xs text-muted">
          {DELIVERY_OPTIONS.map((o) => (
            <li key={o.value}>
              <span className="font-medium">{o.label}:</span> {o.hint}
            </li>
          ))}
        </ul>
      </Section>

      {issues && issues.length > 0 && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-brick/60 bg-brick-soft p-4 outline-none"
        >
          <p className="flex items-center gap-2 font-semibold text-brick">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Formuläret är inte komplett
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {issues.map((issue) => (
              <li key={issue.field}>{issue.message}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setIssues(null)}>
              Rätta formuläret
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={() => submit(true)}>
              Lämna in ändå
            </Button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 bg-bg/95 px-1 py-3 backdrop-blur-[2px]">
        <Button type="submit" size="lg">
          <Send aria-hidden="true" />
          Lämna in beslutet
        </Button>
        <span className="text-sm text-muted">
          Efter inlämning jämförs beslutet med modellbeslutet.
        </span>
      </div>
    </form>
  );
}
