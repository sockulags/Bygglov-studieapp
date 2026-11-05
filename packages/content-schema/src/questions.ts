import { z } from 'zod';
import { fieldError, identifier, lawRefs, moduleId, reviewFields, tags, text } from './common';

/** Marker for a gap in `lucktext` questions: three or more underscores. */
export const GAP_PATTERN = /_{3,}/g;

export const QUESTION_TYPES = [
  'flerval',
  'flersvar',
  'sant_falskt',
  'lucktext',
  'para_ihop',
  'ordning',
  'berakning',
  'oppen',
  'ritning',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ChoiceSchema = z.strictObject({
  text,
  ratt: z.boolean({ error: fieldError('ratt ska vara true eller false.') }).default(false),
  /** Optional explanation for this particular alternative. */
  forklaring: text.optional(),
});

const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)], {
  error: fieldError('svarighet ska vara 1, 2 eller 3.'),
});

/** Fields shared by every question type. */
const questionBase = {
  id: identifier,
  svarighet: difficulty,
  fraga: text,
  forklaring: text,
  lagrum: lawRefs.default([]),
  taggar: tags.default([]),
  ...reviewFields,
};

const choices = (min: number) =>
  z
    .array(ChoiceSchema, { error: fieldError('alternativ ska vara en lista.') })
    .min(min, { error: fieldError(`Det behövs minst ${min} alternativ.`) });

export const MultipleChoiceQuestionSchema = z
  .strictObject({ ...questionBase, typ: z.literal('flerval'), alternativ: choices(2) })
  .refine((q) => q.alternativ.filter((a) => a.ratt).length === 1, {
    error: fieldError(
      'En flervalsfråga ska ha exakt ett alternativ med ratt: true. Använd typ: flersvar för flera rätta.',
    ),
    path: ['alternativ'],
  });

export const MultipleAnswerQuestionSchema = z
  .strictObject({ ...questionBase, typ: z.literal('flersvar'), alternativ: choices(2) })
  .refine((q) => q.alternativ.some((a) => a.ratt), {
    error: fieldError('Minst ett alternativ måste ha ratt: true.'),
    path: ['alternativ'],
  });

export const TrueFalseQuestionSchema = z.strictObject({
  ...questionBase,
  typ: z.literal('sant_falskt'),
  svar: z.boolean({ error: fieldError('svar ska vara true (sant) eller false (falskt).') }),
});

/** One gap answer: a single accepted answer or a list of accepted alternatives. */
const gapAnswer = z.union(
  [
    z.number().transform(String),
    text,
    z.array(z.union([z.number().transform(String), text])).min(1),
  ],
  {
    error: fieldError(
      'Varje lucka ska ha ett svar (text eller tal) eller en lista med godtagbara svar.',
    ),
  },
);

export const ClozeQuestionSchema = z
  .strictObject({
    ...questionBase,
    typ: z.literal('lucktext'),
    /** One entry per `___` in `fraga`, in order. */
    svar: z
      .array(gapAnswer, {
        error: fieldError('svar ska vara en lista, ett svar per lucka, t.ex. ["10", "10"].'),
      })
      .min(1, { error: fieldError('Det behövs minst ett svar.') }),
    /** Numeric tolerance applied to answers that are numbers. */
    tolerans: z
      .number({ error: fieldError('tolerans ska vara ett tal.') })
      .nonnegative()
      .optional(),
    skiftlageskanslig: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    const gaps = q.fraga.match(GAP_PATTERN)?.length ?? 0;
    if (gaps !== q.svar.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['svar'],
        message: `Frågetexten har ${gaps} luckor (___) men svar har ${q.svar.length} rader. De måste vara lika många.`,
      });
    }
  });

export const MatchingQuestionSchema = z.strictObject({
  ...questionBase,
  typ: z.literal('para_ihop'),
  par: z
    .array(z.strictObject({ vanster: text, hoger: text }), {
      error: fieldError('par ska vara en lista med { vanster, hoger }.'),
    })
    .min(2, { error: fieldError('Det behövs minst 2 par.') }),
});

export const OrderingQuestionSchema = z.strictObject({
  ...questionBase,
  typ: z.literal('ordning'),
  /** Items in the correct order; the app shuffles them. */
  poster: z
    .array(text, { error: fieldError('poster ska vara en lista i rätt ordning.') })
    .min(2, { error: fieldError('Det behövs minst 2 poster att ordna.') }),
});

export const CalculationQuestionSchema = z.strictObject({
  ...questionBase,
  typ: z.literal('berakning'),
  svar: z.number({
    error: fieldError('svar ska vara ett tal, t.ex. 138 eller 4.9 (punkt som decimaltecken).'),
  }),
  tolerans: z
    .number({ error: fieldError('tolerans ska vara ett tal.') })
    .nonnegative()
    .default(0),
  enhet: text.optional(),
  /** Worked solution shown after answering. */
  losning: text.optional(),
});

export const OpenQuestionSchema = z.strictObject({
  ...questionBase,
  typ: z.literal('oppen'),
  forklaring: text.optional(),
  bedomningspunkter: z
    .array(text, { error: fieldError('bedomningspunkter ska vara en lista.') })
    .min(1, { error: fieldError('En öppen fråga behöver minst en bedömningspunkt.') }),
  modellsvar: text.optional(),
});

export const DrawingQuestionSchema = z
  .strictObject({
    ...questionBase,
    typ: z.literal('ritning'),
    /** Drawing file, relative to the content folder. */
    fil: text,
    bild_text: text.optional(),
    svar: z.number({ error: fieldError('svar ska vara ett tal.') }).optional(),
    tolerans: z
      .number({ error: fieldError('tolerans ska vara ett tal.') })
      .nonnegative()
      .default(0),
    enhet: text.optional(),
    bedomningspunkter: z.array(text).min(1).optional(),
  })
  .refine((q) => q.svar !== undefined || q.bedomningspunkter !== undefined, {
    error: fieldError(
      'En ritningsfråga behöver svar (för automatisk rättning) eller bedomningspunkter (för självrättning).',
    ),
    path: ['svar'],
  });

export const QuestionSchema = z.discriminatedUnion(
  'typ',
  [
    MultipleChoiceQuestionSchema,
    MultipleAnswerQuestionSchema,
    TrueFalseQuestionSchema,
    ClozeQuestionSchema,
    MatchingQuestionSchema,
    OrderingQuestionSchema,
    CalculationQuestionSchema,
    OpenQuestionSchema,
    DrawingQuestionSchema,
  ],
  {
    error: fieldError(
      `typ saknas eller är okänd. Tillåtna frågetyper: ${QUESTION_TYPES.join(', ')}.`,
    ),
  },
);

export const QuestionFileSchema = z
  .strictObject({
    modul: moduleId,
    fragor: z.array(QuestionSchema, { error: fieldError('fragor ska vara en lista med frågor.') }),
  })
  .superRefine((file, ctx) => {
    const seen = new Map<string, number>();
    file.fragor.forEach((question, index) => {
      const first = seen.get(question.id);
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['fragor', index, 'id'],
          message: `Fråge-id "${question.id}" används redan av fråga nr ${first + 1} i filen.`,
        });
      } else {
        seen.set(question.id, index);
      }
    });
  });

export type Choice = z.output<typeof ChoiceSchema>;
export type MultipleChoiceQuestion = z.output<typeof MultipleChoiceQuestionSchema>;
export type MultipleAnswerQuestion = z.output<typeof MultipleAnswerQuestionSchema>;
export type TrueFalseQuestion = z.output<typeof TrueFalseQuestionSchema>;
export type ClozeQuestion = z.output<typeof ClozeQuestionSchema>;
export type MatchingQuestion = z.output<typeof MatchingQuestionSchema>;
export type OrderingQuestion = z.output<typeof OrderingQuestionSchema>;
export type CalculationQuestion = z.output<typeof CalculationQuestionSchema>;
export type OpenQuestion = z.output<typeof OpenQuestionSchema>;
export type DrawingQuestion = z.output<typeof DrawingQuestionSchema>;
export type Question = z.output<typeof QuestionSchema>;
export type QuestionFile = z.output<typeof QuestionFileSchema>;
export type QuestionFileInput = z.input<typeof QuestionFileSchema>;

/**
 * Where `content:build` publishes the drawing of a `ritning` question, relative to the app's
 * `public/content/`: `fragor/<modul>/<fråge-id>.<ändelse>`. The question id is unique across
 * all content, so two questions that show different files with the same name never collide.
 */
export function questionDrawingPath(
  moduleId: string,
  question: Pick<DrawingQuestion, 'id' | 'fil'>,
): string {
  const extension = /\.[a-z0-9]+$/i.exec(question.fil)?.[0].toLowerCase() ?? '';
  return `fragor/${moduleId}/${question.id}${extension}`;
}
