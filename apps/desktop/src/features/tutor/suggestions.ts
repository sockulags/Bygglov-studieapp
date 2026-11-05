import type { Question } from '@bygglov/content-schema';
import type { QuizAnswer } from '@/engine';

/** Ready-made questions for the panel (docs/05 → Studiehjälp med AI). */
export const SUGGESTION_EXPLAIN_DEEPER = 'Förklara djupare';
export const SUGGESTION_SIMILAR_QUESTION = 'Ge mig en liknande fråga';
export const SUGGESTION_FIRST_LOOK = 'Vad hade du tittat på först i det här ärendet?';
export const SUGGESTION_DECISION_FEEDBACK = 'Ge mig första återkoppling på mitt beslut';

export const QUESTION_SUGGESTIONS: readonly string[] = [
  SUGGESTION_EXPLAIN_DEEPER,
  'Varför är alternativ 2 fel?',
  SUGGESTION_SIMILAR_QUESTION,
];

export const CASE_SUGGESTIONS: readonly string[] = [
  SUGGESTION_FIRST_LOOK,
  'Vilka lagrum är viktigast i det här steget?',
];

export const DECISION_SUGGESTIONS: readonly string[] = [
  SUGGESTION_DECISION_FEEDBACK,
  'Vad borde jag ha gjort annorlunda?',
  SUGGESTION_EXPLAIN_DEEPER,
];

/** Suggestions on Hem, where no question or case is open. */
export const GENERAL_SUGGESTIONS: readonly string[] = [
  'Vad borde jag repetera nu?',
  'Förhör mig med tre frågor om lovplikt',
  'Förklara skillnaden mellan bygglov och anmälan',
];

/**
 * Suggestions for a quiz question. "Varför är alternativ N fel?" names a wrong alternative:
 * the one she chose if it was wrong, otherwise the first wrong one. Before she has answered
 * only questions that do not ask for the answer are offered.
 */
export function questionSuggestions(question: Question, answer?: QuizAnswer | null): string[] {
  if (!answer) return ['Förklara begreppen i frågan', 'Vilket lagrum ska jag läsa?'];
  const list = [SUGGESTION_EXPLAIN_DEEPER];
  if (question.typ === 'flerval' || question.typ === 'flersvar') {
    const chosen =
      answer.type === 'flerval'
        ? answer.selected === null
          ? []
          : [answer.selected]
        : answer.type === 'flersvar'
          ? [...answer.selected]
          : [];
    const wrongChosen = chosen.find((i) => question.alternativ[i]?.ratt === false);
    const firstWrong = question.alternativ.findIndex((a) => !a.ratt);
    const index = wrongChosen ?? (firstWrong >= 0 ? firstWrong : null);
    if (index !== null) list.push(`Varför är alternativ ${index + 1} fel?`);
  }
  list.push(SUGGESTION_SIMILAR_QUESTION);
  return list;
}

/** Suggestions for a case: first feedback on the draft once she is at the decision step. */
export function caseSuggestions(options: { hasDecisionDraft: boolean }): string[] {
  return options.hasDecisionDraft
    ? [...CASE_SUGGESTIONS, SUGGESTION_DECISION_FEEDBACK]
    : [...CASE_SUGGESTIONS];
}
