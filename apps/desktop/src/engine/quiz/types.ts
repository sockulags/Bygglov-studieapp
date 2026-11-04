import type { Question, QuestionType } from '@bygglov/content-schema';

/**
 * A learner's answer. Indices always refer to the order in the content file, never to the
 * shuffled order shown on screen, so answers can be stored and re-graded later.
 */
export type QuizAnswer =
  /** Index of the chosen alternative, or null when nothing was chosen. */
  | { type: 'flerval'; selected: number | null }
  /** Indices of all chosen alternatives. Duplicates and out-of-range indices are ignored. */
  | { type: 'flersvar'; selected: readonly number[] }
  | { type: 'sant_falskt'; value: boolean | null }
  /** One string per gap, in the order the gaps appear in the question text. */
  | { type: 'lucktext'; gaps: readonly string[] }
  /**
   * For each pair (by index in `par`), the index of the pair whose right-hand side the
   * learner matched it with, or null when left unmatched.
   */
  | { type: 'para_ihop'; matches: readonly (number | null)[] }
  /** Indices into `poster` in the order the learner put them. */
  | { type: 'ordning'; order: readonly number[] }
  /** Typed value; strings may use comma or point as decimal separator and carry a unit. */
  | { type: 'berakning'; value: string | number | null }
  /** Free text. Open questions are self-graded, see `gradeSelfAssessment`. */
  | { type: 'oppen'; text: string }
  /** Numeric value for drawings with `svar`, free text for self-graded drawings. */
  | { type: 'ritning'; value?: string | number | null; text?: string };

export type GradeOutcome = 'correct' | 'incorrect' | 'partial';

/** Feedback for one part of an answer (an alternative, a gap, a pair, a position). */
export interface ItemFeedback {
  /** Index of the part in the content file (alternative, gap, pair or item). */
  index: number;
  correct: boolean;
  /** What the learner gave, as display text. */
  given: string | null;
  /** The expected answer, as display text. */
  expected: string;
  /** Per-alternative explanation from the content, when there is one. */
  explanation?: string;
}

/** Fields forwarded from the question so the UI can show them next to the result. */
interface ForwardedContent {
  questionId: string;
  questionType: QuestionType;
  /** The question's `forklaring`; may be missing for open questions. */
  explanation: string | null;
  lawRefs: readonly string[];
  /** True when the content marks the law references as unverified. */
  lawRefsUncertain: boolean;
}

export interface GradedResult extends ForwardedContent {
  kind: 'graded';
  /** 0..1, partial credit where the question type allows it. */
  score: number;
  outcome: GradeOutcome;
  items: ItemFeedback[];
  /** Worked solution (`losning`) for calculations. */
  solution?: string;
  /** True when the score came from the learner ticking assessment criteria. */
  selfAssessed: boolean;
}

export interface SelfGradedResult extends ForwardedContent {
  kind: 'self_graded';
  /** The learner compares their answer with these and ticks the ones they covered. */
  criteria: readonly string[];
  modelAnswer: string | null;
}

export type GradeResult = GradedResult | SelfGradedResult;

export type QuestionOf<T extends QuestionType> = Extract<Question, { typ: T }>;
