import type { CaseFile } from '@bygglov/content-schema';
import {
  DECISION_OUTCOME_LABELS,
  formatKronor,
  isGrant,
  type DecisionDraft,
  type DecisionOutcome,
  type DeliveryMethod,
} from '@/engine';
import { municipalityName } from '../case-model';

/**
 * Texts for the decision form and its A4 preview, written like the model decisions in
 * content/arenden/<case>/handlingar/modell-beslut.md.
 */

export const DECIDING_BODY = 'Bygg- och miljönämnden';

export const OUTCOME_OPTIONS: { value: DecisionOutcome; label: string; hint: string }[] = [
  { value: 'bevilja', label: DECISION_OUTCOME_LABELS.bevilja, hint: 'Åtgärden uppfyller kraven.' },
  {
    value: 'bevilja_med_villkor',
    label: DECISION_OUTCOME_LABELS.bevilja_med_villkor,
    hint: 'Lovet förenas med villkor som har stöd i lag.',
  },
  {
    value: 'avsla',
    label: DECISION_OUTCOME_LABELS.avsla,
    hint: 'Förutsättningarna för lov saknas.',
  },
  {
    value: 'avvisa',
    label: DECISION_OUTCOME_LABELS.avvisa,
    hint: 'Ansökan kan inte prövas i sak, t.ex. efter ett föreläggande som inte följts.',
  },
  {
    value: 'avskriva',
    label: DECISION_OUTCOME_LABELS.avskriva,
    hint: 'Ärendet avslutas utan prövning, t.ex. när ansökan återkallats.',
  },
];

export const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; hint: string }[] = [
  { value: 'delges', label: 'Delges', hint: 'Med delgivningskvitto (9 kap. 108 § PBL)' },
  {
    value: 'meddelande',
    label: 'Meddelande',
    hint: 'Meddelande om kungörelsen (9 kap. 110 § PBL)',
  },
  { value: 'skickas', label: 'Skickas', hint: 'För kännedom' },
];

/** A supervision case (nivå 4): the decision concerns a retroactive permit and sanctions. */
export function isSupervisionCase(caseFile: Pick<CaseFile, 'niva'>): boolean {
  return caseFile.niva === 4;
}

/** The case title as an object in a sentence: "Tillsyn: garage …" → "garage …". */
function caseObject(caseFile: CaseFile): string {
  const title = isSupervisionCase(caseFile)
    ? caseFile.titel.replace(/^Tillsyn:\s*/i, '')
    : caseFile.titel;
  return title.charAt(0).toLowerCase() + title.slice(1);
}

/** Heading of the decision document. */
export function decisionTitle(outcome: DecisionOutcome, caseFile: CaseFile): string {
  const what = caseObject(caseFile);
  if (isSupervisionCase(caseFile)) return `Beslut i tillsynsärende om ${what}`;
  switch (outcome) {
    case 'bevilja':
    case 'bevilja_med_villkor':
      return `Beslut om bygglov för ${what}`;
    case 'avsla':
      return `Beslut om avslag på ansökan om bygglov för ${what}`;
    case 'avvisa':
      return `Beslut om avvisning av ansökan om bygglov för ${what}`;
    case 'avskriva':
      return `Beslut om avskrivning av ärende om ${what}`;
  }
}

const VERB: Record<DecisionOutcome, string> = {
  bevilja: 'beviljar bygglov',
  bevilja_med_villkor: 'beviljar bygglov med villkor',
  avsla: 'avslår ansökan om bygglov',
  avvisa: 'avvisar ansökan om bygglov',
  avskriva: 'avskriver ärendet',
};

const SUPERVISION_VERB: Record<DecisionOutcome, string> = {
  bevilja: 'beviljar bygglov i efterhand',
  bevilja_med_villkor: 'beviljar bygglov i efterhand med villkor',
  avsla: 'avslår ansökan om bygglov i efterhand',
  avvisa: 'avvisar ansökan om bygglov i efterhand',
  avskriva: 'avskriver ärendet',
};

/** "Bygg- och miljönämnden beviljar bygglov … med stöd av 9 kap. 56 § PBL." */
export function decisionSentence(
  draft: DecisionDraft,
  caseFile: CaseFile,
): {
  body: string;
  verb: string;
  rest: string;
} {
  const what = caseObject(caseFile);
  const supervision = isSupervisionCase(caseFile);
  const object =
    draft.utfall === 'avskriva' ? '' : supervision ? ` i ärendet om ${what}` : ` för ${what}`;
  const basis = draft.lagstod.length > 0 ? `, med stöd av ${joinSwedish(draft.lagstod)}` : '';
  const verb = (supervision ? SUPERVISION_VERB : VERB)[draft.utfall];
  return { body: DECIDING_BODY, verb, rest: `${object}${basis}.` };
}

/** "a, b och c". */
export function joinSwedish(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} och ${items.at(-1) ?? ''}`;
}

/**
 * The standard text "Hur man överklagar" that the checkbox writes into the decision.
 * The rules are those of 13 kap. 3 och 16 §§ PBL (lydelse efter 2025-12-01).
 */
export function appealText(
  caseFile: CaseFile,
  options: { diaryNumber?: string | undefined; outcome: DecisionOutcome },
): string[] {
  const kommun = municipalityName(caseFile);
  const paragraphs = [
    'Beslutet kan överklagas till länsstyrelsen (13 kap. 3 § PBL). Överklagandet ska vara skriftligt och skickas till ' +
      `${DECIDING_BODY}, ${kommun}, inte direkt till länsstyrelsen.`,
    'Överklagandet måste ha kommit in inom tre veckor från den dag ni fick del av beslutet.' +
      (isGrant(options.outcome)
        ? ' För den som inte ska delges beslutet räknas tiden från den dag som infaller en vecka efter att beslutet kungjorts på kommunens anslagstavla (13 kap. 16 § PBL).'
        : ''),
    `Skriv i överklagandet vilket beslut det gäller${
      options.diaryNumber ? ` (diarienummer ${options.diaryNumber})` : ''
    }, varför ni anser att beslutet är fel och vilken ändring ni vill ha. Ange namn, adress och telefonnummer och underteckna skrivelsen.`,
  ];
  return paragraphs;
}

export type DraftField =
  | 'utfall'
  | 'lagstod'
  | 'motivering'
  | 'villkor_upplysningar'
  | 'avgift'
  | 'overklagandehanvisning'
  | 'expediering';

export interface DraftIssue {
  field: DraftField;
  message: string;
}

/**
 * Form checks before submission: what is missing from the form itself. They say nothing
 * about whether the decision is right (that is `assessDecision`, shown afterwards), so
 * they can be shown while she writes.
 */
export function validateDecisionDraft(draft: DecisionDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.overklagandehanvisning) {
    issues.push({
      field: 'overklagandehanvisning',
      message:
        'Överklagandehänvisning saknas. Ett beslut som går emot någon ska innehålla en upplysning om hur man överklagar (FL 33 §, 9 kap. 108 § PBL).',
    });
  }
  if (draft.lagstod.length === 0) {
    issues.push({
      field: 'lagstod',
      message: 'Lagstöd saknas. Ange vilka lagrum beslutet grundas på.',
    });
  }
  if (draft.motivering.trim() === '') {
    issues.push({
      field: 'motivering',
      message: 'Motivering saknas. Beslutet ska ange de skäl som bestämt utgången (FL 32 §).',
    });
  }
  if (draft.avgift === null) {
    issues.push({ field: 'avgift', message: 'Avgift är inte ifylld.' });
  }
  if (draft.expediering.filter((r) => r.mottagare.trim() !== '').length === 0) {
    issues.push({
      field: 'expediering',
      message: 'Expediering saknas. Ange vem som ska delges eller få beslutet.',
    });
  }
  return issues;
}

/** "9 800 kr" or "–". */
export function feeText(amount: number | null): string {
  return amount === null ? '–' : formatKronor(amount);
}

/** Parses the fee field: "9 800", "9800 kr" → 9800; empty → null; invalid → NaN. */
export function parseFee(text: string): number | null {
  const cleaned = text
    .replace(/kr(onor)?\.?/i, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : Number.NaN;
}

/** "bygglov_tillbyggnad_16_49kvm" → "Bygglov tillbyggnad 16–49 kvm". */
export function taxaLabel(key: string): string {
  const text = key
    .replace(/(\d+)_(\d+)/g, '$1–$2')
    .replace(/_/g, ' ')
    .replace(/(\d)(kvm|m2|m²)\b/g, '$1 $2');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Amounts in the case's taxa (entries starting with `reduktion` are factors, not fees). */
export function taxaLines(
  taxa: Readonly<Record<string, number>>,
): { key: string; amount: number }[] {
  return Object.entries(taxa)
    .filter(([key]) => !/^reduktion/.test(key))
    .map(([key, amount]) => ({ key, amount }));
}
