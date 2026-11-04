/**
 * features/cases/export — the decision report to the supervisor (beslutsrapporten):
 * building it, rendering it as printable HTML and as Markdown, exporting it and
 * registering the supervisor's feedback.
 */
export {
  ExportDecisionButton,
  type ExportDecisionButtonProps,
  type ExportMethod,
} from './export-decision-button';
export {
  SupervisorFeedbackPanel,
  type SupervisorFeedbackPanelProps,
} from './supervisor-feedback-panel';
export {
  buildDecisionReport,
  reportFileBaseName,
  SUPERVISOR_GRADES,
  type BuildReportOptions,
  type DecisionReport,
  type ReportCheck,
  type ReportCriterion,
  type ReportDecision,
  type ReportDecisionInput,
  type SupervisorGrade,
  type TimelineEntry,
} from './report';
export { escapeHtml, renderDecisionReportHtml, type RenderHtmlOptions } from './report-html';
export { renderDecisionReportMarkdown, type RenderMarkdownOptions } from './report-markdown';
export { markdownToHtml, stripFrontMatter } from './markdown-html';
export {
  fetchCaseMarkdown,
  loadDecisionReport,
  loadReportSources,
  parseDecisionValue,
  ReportLoadError,
  reportNotesKey,
  type LoadedDecisionReport,
  type ReportSources,
} from './load';
export { copyText, printHtml, saveHtmlFile } from './export-actions';
export {
  exportKeys,
  useAddSupervisorFeedback,
  useDecisionRow,
  useSupervisorFeedback,
} from './hooks';
