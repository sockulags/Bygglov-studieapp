import type {
  CalculationStep,
  CaseFile,
  CaseStep,
  ChecklistStep,
  QuestionStep,
  SelectionStep,
  WritingStep,
} from '@bygglov/content-schema';
import { grade, gradeSelfAssessment, outcomeFor } from '../quiz/grade';
import type { GradeOutcome, GradeResult, ItemFeedback, QuestionOf } from '../quiz/types';
import { CaseEngineError } from './errors';
import type { SelectionStats, SelfAssessmentInfo, StepAnswer, StepResult } from './types';

/**
 * Grading per step type. Pure functions of the step and the stored answer, so feedback can
 * be rebuilt from a saved `CaseState` at any time.
 *
 * - checklista: one point per post marked correctly (finns/saknas); score = share right.
 * - fraga: flerval, flersvar and sant_falskt through the quiz engine's `grade`; oppen is
 *   self-assessed against `bedomningspunkter`.
 * - berakning: each calculation through `grade` (tolerance and units); score = share right.
 * - urval: precision and recall against `ratt`; score = F1 (harmonic mean of both).
 * - skrivelse: self-assessed against `bedomningspunkter`, model text shown afterwards.
 * - beslut: see `assessDecision`.
 */

export interface GradedStepAnswer {
  /** Null while a self-assessment is pending. */
  score: number | null;
  outcome: GradeOutcome | null;
  items: ItemFeedback[];
  explanation: string | null;
  lawRefs: string[];
  selfAssessment: SelfAssessmentInfo | null;
  selection: SelectionStats | null;
}

export function gradeStepAnswer(
  caseFile: CaseFile,
  step: CaseStep,
  answer: StepAnswer,
  checkedCriteria: readonly number[] | null,
): GradedStepAnswer {
  if (answer.type !== step.typ) {
    throw new CaseEngineError(
      'answer_type_mismatch',
      `Steget ${step.id} är av typen ${step.typ}, men svaret är av typen ${answer.type}.`,
    );
  }
  switch (step.typ) {
    case 'checklista':
      return gradeChecklist(step, answer as Extract<StepAnswer, { type: 'checklista' }>);
    case 'fraga':
      return gradeQuestion(
        caseFile,
        step,
        answer as Extract<StepAnswer, { type: 'fraga' }>,
        checkedCriteria,
      );
    case 'berakning':
      return gradeCalculations(
        caseFile,
        step,
        answer as Extract<StepAnswer, { type: 'berakning' }>,
      );
    case 'urval':
      return gradeSelection(step, answer as Extract<StepAnswer, { type: 'urval' }>);
    case 'skrivelse':
      return gradeWriting(step, checkedCriteria);
    case 'beslut':
      // Decisions are assessed by assessDecision; the score comes from its checks.
      return {
        score: null,
        outcome: null,
        items: [],
        explanation: step.forklaring ?? null,
        lawRefs: step.lagrum ?? [],
        selfAssessment: null,
        selection: null,
      };
  }
}

/** True for step types whose score comes from the learner ticking criteria. */
export function isSelfAssessedStep(step: CaseStep): boolean {
  return step.typ === 'skrivelse' || (step.typ === 'fraga' && step.fragetyp === 'oppen');
}

export function criteriaOf(step: CaseStep): string[] {
  if (step.typ === 'skrivelse' || step.typ === 'beslut') return [...step.bedomningspunkter];
  if (step.typ === 'fraga') return [...(step.bedomningspunkter ?? [])];
  return [];
}

/**
 * Whether a step counts as missed for `om_missat`: it was skipped, or answered wrongly.
 * "Wrongly" means: urval that left out someone who should be chosen (recall < 1); beslut
 * with another outcome than expected; any other automatically graded step that is not
 * fully right. Self-assessed steps are never missed once submitted.
 */
export function isMissedResult(step: CaseStep, result: StepResult): boolean {
  if (result.skipped || result.answer === null) return true;
  if (step.typ === 'urval' && result.answer.type === 'urval') {
    return selectionStats(step, result.answer.selected).recall < 1;
  }
  if (step.typ === 'beslut' && result.answer.type === 'beslut') {
    return result.answer.draft.utfall !== step.forvantat_beslut;
  }
  if (isSelfAssessedStep(step)) return false;
  return result.outcome !== 'correct';
}

/* ---------------------------------------------------------------------- checklista */

function gradeChecklist(
  step: ChecklistStep,
  answer: Extract<StepAnswer, { type: 'checklista' }>,
): GradedStepAnswer {
  const label = (finns: boolean) => (finns ? 'finns' : 'saknas');
  const items = step.poster.map((post, index): ItemFeedback => {
    const mark = answer.marks[index];
    const given = typeof mark === 'boolean' ? mark : null;
    return {
      index,
      correct: given === post.finns,
      given: given === null ? null : label(given),
      expected: label(post.finns),
      ...(post.kommentar !== undefined ? { explanation: post.kommentar } : {}),
    };
  });
  return autoGraded(step, share(items), items);
}

/* --------------------------------------------------------------------------- fraga */

function questionOf(caseFile: CaseFile, step: QuestionStep) {
  const base = {
    id: step.id,
    svarighet:
      caseFile.niva === 1 ? (1 as const) : caseFile.niva === 2 ? (2 as const) : (3 as const),
    fraga: step.fraga,
    forklaring: step.forklaring ?? '',
    lagrum: step.lagrum ?? [],
    taggar: [],
    status: caseFile.status,
    rattslage: caseFile.rattslage,
  };
  switch (step.fragetyp) {
    case 'flerval':
      return {
        ...base,
        typ: 'flerval',
        alternativ: step.alternativ ?? [],
      } satisfies QuestionOf<'flerval'>;
    case 'flersvar':
      return {
        ...base,
        typ: 'flersvar',
        alternativ: step.alternativ ?? [],
      } satisfies QuestionOf<'flersvar'>;
    case 'sant_falskt':
      return {
        ...base,
        typ: 'sant_falskt',
        svar: step.svar ?? false,
      } satisfies QuestionOf<'sant_falskt'>;
    case 'oppen':
      return {
        ...base,
        typ: 'oppen',
        bedomningspunkter: step.bedomningspunkter ?? [],
        ...(step.modellsvar !== undefined ? { modellsvar: step.modellsvar } : {}),
      } satisfies QuestionOf<'oppen'>;
  }
}

function gradeQuestion(
  caseFile: CaseFile,
  step: QuestionStep,
  answer: Extract<StepAnswer, { type: 'fraga' }>,
  checkedCriteria: readonly number[] | null,
): GradedStepAnswer {
  if (answer.answer.type !== step.fragetyp) {
    throw new CaseEngineError(
      'answer_type_mismatch',
      `Frågan i steg ${step.id} är av typen ${step.fragetyp}, men svaret är av typen ${answer.answer.type}.`,
    );
  }
  let result: GradeResult = grade(questionOf(caseFile, step), answer.answer);
  const explanation = step.forklaring ?? null;
  const lawRefs = step.lagrum ?? [];
  if (result.kind === 'self_graded') {
    const info: SelfAssessmentInfo = {
      criteria: [...result.criteria],
      checked: null,
      modelAnswer: result.modelAnswer,
      modelTextPath: null,
    };
    if (checkedCriteria === null) {
      return {
        score: null,
        outcome: null,
        items: [],
        explanation,
        lawRefs,
        selfAssessment: info,
        selection: null,
      };
    }
    result = gradeSelfAssessment(result, checkedCriteria);
    info.checked = checkedIndices(result.items);
    return {
      score: result.score,
      outcome: result.outcome,
      items: result.items,
      explanation,
      lawRefs,
      selfAssessment: info,
      selection: null,
    };
  }
  return {
    score: result.score,
    outcome: result.outcome,
    items: result.items,
    explanation,
    lawRefs,
    selfAssessment: null,
    selection: null,
  };
}

/* ----------------------------------------------------------------------- berakning */

function gradeCalculations(
  caseFile: CaseFile,
  step: CalculationStep,
  answer: Extract<StepAnswer, { type: 'berakning' }>,
): GradedStepAnswer {
  const items = step.fragor.map((item, index): ItemFeedback => {
    const unit = item.enhet ?? unitFromText(item.text);
    const question: QuestionOf<'berakning'> = {
      id: `${step.id}.${item.id}`,
      typ: 'berakning',
      svarighet: 2,
      fraga: item.text,
      forklaring: step.forklaring ?? '',
      lagrum: [],
      taggar: [],
      status: caseFile.status,
      rattslage: caseFile.rattslage,
      svar: item.svar,
      tolerans: item.tolerans,
      ...(unit !== undefined ? { enhet: unit } : {}),
    };
    const result = grade(question, { type: 'berakning', value: answer.values[item.id] ?? null });
    const feedback = result.kind === 'graded' ? result.items[0] : undefined;
    return {
      index,
      correct: feedback?.correct ?? false,
      given: feedback?.given ?? null,
      expected: feedback?.expected ?? String(item.svar),
      explanation: item.text,
    };
  });
  return autoGraded(step, share(items), items);
}

/** "Tillbyggnadens byggnadshöjd (m)" → "m", so "4,9 m" is accepted without `enhet`. */
function unitFromText(text: string): string | undefined {
  return /\(([^()\d]{1,12})\)\s*\??\s*$/u.exec(text)?.[1]?.trim();
}

/* --------------------------------------------------------------------------- urval */

export function selectionStats(step: SelectionStep, selected: readonly number[]): SelectionStats {
  const picked = new Set(
    selected.filter((i) => Number.isInteger(i) && i >= 0 && i < step.alternativ.length),
  );
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  step.alternativ.forEach((alt, index) => {
    const chosen = picked.has(index);
    if (chosen && alt.ratt) truePositives += 1;
    else if (chosen) falsePositives += 1;
    else if (alt.ratt) falseNegatives += 1;
  });
  const precision = picked.size === 0 ? 0 : truePositives / picked.size;
  const rightCount = truePositives + falseNegatives;
  const recall = rightCount === 0 ? 1 : truePositives / rightCount;
  return { precision, recall, truePositives, falsePositives, falseNegatives };
}

function gradeSelection(
  step: SelectionStep,
  answer: Extract<StepAnswer, { type: 'urval' }>,
): GradedStepAnswer {
  const stats = selectionStats(step, answer.selected);
  const picked = new Set(answer.selected);
  const items = step.alternativ.map((alt, index): ItemFeedback => ({
    index,
    correct: picked.has(index) === alt.ratt,
    given: picked.has(index) ? 'vald' : 'inte vald',
    expected: alt.ratt ? 'ska väljas' : 'ska inte väljas',
    ...(alt.kommentar !== undefined ? { explanation: alt.kommentar } : {}),
  }));
  const { precision, recall } = stats;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...autoGraded(step, f1, items), selection: stats };
}

/* ----------------------------------------------------------------------- skrivelse */

function gradeWriting(
  step: WritingStep,
  checkedCriteria: readonly number[] | null,
): GradedStepAnswer {
  const criteria = [...step.bedomningspunkter];
  const info: SelfAssessmentInfo = {
    criteria,
    checked: null,
    modelAnswer: null,
    modelTextPath: step.modelltext ?? null,
  };
  const base = {
    explanation: step.forklaring ?? null,
    lawRefs: step.lagrum ?? [],
    selection: null,
  };
  if (checkedCriteria === null) {
    return { ...base, score: null, outcome: null, items: [], selfAssessment: info };
  }
  const checked = validIndices(checkedCriteria, criteria.length);
  const items = criteria.map((criterion, index): ItemFeedback => ({
    index,
    correct: checked.includes(index),
    given: checked.includes(index) ? criterion : null,
    expected: criterion,
  }));
  const score = criteria.length === 0 ? 0 : checked.length / criteria.length;
  return {
    ...base,
    score,
    outcome: outcomeFor(score),
    items,
    selfAssessment: { ...info, checked },
  };
}

/* ------------------------------------------------------------------------- helpers */

function autoGraded(step: CaseStep, score: number, items: ItemFeedback[]): GradedStepAnswer {
  const clamped = Math.min(1, Math.max(0, score));
  return {
    score: clamped,
    outcome: outcomeFor(clamped),
    items,
    explanation: step.forklaring ?? null,
    lawRefs: step.lagrum ?? [],
    selfAssessment: null,
    selection: null,
  };
}

function share(items: readonly ItemFeedback[]): number {
  return items.length === 0 ? 0 : items.filter((i) => i.correct).length / items.length;
}

export function validIndices(indices: readonly number[], length: number): number[] {
  return [...new Set(indices.filter((i) => Number.isInteger(i) && i >= 0 && i < length))].sort(
    (a, b) => a - b,
  );
}

function checkedIndices(items: readonly ItemFeedback[]): number[] {
  return items.filter((i) => i.correct).map((i) => i.index);
}
