import { GAP_PATTERN, type Question } from '@bygglov/content-schema';
import {
  normalizeText,
  numbersMatch,
  parseQuantity,
  unitsCompatible,
  normalizeUnit,
} from './normalize';
import type {
  GradedResult,
  GradeOutcome,
  GradeResult,
  ItemFeedback,
  QuestionOf,
  QuizAnswer,
  SelfGradedResult,
} from './types';

/** Thrown when an answer of one question type is graded against another type. */
export class AnswerTypeMismatchError extends Error {
  constructor(questionType: string, answerType: string) {
    super(`Answer of type "${answerType}" cannot be graded against a "${questionType}" question.`);
    this.name = 'AnswerTypeMismatchError';
  }
}

/** Scores within this distance of 0 or 1 are treated as exactly 0 or 1. */
const EPSILON = 1e-9;

export function outcomeFor(score: number): GradeOutcome {
  if (score >= 1 - EPSILON) return 'correct';
  if (score <= EPSILON) return 'incorrect';
  return 'partial';
}

/**
 * Grades an answer. Every type except `oppen` (and `ritning` without a numeric `svar`) is
 * graded automatically and returns `kind: 'graded'`; those return `kind: 'self_graded'`
 * with the assessment criteria, to be finished with `gradeSelfAssessment`.
 *
 * Scoring rules (all scores 0..1):
 * - flerval, sant_falskt, berakning, numeric ritning: 1 or 0.
 * - flersvar: (right choices picked − wrong choices picked) / number of right choices,
 *   clamped to 0..1. Ticking everything therefore does not pay off.
 * - lucktext: share of gaps answered correctly.
 * - para_ihop: share of pairs matched correctly (compared by text, so identical right-hand
 *   sides are interchangeable).
 * - ordning: (longest run of items in correct relative order − 1) / (n − 1), so one item
 *   in the wrong place costs about 1/(n−1) and a fully reversed list scores 0.
 */
export function grade(question: Question, answer: QuizAnswer): GradeResult {
  if (answer.type !== question.typ) {
    throw new AnswerTypeMismatchError(question.typ, answer.type);
  }
  // The check above guarantees the answer variant matches the question type; TypeScript
  // cannot correlate the two unions, hence the narrowing casts below.
  switch (question.typ) {
    case 'flerval':
      return gradeMultipleChoice(question, answer as Extract<QuizAnswer, { type: 'flerval' }>);
    case 'flersvar':
      return gradeMultipleAnswer(question, answer as Extract<QuizAnswer, { type: 'flersvar' }>);
    case 'sant_falskt':
      return gradeTrueFalse(question, answer as Extract<QuizAnswer, { type: 'sant_falskt' }>);
    case 'lucktext':
      return gradeCloze(question, answer as Extract<QuizAnswer, { type: 'lucktext' }>);
    case 'para_ihop':
      return gradeMatching(question, answer as Extract<QuizAnswer, { type: 'para_ihop' }>);
    case 'ordning':
      return gradeOrdering(question, answer as Extract<QuizAnswer, { type: 'ordning' }>);
    case 'berakning':
      return gradeCalculation(question, answer as Extract<QuizAnswer, { type: 'berakning' }>);
    case 'oppen':
      return selfGraded(question, question.bedomningspunkter, question.modellsvar);
    case 'ritning':
      return gradeDrawing(question, answer as Extract<QuizAnswer, { type: 'ritning' }>);
  }
}

/** True when `grade` returns a self-graded result for this question. */
export function isSelfGraded(question: Question): boolean {
  return question.typ === 'oppen' || (question.typ === 'ritning' && question.svar === undefined);
}

/**
 * Turns a learner's self-assessment of an open (or self-graded drawing) question into a
 * score: the share of assessment criteria they ticked. Indices refer to `criteria`;
 * duplicates and out-of-range indices are ignored.
 */
export function gradeSelfAssessment(
  pending: SelfGradedResult,
  checkedCriteria: readonly number[],
): GradedResult {
  const checked = validIndexSet(checkedCriteria, pending.criteria.length);
  const items: ItemFeedback[] = pending.criteria.map((criterion, index) => ({
    index,
    correct: checked.has(index),
    given: checked.has(index) ? criterion : null,
    expected: criterion,
  }));
  const score = pending.criteria.length === 0 ? 0 : checked.size / pending.criteria.length;
  return {
    kind: 'graded',
    questionId: pending.questionId,
    questionType: pending.questionType,
    explanation: pending.explanation,
    lawRefs: pending.lawRefs,
    lawRefsUncertain: pending.lawRefsUncertain,
    score,
    outcome: outcomeFor(score),
    items,
    selfAssessed: true,
  };
}

/* --------------------------------------------------------------------------- helpers */

function forwarded(question: Question) {
  return {
    questionId: question.id,
    questionType: question.typ,
    explanation: question.forklaring ?? null,
    lawRefs: question.lagrum,
    lawRefsUncertain: question.lagrum_osaker === true,
  };
}

function graded(
  question: Question,
  score: number,
  items: ItemFeedback[],
  extra: Partial<Pick<GradedResult, 'solution'>> = {},
): GradedResult {
  const clamped = Math.min(1, Math.max(0, score));
  return {
    kind: 'graded',
    ...forwarded(question),
    score: clamped,
    outcome: outcomeFor(clamped),
    items,
    selfAssessed: false,
    ...extra,
  };
}

function selfGraded(
  question: Question,
  criteria: readonly string[],
  modelAnswer: string | undefined,
): SelfGradedResult {
  return {
    kind: 'self_graded',
    ...forwarded(question),
    criteria,
    modelAnswer: modelAnswer ?? null,
  };
}

function validIndexSet(indices: readonly number[], length: number): Set<number> {
  return new Set(indices.filter((i) => Number.isInteger(i) && i >= 0 && i < length));
}

function isValidIndex(index: number | null | undefined, length: number): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < length;
}

/* ------------------------------------------------------------------ choice questions */

function gradeMultipleChoice(
  question: QuestionOf<'flerval'>,
  answer: Extract<QuizAnswer, { type: 'flerval' }>,
): GradedResult {
  const selected = isValidIndex(answer.selected, question.alternativ.length)
    ? answer.selected
    : null;
  const items = question.alternativ.map((choice, index) =>
    choiceFeedback(choice, index, selected === index),
  );
  const correct = selected !== null && question.alternativ[selected]?.ratt === true;
  return graded(question, correct ? 1 : 0, items);
}

function gradeMultipleAnswer(
  question: QuestionOf<'flersvar'>,
  answer: Extract<QuizAnswer, { type: 'flersvar' }>,
): GradedResult {
  const selected = validIndexSet(answer.selected, question.alternativ.length);
  const totalRight = question.alternativ.filter((a) => a.ratt).length;
  let hits = 0;
  let falseAlarms = 0;
  for (const index of selected) {
    if (question.alternativ[index]?.ratt) hits += 1;
    else falseAlarms += 1;
  }
  const items = question.alternativ.map((choice, index) =>
    choiceFeedback(choice, index, selected.has(index)),
  );
  const score = totalRight === 0 ? 0 : (hits - falseAlarms) / totalRight;
  return graded(question, score, items);
}

function choiceFeedback(
  choice: QuestionOf<'flerval'>['alternativ'][number],
  index: number,
  picked: boolean,
): ItemFeedback {
  return {
    index,
    correct: picked === choice.ratt,
    given: picked ? 'vald' : 'inte vald',
    expected: choice.ratt ? 'rätt' : 'fel',
    ...(choice.forklaring !== undefined ? { explanation: choice.forklaring } : {}),
  };
}

function gradeTrueFalse(
  question: QuestionOf<'sant_falskt'>,
  answer: Extract<QuizAnswer, { type: 'sant_falskt' }>,
): GradedResult {
  const label = (value: boolean) => (value ? 'Sant' : 'Falskt');
  const value = typeof answer.value === 'boolean' ? answer.value : null;
  const correct = value === question.svar;
  return graded(question, correct ? 1 : 0, [
    {
      index: 0,
      correct,
      given: value === null ? null : label(value),
      expected: label(question.svar),
    },
  ]);
}

/* -------------------------------------------------------------------------- lucktext */

/** The word right after each `___` in the question text, used as the implied unit. */
export function wordsAfterGaps(text: string): string[] {
  const words: string[] = [];
  const pattern = new RegExp(GAP_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const rest = text.slice(match.index + match[0].length);
    const word = /^\s*([\p{L}§%²]+)/u.exec(rest)?.[1] ?? '';
    words.push(normalizeUnit(word));
  }
  return words;
}

/**
 * Compares one gap answer with one accepted answer. Numeric answers are compared as numbers
 * (comma or point, within `tolerance`); a unit after the number is accepted if it matches the
 * expected unit or the word that follows the gap ("10 veckor" for "___ veckor" with "10").
 */
export function gapMatches(
  given: string,
  expected: string,
  options: { tolerance?: number; caseSensitive?: boolean; impliedUnit?: string } = {},
): boolean {
  const normalizedGiven = normalizeText(given, options);
  if (normalizedGiven === '') return false;
  const normalizedExpected = normalizeText(expected, options);
  if (normalizedGiven === normalizedExpected) return true;

  const expectedQuantity = parseQuantity(expected);
  const givenQuantity = parseQuantity(given);
  if (expectedQuantity && givenQuantity) {
    if (!numbersMatch(givenQuantity.value, expectedQuantity.value, options.tolerance ?? 0)) {
      return false;
    }
    const unit = expectedQuantity.unit || options.impliedUnit || '';
    if (givenQuantity.unit === '') return true;
    return unitsCompatible(givenQuantity.unit, unit);
  }
  return false;
}

function gradeCloze(
  question: QuestionOf<'lucktext'>,
  answer: Extract<QuizAnswer, { type: 'lucktext' }>,
): GradedResult {
  const implied = wordsAfterGaps(question.fraga);
  const caseSensitive = question.skiftlageskanslig === true;
  const items = question.svar.map((accepted, index): ItemFeedback => {
    const alternatives = Array.isArray(accepted) ? accepted : [accepted];
    const given = answer.gaps[index] ?? '';
    const correct = alternatives.some((expected) =>
      gapMatches(given, expected, {
        caseSensitive,
        impliedUnit: implied[index] ?? '',
        ...(question.tolerans !== undefined ? { tolerance: question.tolerans } : {}),
      }),
    );
    return {
      index,
      correct,
      given: given.trim() === '' ? null : given.trim(),
      expected: alternatives.join(' / '),
    };
  });
  const score = items.length === 0 ? 0 : items.filter((i) => i.correct).length / items.length;
  return graded(question, score, items);
}

/* ------------------------------------------------------------------ numeric questions */

/** Reads a numeric answer with optional unit. Returns null for empty or non-numeric input. */
function readNumeric(
  value: string | number | null | undefined,
  expectedUnit: string,
): { value: number; text: string } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value, text: String(value) } : null;
  }
  const quantity = parseQuantity(value);
  if (!quantity) return null;
  if (!unitsCompatible(quantity.unit, normalizeUnit(expectedUnit))) return null;
  return { value: quantity.value, text: value.trim() };
}

function numericResult(
  question: QuestionOf<'berakning'> | QuestionOf<'ritning'>,
  raw: string | number | null | undefined,
  expected: number,
  tolerance: number,
  unit: string | undefined,
  extra: Partial<Pick<GradedResult, 'solution'>> = {},
): GradedResult {
  const read = readNumeric(raw, unit ?? '');
  const correct = read !== null && numbersMatch(read.value, expected, tolerance);
  const expectedText = `${formatNumber(expected)}${unit ? ` ${unit}` : ''}${
    tolerance > 0 ? ` (±${formatNumber(tolerance)})` : ''
  }`;
  const givenText =
    raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw).trim();
  return graded(
    question,
    correct ? 1 : 0,
    [{ index: 0, correct, given: givenText, expected: expectedText }],
    extra,
  );
}

/** Swedish number formatting with decimal comma. */
export function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

function gradeCalculation(
  question: QuestionOf<'berakning'>,
  answer: Extract<QuizAnswer, { type: 'berakning' }>,
): GradedResult {
  return numericResult(
    question,
    answer.value,
    question.svar,
    question.tolerans,
    question.enhet,
    question.losning !== undefined ? { solution: question.losning } : {},
  );
}

function gradeDrawing(
  question: QuestionOf<'ritning'>,
  answer: Extract<QuizAnswer, { type: 'ritning' }>,
): GradeResult {
  if (question.svar === undefined) {
    return selfGraded(question, question.bedomningspunkter ?? [], undefined);
  }
  return numericResult(question, answer.value, question.svar, question.tolerans, question.enhet);
}

/* -------------------------------------------------------------- matching and ordering */

function gradeMatching(
  question: QuestionOf<'para_ihop'>,
  answer: Extract<QuizAnswer, { type: 'para_ihop' }>,
): GradedResult {
  const items = question.par.map((pair, index): ItemFeedback => {
    const chosen = answer.matches[index];
    const chosenText = isValidIndex(chosen, question.par.length)
      ? (question.par[chosen]?.hoger ?? null)
      : null;
    const correct = chosenText !== null && normalizeText(chosenText) === normalizeText(pair.hoger);
    return { index, correct, given: chosenText, expected: pair.hoger };
  });
  const score = items.filter((i) => i.correct).length / items.length;
  return graded(question, score, items);
}

function gradeOrdering(
  question: QuestionOf<'ordning'>,
  answer: Extract<QuizAnswer, { type: 'ordning' }>,
): GradedResult {
  const n = question.poster.length;
  // Rank of each item = position of the first item with the same text, so identical
  // texts are interchangeable.
  const firstIndexOfText = new Map<string, number>();
  question.poster.forEach((item, index) => {
    const key = normalizeText(item);
    if (!firstIndexOfText.has(key)) firstIndexOfText.set(key, index);
  });
  const rank = (index: number) =>
    firstIndexOfText.get(normalizeText(question.poster[index] ?? '')) ?? index;

  const seen = new Set<number>();
  const order: number[] = [];
  for (const index of answer.order) {
    if (isValidIndex(index, n) && !seen.has(index)) {
      seen.add(index);
      order.push(index);
    }
  }
  const ranks = order.map(rank);
  const run = longestNonDecreasingSubsequence(ranks);
  // Items left out cannot be part of the run, so an incomplete answer never scores 1.
  const score = Math.max(0, run - 1) / (n - 1);

  const items = question.poster.map((expected, position): ItemFeedback => {
    const given = order[position];
    const givenText = given === undefined ? null : (question.poster[given] ?? null);
    const correct = given !== undefined && rank(given) === rank(position);
    return { index: position, correct, given: givenText, expected };
  });
  return graded(question, score, items);
}

/** Length of the longest non-decreasing subsequence, O(n log n). */
export function longestNonDecreasingSubsequence(values: readonly number[]): number {
  const tails: number[] = [];
  for (const value of values) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((tails[mid] ?? 0) <= value) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = value;
  }
  return tails.length;
}
