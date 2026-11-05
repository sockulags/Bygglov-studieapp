import { formatKronor } from '@/engine';
import { stripFrontMatter } from './markdown-html';
import { SUPERVISOR_GRADES, type DecisionReport } from './report';

/**
 * The decision report as Markdown for pasting into a text message or an e-mail. Shorter
 * than the HTML version: the model decision is left out unless asked for.
 */

export interface RenderMarkdownOptions {
  /** Include the model decision at the end. Default false (it is long). */
  includeAppendix?: boolean;
}

/** Keeps user text from breaking the Markdown structure (headings, lists, tables). */
function inline(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ').trim();
}

function quote(text: string, empty: string): string {
  const value = text.trim();
  if (value.length === 0) return `_${empty}_`;
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

export function renderDecisionReportMarkdown(
  report: DecisionReport,
  options: RenderMarkdownOptions = {},
): string {
  const d = report.decision;
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(`# Beslutsrapport: ${inline(report.caseTitle)}`, '');
  push(
    `Ärende ${report.caseId} · ${inline(report.property)} · Nivå ${report.level} · Övningsärende med fiktiva uppgifter`,
  );
  push(`Beslutsdatum i ärendet: ${report.decisionDate ?? 'saknas'}`, '');

  if (report.warnings.length > 0) {
    push('**Obs!**', ...report.warnings.map((w) => `- ${inline(w)}`), '');
  }

  push('## Datumlinje', '');
  if (report.timeline.length === 0) push('_Ingen datumlinje._');
  for (const entry of report.timeline) {
    push(
      `- ${entry.date}: ${inline(entry.label)}${entry.detail ? ` (${inline(entry.detail)})` : ''}`,
    );
  }
  push('', inline(report.deadline.summary), '');

  push('## Studentens beslut', '');
  push(`**${d.outcomeLabel}**`);
  push(`- Lagstöd: ${d.lawRefs.length > 0 ? d.lawRefs.map(inline).join(', ') : 'inget angivet'}`);
  push(
    `- Avgift: ${d.feeLabel}${d.expectedFee !== null && d.fee !== d.expectedFee ? ` (appen väntade sig ${formatKronor(d.expectedFee)})` : ''}`,
  );
  push(
    `- Överklagandehänvisning: ${d.appealNotice === null ? 'inte angivet' : d.appealNotice ? 'ja' : 'nej'}`,
  );
  push(
    `- Expediering: ${d.recipients.length > 0 ? d.recipients.map((r) => `${inline(r.recipient)} (${r.method})`).join('; ') : 'ingen angiven'}`,
  );
  push('', '**Skäl**', '', quote(d.reasoning, 'Ingen motivering angiven.'), '');
  push('**Villkor och upplysningar**', '', quote(d.conditions, 'Inga angivna.'), '');

  push('## Automatiska kontroller', '');
  if (!report.checks) {
    push('_Den automatiska bedömningen saknas._');
  } else {
    push(`${report.checks.passed} av ${report.checks.total} uppfyllda (tips räknas inte).`, '');
    for (const check of report.checks.items) {
      const mark = check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : 'Tips:';
      push(`- ${mark} ${inline(check.title)}: ${inline(check.message)}`);
    }
  }
  push('');

  push('## Bedömningspunkter', '');
  if (!report.selfAssessed) push('_Inte självbedömd ännu._', '');
  for (const c of report.criteria) {
    push(`- [${c.checked ? 'x' : ' '}] ${inline(c.text)}`);
  }
  if (report.criteria.length === 0) push('_Inga bedömningspunkter._');
  push('');

  push('## Studentens anteckningar', '', quote(report.notes ?? '', 'Inga anteckningar.'), '');
  for (const w of report.writings) {
    push(`**${inline(w.title)}**`, '', quote(w.text, ''), '');
  }

  push('## Handledarens bedömning', '');
  push(`Betyg: ${SUPERVISOR_GRADES.join(' / ')}`, 'Kommentar:', '');

  if (options.includeAppendix && report.appendix.markdown) {
    push(
      '---',
      '',
      `## ${report.appendix.title}`,
      '',
      stripFrontMatter(report.appendix.markdown).trim(),
      '',
    );
  }

  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
