/** Why an engine action was refused. */
export type CaseEngineErrorCode =
  | 'wrong_case' // the state belongs to another case
  | 'unknown_step' // no step with that id in the case
  | 'not_current_step' // the step is not the current one
  | 'case_finished' // every step is done
  | 'answer_type_mismatch' // the answer does not fit the step type
  | 'not_a_decision_step' // submitDecision on another step type, or a decision via skipStep
  | 'not_self_assessed' // selfAssessStep on a step that is graded automatically
  | 'not_completed' // the step has not been completed yet
  | 'invalid_days' // advanceDays with a negative or fractional number
  | 'invalid_extension'; // extendDeadline not allowed

/** Thrown by the case engine. `message` is Swedish and can be shown to the learner. */
export class CaseEngineError extends Error {
  readonly code: CaseEngineErrorCode;

  constructor(code: CaseEngineErrorCode, message: string) {
    super(message);
    this.name = 'CaseEngineError';
    this.code = code;
  }
}
