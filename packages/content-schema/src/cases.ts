import { z } from 'zod';
import {
  fieldError,
  identifier,
  isoDate,
  jsonRecord,
  lawRefs,
  moduleId,
  nonNegativeNumber,
  reviewFields,
  text,
  wholeDays,
} from './common';
import { ChoiceSchema } from './questions';

export const DECISION_OUTCOMES = [
  'bevilja',
  'bevilja_med_villkor',
  'avsla',
  'avvisa',
  'avskriva',
] as const;

export const decisionOutcome = z.enum(DECISION_OUTCOMES, {
  error: fieldError(`Okänt beslut. Tillåtna värden: ${DECISION_OUTCOMES.join(', ')}.`),
});

export type DecisionOutcome = z.output<typeof decisionOutcome>;

export const STEP_TYPES = [
  'checklista',
  'fraga',
  'berakning',
  'urval',
  'skrivelse',
  'beslut',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Common document kinds. Other snake_case kinds are allowed too. */
export const KNOWN_DOCUMENT_TYPES = [
  'ansokan',
  'situationsplan',
  'fasadritning',
  'planritning',
  'sektionsritning',
  'planbestammelser',
  'anmalan_ka',
  'kontrollplan',
  'grannyttrande',
  'remissvar',
  'foto',
  'skrivelse',
  'ovrigt',
] as const;

/** Path inside the case folder, e.g. `handlingar/ansokan.pdf`. */
const caseFilePath = text
  .refine((p) => !p.startsWith('/') && !p.split(/[\\/]/).includes('..'), {
    error: fieldError('Sökvägen ska vara relativ till ärendemappen, t.ex. handlingar/ansokan.pdf.'),
  })
  .refine((p) => p.startsWith('handlingar/'), {
    error: fieldError(
      'Filer i ett ärende ska ligga i mappen handlingar/, t.ex. handlingar/ansokan.pdf.',
    ),
  });

const bulletList = (what: string) =>
  z
    .array(text, { error: fieldError(`${what} ska vara en lista.`) })
    .min(1, { error: fieldError(`${what} behöver minst en punkt.`) });

export const CaseDocumentSchema = z.strictObject({
  id: identifier,
  typ: z
    .string({ error: fieldError('typ ska vara en text, t.ex. situationsplan.') })
    .regex(/^[a-z][a-z0-9_]*$/, {
      error: fieldError(
        `typ ska skrivas med gemener och _, t.ex. ${KNOWN_DOCUMENT_TYPES.slice(0, 4).join(', ')}.`,
      ),
    }),
  titel: text,
  fil: caseFilePath,
  /** Arrival date in the simulation. Missing means "the date the revealing event fires". */
  inkom: isoDate.optional(),
  /** Hidden until the event with this id has fired. */
  dold_tills: identifier.optional(),
  /** Parameters for generated drawings. */
  parametrar: jsonRecord.optional(),
  /** Facts the case engine and assessment can read (plan regulations, measures). */
  fakta: jsonRecord.optional(),
});

/**
 * Grounds for letting a permit case rest (vilande) under 9 kap. 102 § första stycket PBL:
 * 1 strandskydd (a pending shore protection exemption), 2 expropriation, 3 planarbete.
 */
export const SUSPENSION_REASONS = ['strandskydd', 'expropriation', 'planarbete'] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export const suspensionReason = z.enum(SUSPENSION_REASONS, {
  error: fieldError(
    `vilande ska vara ${SUSPENSION_REASONS.join(', ')} (9 kap. 102 § första stycket 1–3).`,
  ),
});

const stepBase = {
  id: identifier,
  rubrik: text,
  instruktion: text.optional(),
  forklaring: text.optional(),
  lagrum: lawRefs.optional(),
  /** Simulated days that pass when the step is completed. */
  tid_framat_dagar: wholeDays.optional(),
  /**
   * The case is declared resting (9 kap. 102 §) when the step is completed and not missed,
   * i.e. when the learner chose to let it rest. Ends with an event's `vilande_upphor`.
   */
  vilande: suspensionReason.optional(),
};

export const ChecklistStepSchema = z.strictObject({
  ...stepBase,
  typ: z.literal('checklista'),
  poster: z
    .array(
      z.strictObject({
        text,
        finns: z.boolean({ error: fieldError('finns ska vara true eller false.') }),
        kommentar: text.optional(),
      }),
      { error: fieldError('poster ska vara en lista.') },
    )
    .min(1, { error: fieldError('En checklista behöver minst en post.') }),
});

export const STEP_QUESTION_TYPES = ['flerval', 'flersvar', 'sant_falskt', 'oppen'] as const;

export const QuestionStepSchema = z
  .strictObject({
    ...stepBase,
    typ: z.literal('fraga'),
    fragetyp: z.enum(STEP_QUESTION_TYPES, {
      error: fieldError(`fragetyp ska vara en av: ${STEP_QUESTION_TYPES.join(', ')}.`),
    }),
    fraga: text,
    alternativ: z
      .array(ChoiceSchema, { error: fieldError('alternativ ska vara en lista.') })
      .optional(),
    svar: z.boolean({ error: fieldError('svar ska vara true eller false.') }).optional(),
    bedomningspunkter: bulletList('bedomningspunkter').optional(),
    modellsvar: text.optional(),
  })
  .superRefine((step, ctx) => {
    const correct = step.alternativ?.filter((a) => a.ratt).length ?? 0;
    switch (step.fragetyp) {
      case 'flerval':
      case 'flersvar':
        if (!step.alternativ || step.alternativ.length < 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['alternativ'],
            message: `fragetyp ${step.fragetyp} behöver minst 2 alternativ.`,
          });
        } else if (step.fragetyp === 'flerval' && correct !== 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['alternativ'],
            message: `fragetyp flerval ska ha exakt ett alternativ med ratt: true (nu ${correct}).`,
          });
        } else if (step.fragetyp === 'flersvar' && correct < 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['alternativ'],
            message: 'fragetyp flersvar behöver minst ett alternativ med ratt: true.',
          });
        }
        break;
      case 'sant_falskt':
        if (step.svar === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['svar'],
            message: 'fragetyp sant_falskt behöver svar: true eller false.',
          });
        }
        break;
      case 'oppen':
        if (!step.bedomningspunkter) {
          ctx.addIssue({
            code: 'custom',
            path: ['bedomningspunkter'],
            message: 'fragetyp oppen behöver bedomningspunkter.',
          });
        }
        break;
    }
  });

export const CalculationItemSchema = z.strictObject({
  id: identifier,
  text,
  svar: z.number({
    error: fieldError('svar ska vara ett tal (punkt som decimaltecken, t.ex. 4.9).'),
  }),
  tolerans: nonNegativeNumber.default(0),
  enhet: text.optional(),
});

export const CalculationStepSchema = z.strictObject({
  ...stepBase,
  typ: z.literal('berakning'),
  fragor: z
    .array(CalculationItemSchema, {
      error: fieldError('fragor ska vara en lista med beräkningar.'),
    })
    .min(1, { error: fieldError('Ett beräkningssteg behöver minst en fråga.') }),
});

export const SelectionStepSchema = z.strictObject({
  ...stepBase,
  typ: z.literal('urval'),
  alternativ: z
    .array(
      z.strictObject({
        text,
        ratt: z.boolean({ error: fieldError('ratt ska vara true eller false.') }),
        kommentar: text.optional(),
      }),
      { error: fieldError('alternativ ska vara en lista.') },
    )
    .min(2, { error: fieldError('Ett urval behöver minst 2 alternativ.') }),
});

export const WritingStepSchema = z.strictObject({
  ...stepBase,
  typ: z.literal('skrivelse'),
  bedomningspunkter: bulletList('bedomningspunkter'),
  /**
   * The letter is an injunction (föreläggande). Its kind for `om_forelagt` is the word
   * after "om" in the heading ("Skriv föreläggande om komplettering" → komplettering).
   */
  ar_forelaggande: z
    .boolean({ error: fieldError('ar_forelaggande ska vara true eller false.') })
    .optional(),
  /** Model text (Markdown) inside the case folder. */
  modelltext: caseFilePath.optional(),
});

/** An outcome that is also accepted, with a short reason shown in the assessment. */
export const AcceptableOutcomeSchema = z.strictObject({
  utfall: decisionOutcome,
  motivering: text,
});

export const DecisionStepSchema = z.strictObject({
  ...stepBase,
  typ: z.literal('beslut'),
  forvantat_beslut: decisionOutcome,
  /** Other outcomes that are accepted too (e.g. a voluntary permit instead of avskrivning). */
  godtagbara_utfall: z
    .array(AcceptableOutcomeSchema, {
      error: fieldError('godtagbara_utfall ska vara en lista med utfall och motivering.'),
    })
    .optional(),
  bedomningspunkter: bulletList('bedomningspunkter'),
  /** Model decision (Markdown) inside the case folder. */
  modellbeslut: caseFilePath.optional(),
});

export const CaseStepSchema = z.discriminatedUnion(
  'typ',
  [
    ChecklistStepSchema,
    QuestionStepSchema,
    CalculationStepSchema,
    SelectionStepSchema,
    WritingStepSchema,
    DecisionStepSchema,
  ],
  { error: fieldError(`typ saknas eller är okänd. Tillåtna stegtyper: ${STEP_TYPES.join(', ')}.`) },
);

export const EVENT_TRIGGER_KEYS = [
  'efter_steg',
  'vid_beslut',
  'om_missat',
  'om_forelagt',
  'slump',
] as const;

/**
 * When an event fires. All given conditions must hold, e.g.
 * `{ vid_beslut: bevilja, om_missat: S5 }`.
 */
export const EventTriggerSchema = z
  .strictObject({
    /** After this step is completed. */
    efter_steg: identifier.optional(),
    /** When the decision has this outcome. */
    vid_beslut: decisionOutcome.optional(),
    /** If this step was skipped or never done. */
    om_missat: identifier.optional(),
    /** If the student issued this kind of injunction, e.g. `komplettering`. */
    om_forelagt: text.optional(),
    /** Probability 0–1. */
    slump: z
      .number({ error: fieldError('slump ska vara en sannolikhet mellan 0 och 1, t.ex. 0.3.') })
      .gt(0, { error: fieldError('slump ska vara större än 0.') })
      .max(1, { error: fieldError('slump får inte vara större än 1.') })
      .optional(),
  })
  .refine((t) => EVENT_TRIGGER_KEYS.some((key) => t[key] !== undefined), {
    error: fieldError(`utlosare behöver minst ett villkor: ${EVENT_TRIGGER_KEYS.join(', ')}.`),
  });

export const EVENT_EFFECT_KEYS = [
  'visa_handlingar',
  'tid_framat_dagar',
  'meddelande',
  'satt_komplett_datum',
  'ny_fristdag',
  'vilande',
  'vilande_upphor',
  'andrade_fakta',
  'nytt_steg',
] as const;

/** Why the ten-week clock restarts (`ny_fristdag`). */
export const NEW_DEADLINE_START_REASONS = [
  'sokandens_initiativ',
  'ansokan_om_lov_i_efterhand',
] as const;

export const EventEffectSchema = z
  .strictObject({
    /** Documents that appear in the diary (marked NY). */
    visa_handlingar: z
      .array(identifier, {
        error: fieldError('visa_handlingar ska vara en lista med handlings-id.'),
      })
      .optional(),
    tid_framat_dagar: wholeDays.optional(),
    meddelande: text.optional(),
    /** The application counts as complete from the event date (starts the 10-week clock). */
    satt_komplett_datum: z
      .boolean({ error: fieldError('satt_komplett_datum ska vara true eller false.') })
      .optional(),
    /**
     * The ten-week clock (9 kap. 99 § första stycket 2 PBL) restarts on the event date:
     * `sokandens_initiativ` means the applicant, on their own initiative, handed in more
     * material or changed the application that day. `ansokan_om_lov_i_efterhand` is for
     * supervision cases (nivå 4), which have no deadline until an application for a
     * retroactive permit comes in; the ten weeks then run from that day (första stycket 1).
     */
    ny_fristdag: z
      .enum(NEW_DEADLINE_START_REASONS, {
        error: fieldError(
          `ny_fristdag ska vara ${NEW_DEADLINE_START_REASONS.join(' eller ')} (9 kap. 99 § första stycket 1–2).`,
        ),
      })
      .optional(),
    /** The case is declared resting (9 kap. 102 §) from the event date. */
    vilande: suspensionReason.optional(),
    /**
     * The question the case rested for has been decided (e.g. the shore protection
     * decision came in): the resting ends on the event date and the deadline runs again.
     */
    vilande_upphor: z
      .boolean({ error: fieldError('vilande_upphor ska vara true eller false.') })
      .optional(),
    /** Changed facts, e.g. a revised building height. */
    andrade_fakta: jsonRecord.optional(),
    /** A step inserted after the current one. */
    nytt_steg: CaseStepSchema.optional(),
  })
  .refine((e) => EVENT_EFFECT_KEYS.some((key) => e[key] !== undefined), {
    error: fieldError(`effekt behöver minst en verkan: ${EVENT_EFFECT_KEYS.join(', ')}.`),
  });

export const CaseEventSchema = z.strictObject({
  id: identifier,
  namn: text,
  utlosare: EventTriggerSchema,
  effekt: EventEffectSchema,
});

export const CaseFacitSchema = z.strictObject({
  sammanfattning: text.optional(),
  vanliga_fel: z.array(text, { error: fieldError('vanliga_fel ska vara en lista.') }).optional(),
  modellbeslut: caseFilePath.optional(),
});

const nameList = (what: string) =>
  z
    .array(text, { error: fieldError(`${what} ska vara en lista med namn.`) })
    .min(1, { error: fieldError(`${what} behöver minst ett namn.`) });

/**
 * The parties of the case, used to recognise recipients in the decision's expediering by
 * name, e.g. "Maria och Jonas Lindqvist" or "Ägarna till Strandvik 1:5, 1:3 och 1:1".
 */
export const CasePartiesSchema = z.strictObject({
  sokande: nameList('sokande').optional(),
  fastighetsagare: nameList('fastighetsagare').optional(),
  grannar: z
    .array(
      z.strictObject({
        /** Property designation, e.g. "Strandvik 1:5". */
        fastighet: text,
        /** Owners (and holders of special rights) of that property. */
        namn: nameList('namn'),
      }),
      { error: fieldError('grannar ska vara en lista med fastighet och namn.') },
    )
    .optional(),
});

export const CaseFileSchema = z
  .strictObject({
    id: z.string({ error: fieldError('Ärende-id ska vara en text.') }).regex(/^A\d{3}$/, {
      error: fieldError('Ärende-id ska ha formatet A + tre siffror, t.ex. A002.'),
    }),
    titel: text,
    niva: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
      error: fieldError('niva ska vara 1 (grund), 2 (normal), 3 (avancerad) eller 4 (tillsyn).'),
    }),
    ...reviewFields,
    fastighet: text,
    sammanfattning: text,
    startdatum: isoDate,
    /** Modules the case trains, for linking from the study view. */
    moduler: z
      .array(moduleId, { error: fieldError('moduler ska vara en lista med modul-id.') })
      .optional(),
    larandemal: bulletList('larandemal'),
    /** Simplified fictitious fee schedule: name -> amount (SEK) or factor. */
    taxa: z.record(
      z.string(),
      z.number({ error: fieldError('Varje post i taxa ska vara ett tal.') }),
      {
        error: fieldError('taxa ska vara en samling post: belopp.'),
      },
    ),
    handlingar: z
      .array(CaseDocumentSchema, { error: fieldError('handlingar ska vara en lista.') })
      .min(1, { error: fieldError('Ett ärende behöver minst en handling.') }),
    steg: z
      .array(CaseStepSchema, { error: fieldError('steg ska vara en lista.') })
      .min(1, { error: fieldError('Ett ärende behöver minst ett steg.') }),
    handelser: z
      .array(CaseEventSchema, { error: fieldError('handelser ska vara en lista.') })
      .default([]),
    /** Applicants, owners and neighbours by name (optional). */
    parter: CasePartiesSchema.optional(),
    facit: CaseFacitSchema.optional(),
  })
  .superRefine((c, ctx) => {
    for (const issue of findCaseReferenceIssues(c)) ctx.addIssue({ code: 'custom', ...issue });
    for (const issue of findCaseTemplateIssues(c)) ctx.addIssue({ code: 'custom', ...issue });
  });

export type CaseDocument = z.output<typeof CaseDocumentSchema>;
export type ChecklistStep = z.output<typeof ChecklistStepSchema>;
export type QuestionStep = z.output<typeof QuestionStepSchema>;
export type CalculationItem = z.output<typeof CalculationItemSchema>;
export type CalculationStep = z.output<typeof CalculationStepSchema>;
export type SelectionStep = z.output<typeof SelectionStepSchema>;
export type WritingStep = z.output<typeof WritingStepSchema>;
export type DecisionStep = z.output<typeof DecisionStepSchema>;
export type AcceptableOutcome = z.output<typeof AcceptableOutcomeSchema>;
export type CaseStep = z.output<typeof CaseStepSchema>;
export type EventTrigger = z.output<typeof EventTriggerSchema>;
export type EventEffect = z.output<typeof EventEffectSchema>;
export type CaseEvent = z.output<typeof CaseEventSchema>;
export type CaseFacit = z.output<typeof CaseFacitSchema>;
export type CaseParties = z.output<typeof CasePartiesSchema>;
export type CaseFile = z.output<typeof CaseFileSchema>;
export type CaseFileInput = z.input<typeof CaseFileSchema>;

/* ------------------------------------------------------------------ template variables */

/**
 * Template variables (mallvariabler) in step texts, event messages and Markdown documents,
 * written `{{namn}}`. The engine and the case view replace them with dates from the case
 * state when the text is shown, so a text can depend on when the learner decided.
 *
 * - `{{namn+N}}` / `{{namn-N}}`: N calendar days later / earlier.
 * - `|iso` gives `2026-10-14` instead of `14 oktober 2026`.
 * - `|vardag` moves a Saturday, Sunday or public holiday (and midsommarafton, julafton and
 *   nyårsafton) to the next weekday, as for a last day under 2 § lagen (1930:173) om
 *   beräkning av lagstadgad tid. Filters can be combined: `{{kungorelsedatum+28|vardag|iso}}`.
 */
export const TEMPLATE_VARIABLES = {
  simdatum: 'Dagens datum i ärendets kalender (för ett meddelande: dagen då händelsen inträffar)',
  ansokningsdatum: 'Ansökningsdagen (ärendets startdatum)',
  beslutsdatum: 'Dagen då beslutet i ärendet fattades',
  kungorelsedatum:
    'Dagen då beslutet kungjordes på kommunens anslagstavla (i simuleringen två dagar efter beslutet)',
  frist: 'Sista dagen för beslut enligt 9 kap. 99 § som den ser ut just nu',
  inkomdatum: 'Dagen då handlingen kom in (bara i handlingar och meddelanden)',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
export const TEMPLATE_FILTERS = ['iso', 'vardag'] as const;
export type TemplateFilter = (typeof TEMPLATE_FILTERS)[number];

/**
 * `{{ namn +N | filter | filter }}`; groups: name, sign, days, filters. Inside a Markdown
 * table the pipe may be escaped: `{{beslutsdatum\\|iso}}`.
 */
export const TEMPLATE_PATTERN =
  /\{\{\s*([a-z_]+)\s*(?:([+-])\s*(\d+)\s*)?((?:\\?\|\s*[a-z]+\s*)*)\}\}/g;

export interface TemplateReference {
  /** The whole `{{…}}`. */
  raw: string;
  name: string;
  /** Days to add (negative to subtract). */
  offset: number;
  filters: string[];
}

/** The template references in a text, in order. */
export function templateReferences(source: string): TemplateReference[] {
  return [...source.matchAll(TEMPLATE_PATTERN)].map((m) => ({
    raw: m[0],
    name: m[1] ?? '',
    offset: (m[2] === '-' ? -1 : 1) * Number(m[3] ?? 0),
    filters: (m[4] ?? '')
      .split('|')
      .map((f) => f.replace(/\\$/, '').trim())
      .filter((f) => f !== ''),
  }));
}

/** Swedish problems with the template references in a text (unknown names or filters). */
export function templateProblems(
  source: string,
  allowed: readonly string[] = Object.keys(TEMPLATE_VARIABLES),
): string[] {
  const problems: string[] = [];
  for (const ref of templateReferences(source)) {
    if (!allowed.includes(ref.name)) {
      problems.push(
        `Okänd mallvariabel ${ref.raw}. Tillåtna här: ${allowed.map((n) => `{{${n}}}`).join(', ')}.`,
      );
    }
    for (const filter of ref.filters) {
      if (!(TEMPLATE_FILTERS as readonly string[]).includes(filter)) {
        problems.push(
          `Okänt filter |${filter} i ${ref.raw}. Tillåtna filter: ${TEMPLATE_FILTERS.join(', ')}.`,
        );
      }
    }
  }
  const unclosed = source.replace(TEMPLATE_PATTERN, '');
  if (/\{\{|\}\}/.test(unclosed)) {
    problems.push('En mallvariabel är felskriven. Skriv den som {{namn}}, t.ex. {{beslutsdatum}}.');
  }
  return problems;
}

/** Variables that make sense in step texts (a step is not a received document). */
const STEP_TEMPLATE_VARIABLES = Object.keys(TEMPLATE_VARIABLES).filter((n) => n !== 'inkomdatum');

function collectStrings(
  value: unknown,
  path: (string | number)[],
  out: { path: (string | number)[]; text: string }[],
): void {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, [...path, i], out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) collectStrings(v, [...path, key], out);
  }
}

/** Template problems in the step texts and event messages of a case. */
export function findCaseTemplateIssues(
  c: Pick<CaseFile, 'steg' | 'handelser'>,
): { path: (string | number)[]; message: string }[] {
  const strings: { path: (string | number)[]; text: string; allowed: readonly string[] }[] = [];
  const push = (value: unknown, path: (string | number)[], allowed: readonly string[]) => {
    const found: { path: (string | number)[]; text: string }[] = [];
    collectStrings(value, path, found);
    for (const f of found) strings.push({ ...f, allowed });
  };
  c.steg.forEach((step, i) => push(step, ['steg', i], STEP_TEMPLATE_VARIABLES));
  c.handelser.forEach((event, i) => {
    if (event.effekt.meddelande !== undefined) {
      push(
        event.effekt.meddelande,
        ['handelser', i, 'effekt', 'meddelande'],
        Object.keys(TEMPLATE_VARIABLES),
      );
    }
    if (event.effekt.nytt_steg) {
      push(
        event.effekt.nytt_steg,
        ['handelser', i, 'effekt', 'nytt_steg'],
        STEP_TEMPLATE_VARIABLES,
      );
    }
  });
  return strings.flatMap(({ path, text: source, allowed }) =>
    templateProblems(source, allowed).map((message) => ({ path, message })),
  );
}

/** Every step in the case, including steps that events insert. */
export function allCaseSteps(c: Pick<CaseFile, 'steg' | 'handelser'>): CaseStep[] {
  const inserted = c.handelser.flatMap((e) => (e.effekt.nytt_steg ? [e.effekt.nytt_steg] : []));
  return [...c.steg, ...inserted];
}

interface ReferenceIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Cross-reference checks within one case: unique ids, and that every referenced step,
 * document and event exists.
 */
export function findCaseReferenceIssues(
  c: Pick<CaseFile, 'handlingar' | 'steg' | 'handelser'>,
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];

  const checkUnique = (ids: { id: string; path: (string | number)[] }[], what: string) => {
    const seen = new Set<string>();
    for (const { id, path } of ids) {
      if (seen.has(id))
        issues.push({ path, message: `${what}-id "${id}" används mer än en gång.` });
      seen.add(id);
    }
    return seen;
  };

  const documentIds = checkUnique(
    c.handlingar.map((h, i) => ({ id: h.id, path: ['handlingar', i, 'id'] })),
    'Handlings',
  );
  const stepIds = checkUnique(
    [
      ...c.steg.map((s, i) => ({ id: s.id, path: ['steg', i, 'id'] })),
      ...c.handelser.flatMap((e, i) =>
        e.effekt.nytt_steg
          ? [{ id: e.effekt.nytt_steg.id, path: ['handelser', i, 'effekt', 'nytt_steg', 'id'] }]
          : [],
      ),
    ],
    'Steg',
  );
  const eventIds = checkUnique(
    c.handelser.map((e, i) => ({ id: e.id, path: ['handelser', i, 'id'] })),
    'Händelse',
  );

  const list = (ids: Set<string>) => [...ids].join(', ') || '(inga)';

  c.handlingar.forEach((h, i) => {
    if (h.dold_tills !== undefined && !eventIds.has(h.dold_tills)) {
      issues.push({
        path: ['handlingar', i, 'dold_tills'],
        message: `dold_tills pekar på händelsen "${h.dold_tills}", som inte finns. Kända händelser: ${list(eventIds)}.`,
      });
    }
  });

  c.handelser.forEach((e, i) => {
    const { efter_steg, om_missat } = e.utlosare;
    if (efter_steg !== undefined && !stepIds.has(efter_steg)) {
      issues.push({
        path: ['handelser', i, 'utlosare', 'efter_steg'],
        message: `efter_steg pekar på steget "${efter_steg}", som inte finns. Kända steg: ${list(stepIds)}.`,
      });
    }
    if (om_missat !== undefined && !stepIds.has(om_missat)) {
      issues.push({
        path: ['handelser', i, 'utlosare', 'om_missat'],
        message: `om_missat pekar på steget "${om_missat}", som inte finns. Kända steg: ${list(stepIds)}.`,
      });
    }
    e.effekt.visa_handlingar?.forEach((docId, j) => {
      if (!documentIds.has(docId)) {
        issues.push({
          path: ['handelser', i, 'effekt', 'visa_handlingar', j],
          message: `visa_handlingar pekar på handlingen "${docId}", som inte finns. Kända handlingar: ${list(documentIds)}.`,
        });
      }
    });
  });

  return issues;
}
