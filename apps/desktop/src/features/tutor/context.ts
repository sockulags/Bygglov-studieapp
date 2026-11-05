import type { CaseFile, CaseStep, Question } from '@bygglov/content-schema';
import {
  caseFacts,
  DECISION_OUTCOME_LABELS,
  DELIVERY_METHOD_LABELS,
  diary,
  stepOverview,
  visibleDocuments,
  type CaseState,
  type DecisionDraft,
  type GradeResult,
  type QuizAnswer,
  type StepResult,
  type SubmittedDecision,
} from '@/engine';
import { caseLawRefs, deadlineSummary, factLabel, factValue } from '@/features/cases/case-model';
import type { TutorContext } from './types';

/**
 * Context builders: turn what she sees on screen into plain Swedish text for the tutor's
 * system prompt. The answer key (right alternatives, model answers, the expected decision,
 * assessment criteria, the model decision) is only included once she has answered the
 * question or submitted the decision, so the tutor cannot give it away.
 */

/** Upper bound for a context text, about 3 000 tokens. */
export const MAX_CONTEXT_CHARS = 12_000;
/** Marks where a text was shortened. */
export const CLIP_MARKER = '[...]';

/** Shortens `text` to at most `max` characters, at a word boundary, ending with "[...]". */
export function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const room = Math.max(0, max - CLIP_MARKER.length - 1);
  let cut = trimmed.slice(0, room);
  const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  if (boundary > room * 0.8) cut = cut.slice(0, boundary);
  return `${cut.trimEnd()} ${CLIP_MARKER}`.slice(0, Math.max(max, 0));
}

const list = (items: readonly string[], prefix = '- '): string =>
  items.map((item) => `${prefix}${item}`).join('\n');

const numbered = (items: readonly string[]): string =>
  items.map((item, i) => `${i + 1}. ${item}`).join('\n');

const percent = (score: number): string => `${Math.round(score * 100)} %`;

/* ------------------------------------------------------------------------ questions */

const QUESTION_TYPE_LABELS: Record<Question['typ'], string> = {
  flerval: 'Flervalsfråga, ett rätt alternativ',
  flersvar: 'Flervalsfråga, ett eller flera rätta alternativ',
  sant_falskt: 'Sant eller falskt',
  lucktext: 'Lucktext',
  para_ihop: 'Para ihop',
  ordning: 'Sätt i rätt ordning',
  berakning: 'Beräkning',
  oppen: 'Öppen fråga, självrättad',
  ritning: 'Fråga om en ritning',
};

const truthLabel = (value: boolean | null | undefined): string =>
  value === null || value === undefined ? 'inget svar' : value ? 'Sant' : 'Falskt';

const sorted = (items: readonly string[]): string[] =>
  [...items].sort((a, b) => a.localeCompare(b, 'sv'));

/** The question as she sees it before answering: no answer key. */
function questionBody(question: Question): string[] {
  const lines: string[] = [];
  switch (question.typ) {
    case 'flerval':
    case 'flersvar':
      lines.push(
        `Fråga: ${question.fraga}`,
        '',
        'Alternativ:',
        numbered(question.alternativ.map((a) => a.text)),
      );
      break;
    case 'sant_falskt':
      lines.push(`Påstående: ${question.fraga}`);
      break;
    case 'lucktext':
      lines.push(`Text med luckor (___): ${question.fraga}`);
      break;
    case 'para_ihop':
      lines.push(
        `Fråga: ${question.fraga}`,
        '',
        'Vänster:',
        numbered(question.par.map((p) => p.vanster)),
        '',
        'Höger (i bokstavsordning):',
        list(sorted(question.par.map((p) => p.hoger))),
      );
      break;
    case 'ordning':
      lines.push(
        `Fråga: ${question.fraga}`,
        '',
        'Poster (i bokstavsordning):',
        list(sorted(question.poster)),
      );
      break;
    case 'berakning':
      lines.push(`Fråga: ${question.fraga}${question.enhet ? ` (svara i ${question.enhet})` : ''}`);
      break;
    case 'oppen':
      lines.push(`Fråga: ${question.fraga}`);
      break;
    case 'ritning':
      lines.push(`Fråga: ${question.fraga}`);
      if (question.bild_text) lines.push(`Ritningen: ${question.bild_text}`);
      break;
  }
  return lines;
}

/** Her answer in words, or null when it cannot be described for this type. */
function describeAnswer(question: Question, answer: QuizAnswer): string | null {
  if (answer.type !== question.typ) return null;
  switch (answer.type) {
    case 'flerval': {
      if (question.typ !== 'flerval') return null;
      const i = answer.selected;
      const choice = i === null ? undefined : question.alternativ[i];
      return i === null || !choice ? 'inget alternativ' : `alternativ ${i + 1} ("${choice.text}")`;
    }
    case 'flersvar': {
      if (question.typ !== 'flersvar') return null;
      const picked = [...new Set(answer.selected)]
        .filter((i) => i >= 0 && i < question.alternativ.length)
        .sort((a, b) => a - b);
      return picked.length === 0
        ? 'inga alternativ'
        : `alternativ ${picked.map((i) => i + 1).join(', ')}`;
    }
    case 'sant_falskt':
      return truthLabel(answer.value);
    case 'lucktext':
      return answer.gaps.map((g, i) => `lucka ${i + 1}: "${g}"`).join(', ');
    case 'para_ihop': {
      if (question.typ !== 'para_ihop') return null;
      return question.par
        .map((p, i) => {
          const j = answer.matches[i];
          const right = j === null || j === undefined ? undefined : question.par[j]?.hoger;
          return `${p.vanster} → ${right ?? 'inget valt'}`;
        })
        .join('; ');
    }
    case 'ordning': {
      if (question.typ !== 'ordning') return null;
      return answer.order.map((i) => question.poster[i] ?? '?').join(' → ');
    }
    case 'berakning':
      return answer.value === null || answer.value === '' ? 'inget svar' : String(answer.value);
    case 'oppen':
      return answer.text.trim() === '' ? 'tomt svar' : `\n${answer.text.trim()}`;
    case 'ritning':
      if (answer.text !== undefined && answer.text.trim() !== '') return `\n${answer.text.trim()}`;
      return answer.value === null || answer.value === undefined
        ? 'inget svar'
        : String(answer.value);
  }
}

/** The answer key of a question (only used after she has answered). */
function answerKey(question: Question): string[] {
  const lines: string[] = [];
  switch (question.typ) {
    case 'flerval':
    case 'flersvar': {
      const right = question.alternativ.flatMap((a, i) => (a.ratt ? [i + 1] : []));
      lines.push(`Rätt svar: alternativ ${right.join(', ')}`);
      const comments = question.alternativ.flatMap((a, i) =>
        a.forklaring ? [`Alternativ ${i + 1}: ${a.forklaring}`] : [],
      );
      if (comments.length > 0) lines.push('Kommentarer till alternativen:', list(comments));
      break;
    }
    case 'sant_falskt':
      lines.push(`Rätt svar: ${truthLabel(question.svar)}`);
      break;
    case 'lucktext':
      lines.push(
        `Rätt svar: ${question.svar
          .map((s, i) => `lucka ${i + 1}: ${Array.isArray(s) ? s.join(' eller ') : s}`)
          .join(', ')}`,
      );
      break;
    case 'para_ihop':
      lines.push('Rätt par:', list(question.par.map((p) => `${p.vanster} → ${p.hoger}`)));
      break;
    case 'ordning':
      lines.push('Rätt ordning:', numbered(question.poster));
      break;
    case 'berakning':
      lines.push(
        `Rätt svar: ${question.svar}${question.enhet ? ` ${question.enhet}` : ''}${
          question.tolerans > 0 ? ` (±${question.tolerans})` : ''
        }`,
      );
      if (question.losning) lines.push(`Lösning: ${question.losning}`);
      break;
    case 'oppen':
      lines.push('Bedömningspunkter:', list(question.bedomningspunkter));
      if (question.modellsvar) lines.push(`Modellsvar: ${question.modellsvar}`);
      break;
    case 'ritning':
      if (question.svar !== undefined) {
        lines.push(`Rätt svar: ${question.svar}${question.enhet ? ` ${question.enhet}` : ''}`);
      }
      if (question.bedomningspunkter) {
        lines.push('Bedömningspunkter:', list(question.bedomningspunkter));
      }
      break;
  }
  return lines;
}

function resultLine(graded: GradeResult): string {
  if (graded.kind === 'self_graded') return 'Resultat: hon jämför själv med bedömningspunkterna.';
  const head =
    graded.outcome === 'correct'
      ? 'Rätt'
      : graded.outcome === 'partial'
        ? `Delvis rätt (${percent(graded.score)})`
        : 'Inte rätt';
  return `Resultat: ${head}${graded.selfAssessed ? ' (självbedömt)' : ''}`;
}

/**
 * Context for a quiz question. Without `answer` the text holds the question only; with it,
 * also her answer, the result, the answer key, the explanation and the law references.
 */
export function buildQuestionContext(
  question: Question,
  answer?: QuizAnswer | null,
  graded?: GradeResult | null,
): TutorContext {
  const answered = answer !== undefined && answer !== null;
  const lines: string[] = [
    `Quizfråga ${question.id} · ${QUESTION_TYPE_LABELS[question.typ]} · svårighet ${question.svarighet} av 3`,
    '',
    ...questionBody(question),
    '',
  ];
  if (!answered) {
    lines.push('Hon har inte svarat på frågan ännu.');
  } else {
    lines.push(`Hennes svar: ${describeAnswer(question, answer) ?? 'okänt'}`);
    if (graded) lines.push(resultLine(graded));
    lines.push('', ...answerKey(question));
    const explanation = graded?.explanation ?? question.forklaring ?? null;
    if (explanation) lines.push('', `Förklaring i appen: ${explanation}`);
    const lawRefs = graded?.lawRefs ?? question.lagrum;
    if (lawRefs.length > 0) {
      const uncertain = graded?.lawRefsUncertain ?? question.lagrum_osaker === true;
      lines.push(`Lagrum i appen: ${lawRefs.join(', ')}${uncertain ? ' (ej kontrollerade)' : ''}`);
    }
  }
  if (question.status === 'utkast') {
    lines.push(
      '',
      `Frågan är ett utkast som handledaren inte granskat (rättsläge ${question.rattslage}).`,
    );
  }
  return {
    key: `question:${question.id}`,
    kind: 'question',
    title: `Fråga ${question.id}`,
    text: clipText(lines.join('\n'), MAX_CONTEXT_CHARS),
    answered,
  };
}

/* ---------------------------------------------------------------------------- cases */

export interface CaseContextOptions {
  /**
   * Include the answer key: the submitted decision with the automatic checks, expected
   * outcome, assessment criteria, common mistakes and the model decision. Has no effect
   * until a decision has been submitted.
   */
  includeModelAnswers: boolean;
  /** Text of the visible Markdown documents, by document id (front matter may be included). */
  documentTexts?: Readonly<Record<string, string>>;
  /** Her notes for the case (arbetsytan → Anteckningar). */
  notes?: string;
  /** Her unsubmitted decision draft, so the tutor can give first feedback on it. */
  draft?: DecisionDraft | null;
  /** The model decision (Markdown); only used together with `includeModelAnswers`. */
  modelDecisionText?: string | null;
  /** Defaults to `MAX_CONTEXT_CHARS`. */
  maxChars?: number;
}

const STATUS_LABELS: Record<CaseState['status'], string> = {
  pagar: 'pågår',
  inlamnat: 'beslut inlämnat',
  bedomt: 'bedömt av handledaren',
};

const STEP_TYPE_LABELS: Record<CaseStep['typ'], string> = {
  checklista: 'checklista',
  fraga: 'fråga',
  berakning: 'beräkning',
  urval: 'urval',
  skrivelse: 'skrivelse',
  beslut: 'beslut',
};

/** The current step as she sees it before answering: no answer key, no explanation. */
function stepBody(step: CaseStep): string[] {
  const lines: string[] = [`${step.rubrik} (${STEP_TYPE_LABELS[step.typ]})`];
  if (step.instruktion) lines.push(`Instruktion: ${step.instruktion}`);
  switch (step.typ) {
    case 'checklista':
      lines.push('Kontrollera om följande finns:', list(step.poster.map((p) => p.text)));
      break;
    case 'fraga':
      lines.push(`Fråga: ${step.fraga}`);
      if (step.alternativ) lines.push('Alternativ:', numbered(step.alternativ.map((a) => a.text)));
      if (step.fragetyp === 'sant_falskt') lines.push('Hon svarar sant eller falskt.');
      break;
    case 'berakning':
      lines.push(
        'Beräkna:',
        list(step.fragor.map((f) => `${f.text}${f.enhet ? ` (${f.enhet})` : ''}`)),
      );
      break;
    case 'urval':
      lines.push('Välj bland:', numbered(step.alternativ.map((a) => a.text)));
      break;
    case 'skrivelse':
      lines.push('Hon skriver en egen text.');
      break;
    case 'beslut':
      lines.push(
        'Hon fyller i beslutsmallen: utfall, lagstöd, motivering, villkor och upplysningar, avgift, överklagandehänvisning och expediering.',
      );
      break;
  }
  return lines;
}

function stepResultLabel(result: StepResult): string {
  if (result.skipped) return 'hoppades över';
  if (result.outcome === null) return 'klart, väntar på självbedömning';
  const score = result.score ?? 0;
  return result.outcome === 'correct'
    ? 'klart, rätt'
    : result.outcome === 'partial'
      ? `klart, delvis rätt (${percent(score)})`
      : 'klart, inte rätt';
}

function describeDraft(draft: DecisionDraft): string[] {
  return [
    `Utfall: ${DECISION_OUTCOME_LABELS[draft.utfall]}`,
    `Lagstöd: ${draft.lagstod.length > 0 ? draft.lagstod.join(', ') : 'inget angivet'}`,
    `Motivering: ${draft.motivering.trim() || 'tom'}`,
    `Villkor och upplysningar: ${draft.villkor_upplysningar.trim() || 'inga'}`,
    `Avgift: ${draft.avgift === null ? 'inte angiven' : `${draft.avgift} kr`}`,
    `Överklagandehänvisning: ${draft.overklagandehanvisning ? 'ja' : 'nej'}`,
    `Expediering: ${
      draft.expediering.length > 0
        ? draft.expediering
            .map((r) => `${r.mottagare} (${DELIVERY_METHOD_LABELS[r.satt]})`)
            .join('; ')
        : 'ingen angiven'
    }`,
  ];
}

function answerKeyForDecision(caseFile: CaseFile, decision: SubmittedDecision): string[] {
  const { assessment } = decision;
  const lines: string[] = [
    `FACIT (hon har lämnat in beslutet ${decision.date})`,
    `Förväntat utfall: ${DECISION_OUTCOME_LABELS[assessment.expectedOutcome]}`,
    `Automatiska kontroller, ${assessment.passedChecks} av ${assessment.totalChecks} godkända:`,
    list(
      assessment.checks.map(
        (c) =>
          `${c.passed ? 'Godkänd' : c.severity === 'tip' ? 'Tips' : 'Inte godkänd'}: ${c.title}. ${c.message}`,
      ),
    ),
  ];
  if (assessment.criteria.length > 0) {
    const checked = new Set(decision.checkedCriteria ?? []);
    lines.push(
      decision.checkedCriteria === null
        ? 'Bedömningspunkter (hon har inte bockat av dem ännu):'
        : 'Bedömningspunkter (bockad = hon anser att hon uppfyller den):',
      list(
        assessment.criteria.map((c, i) =>
          decision.checkedCriteria === null ? c : `${checked.has(i) ? '[x]' : '[ ]'} ${c}`,
        ),
      ),
    );
  }
  if (assessment.commonMistakes.length > 0) {
    lines.push('Vanliga fel:', list(assessment.commonMistakes));
  }
  if (caseFile.facit?.sammanfattning) {
    lines.push(`Facit i korthet: ${caseFile.facit.sammanfattning.trim()}`);
  }
  return lines;
}

interface DocumentPart {
  heading: string;
  text: string;
}

/**
 * Fits the document texts into `budget` characters: short documents are kept whole and the
 * room they leave goes to the longer ones, which are clipped with "[...]".
 */
function fitDocuments(parts: DocumentPart[], budget: number): string[] {
  const out = new Map<DocumentPart, string>();
  let left = budget - parts.reduce((sum, p) => sum + p.heading.length + 2, 0);
  const bySize = [...parts].sort((a, b) => a.text.length - b.text.length);
  bySize.forEach((part, i) => {
    const share = Math.floor(Math.max(0, left) / (bySize.length - i));
    const text =
      part.text.length <= share
        ? part.text
        : share >= 80
          ? clipText(part.text, share)
          : CLIP_MARKER;
    out.set(part, text);
    left -= text.length + 1;
  });
  return parts.map((p) => `${p.heading}\n${out.get(p) ?? CLIP_MARKER}`);
}

/**
 * Context for a case: what she sees in the case view (summary, visible documents, facts,
 * the current step, her notes and draft). With `includeModelAnswers` and a submitted
 * decision it also holds the answer key for the comparison view.
 */
export function buildCaseContext(
  caseFile: CaseFile,
  state: CaseState,
  currentStep: CaseStep | null,
  options: CaseContextOptions,
): TutorContext {
  const maxChars = options.maxChars ?? MAX_CONTEXT_CHARS;
  const decision = state.decisions.at(-1) ?? null;
  const withKey = options.includeModelAnswers && decision !== null;
  const deadline = deadlineSummary(state);

  const head: string[] = [
    `Ärende ${caseFile.id}: ${caseFile.titel} (nivå ${caseFile.niva})`,
    `Fastighet: ${caseFile.fastighet}`,
    `Sammanfattning: ${caseFile.sammanfattning.trim()}`,
    `Lärandemål:\n${list(caseFile.larandemal)}`,
    `Status: ${STATUS_LABELS[state.status]}. Datum i simuleringen: ${state.simDate}. Ansökningsdag: ${state.applicationDate}.`,
    `Tidsfrist: ${deadline.label}. ${deadline.detail}`,
  ];

  const facts = Object.entries(caseFacts(caseFile, state));
  if (facts.length > 0) {
    head.push(
      `Fakta och planbestämmelser:\n${list(facts.map(([k, v]) => `${factLabel(k)}: ${factValue(v)}`))}`,
    );
  }
  const lawRefs = caseLawRefs(caseFile, state);
  if (lawRefs.length > 0)
    head.push(`Lagrum som ärendet tar upp (fliken Uppslag): ${lawRefs.join(', ')}`);

  const overview = stepOverview(caseFile, state);
  const done = overview.filter((o) => o.result !== null);
  if (done.length > 0) {
    head.push(
      `Avklarade steg:\n${list(done.map((o) => `${o.step.rubrik}: ${o.result ? stepResultLabel(o.result) : ''}`))}`,
    );
  }
  if (currentStep) {
    const index = state.queue.indexOf(currentStep.id);
    head.push(
      `Aktuellt steg${index >= 0 ? ` (${index + 1} av ${state.queue.length})` : ''}: ${stepBody(currentStep).join('\n')}`,
    );
  } else if (state.currentIndex >= state.queue.length) {
    head.push('Alla steg i ärendet är klara.');
  }

  const recent = diary(state).slice(-8);
  if (recent.length > 0) {
    head.push(`Senaste i diariet:\n${list(recent.map((e) => `${e.date}: ${e.text}`))}`);
  }

  if (options.draft && !decision) {
    head.push(`Hennes beslutsutkast (inte inlämnat):\n${describeDraft(options.draft).join('\n')}`);
  }
  if (decision) {
    head.push(
      `Hennes inlämnade beslut (${decision.date}):\n${describeDraft(decision.draft).join('\n')}`,
    );
  }
  if (withKey) head.push(answerKeyForDecision(caseFile, decision).join('\n'));

  const notes = options.notes?.trim() ?? '';
  if (notes !== '') head.push(`Hennes anteckningar:\n${clipText(notes, 1500)}`);
  if (withKey && options.modelDecisionText) {
    head.push(`Modellbeslut:\n${clipText(options.modelDecisionText, 3000)}`);
  }

  const docs: DocumentPart[] = visibleDocuments(caseFile, state).map(
    ({ document, receivedDate }) => {
      const heading = `### ${document.id} ${document.titel} (${document.typ}, inkom ${receivedDate})`;
      const text = options.documentTexts?.[document.id];
      const factsText = document.fakta
        ? ` Uppgifter ur handlingen: ${Object.entries(document.fakta)
            .map(([k, v]) => `${factLabel(k)}: ${factValue(v)}`)
            .join('; ')}.`
        : '';
      return {
        heading,
        text:
          text !== undefined && text.trim() !== ''
            ? text.trim()
            : `(Ritning eller bild som visas i handlingsvisaren; ingen text.${factsText})`,
      };
    },
  );

  const headText = head.join('\n\n');
  const docsTitle = '\n\nHandlingar som hon kan se:\n';
  const budget = maxChars - headText.length - docsTitle.length;
  const docsText =
    docs.length > 0 && budget > 200 ? docsTitle + fitDocuments(docs, budget).join('\n\n') : '';
  const text = clipText(headText + docsText, maxChars);

  return {
    key: `${withKey ? 'decision' : 'case'}:${caseFile.id}`,
    kind: withKey ? 'decision' : 'case',
    title: `${caseFile.id} ${caseFile.titel}`,
    text,
    answered: withKey,
  };
}

/* -------------------------------------------------------------------------- general */

/** What Hem knows about her studies, for a question that is not about one item. */
export interface StudyStatus {
  modules: readonly {
    title: string;
    /** 0..100 */
    mastery: number;
    questionCount: number;
    /** Questions answered at least once. */
    seen: number;
    /** Questions due for repetition now. */
    due: number;
  }[];
  streakDays: number;
  /** The case in progress, e.g. "A002 Tillbyggnad Björken 7", or null. */
  ongoingCase: string | null;
}

/**
 * Context for "Fråga handledaren" on Hem: her study status, so the tutor can suggest what
 * to repeat or quiz her on a module. Holds no answer key.
 */
export function buildGeneralContext(status: StudyStatus): TutorContext {
  const modules = status.modules.filter((m) => m.questionCount > 0);
  const due = modules.reduce((sum, m) => sum + m.due, 0);
  const lines: string[] = [
    'Hon är på startsidan i studieappen och har ingen särskild fråga öppen.',
  ];
  if (modules.length > 0) {
    lines.push(
      '',
      'Behärskning per modul (räknas på repetitionsdata, 100 % = hon kan frågorna flera veckor framåt):',
      list(
        modules.map(
          (m) =>
            `${m.title}: ${m.seen === 0 ? 'inte påbörjad' : `${m.mastery} %`}, ${m.seen} av ${m.questionCount} frågor besvarade, ${m.due} väntar på repetition`,
        ),
      ),
    );
  }
  lines.push(
    '',
    `Frågor som väntar på repetition i dag: ${due}.`,
    `Streak: ${status.streakDays} ${status.streakDays === 1 ? 'dag' : 'dagar'} i rad med minst ett pass.`,
    status.ongoingCase ? `Pågående ärende: ${status.ongoingCase}.` : 'Inget pågående ärende.',
  );
  return {
    key: 'general:home',
    kind: 'general',
    title: 'Dina studier',
    text: clipText(lines.join('\n'), MAX_CONTEXT_CHARS),
    answered: false,
  };
}
