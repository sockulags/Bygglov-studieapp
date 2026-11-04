import { formatKronor, formatSwedishDate } from '@/engine';
import { markdownToHtml } from './markdown-html';
import { SUPERVISOR_GRADES, type DecisionReport, type ReportCheck } from './report';

/**
 * Renders the decision report as one self-contained HTML document: inline CSS, A4, black
 * on white, made for printing to PDF. All text from the report is escaped.
 */

export interface RenderHtmlOptions {
  /** Markdown renderer for the model decision; defaults to react-markdown + GFM. */
  renderMarkdown?: (markdown: string) => string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Escaped text with line breaks kept; blank lines become paragraphs. */
function paragraphs(text: string, empty: string): string {
  if (text.trim().length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return text
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

function date(value: string | null): string {
  if (!value) return 'okänt datum';
  try {
    return formatSwedishDate(value);
  } catch {
    return value;
  }
}

function realDate(iso: string): string {
  const day = iso.slice(0, 10);
  return date(day);
}

const STYLE = `
@page { size: A4; margin: 18mm 18mm 20mm; }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0 auto; max-width: 174mm; padding: 12mm 0; color: #000; background: #fff;
  font: 10.5pt/1.5 Georgia, 'Source Serif 4', 'Times New Roman', serif; }
@media print { body { padding: 0; max-width: none; } }
h1, h2, h3, h4, .sans, table, .meta, .box-label { font-family: 'Segoe UI', Inter, Arial, sans-serif; }
h1 { font-size: 18pt; margin: 0 0 2mm; line-height: 1.2; }
h2 { font-size: 12.5pt; margin: 8mm 0 3mm; padding-bottom: 1mm; border-bottom: 1px solid #000;
  break-after: avoid; page-break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 3mm 0 1mm; }
p { margin: 0 0 2.5mm; }
a { color: #000; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
.meta { font-size: 9pt; margin: 0; }
.fiction { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid #000;
  display: inline-block; padding: 0.5mm 2mm; margin-bottom: 4mm; font-family: Arial, sans-serif; }
.empty { font-style: italic; color: #333; }
.warning { border: 1px dashed #000; padding: 2mm 3mm; font-size: 9.5pt; margin: 4mm 0; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 0 0 4mm; }
th, td { border: 1px solid #000; padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
th { background: #fff; font-weight: 700; }
tr { break-inside: avoid; page-break-inside: avoid; }
td.date, th.date { white-space: nowrap; width: 27mm; }
td.status { white-space: nowrap; width: 26mm; font-weight: 700; }
.small { font-size: 8.5pt; }
.decision { border: 1px solid #000; padding: 5mm 6mm; }
.decision h3:first-child { margin-top: 0; }
.mark { font-family: 'Segoe UI Symbol', 'DejaVu Sans', Arial, sans-serif; }
.criteria li { list-style: none; margin-left: -6mm; }
.writing { border-left: 2px solid #000; padding-left: 3mm; margin: 0 0 4mm; }
.supervisor { border: 2px solid #000; padding: 5mm 6mm; break-inside: avoid; page-break-inside: avoid; margin-top: 6mm; }
.supervisor h2 { margin-top: 0; }
.line { border-bottom: 1px solid #000; height: 8mm; }
.grades { display: flex; gap: 10mm; margin: 2mm 0 5mm; font-family: Arial, sans-serif; }
.grade-box { display: inline-block; width: 4.5mm; height: 4.5mm; border: 1px solid #000; vertical-align: -0.8mm; margin-right: 2mm; }
.sign { display: flex; gap: 8mm; margin-top: 6mm; }
.sign > div { flex: 1; }
.box-label { font-size: 9pt; font-weight: 700; margin: 3mm 0 0; }
.appendix { break-before: page; page-break-before: always; }
.appendix-body { font-size: 10pt; }
.appendix-body table { font-family: inherit; }
.appendix-body h1 { font-size: 14pt; }
.appendix-body h2 { font-size: 11.5pt; }
`;

function checkRow(check: ReportCheck): string {
  const mark = check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : 'i';
  const extra = [
    check.details.length > 0
      ? `<ul class="small">${check.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
      : '',
    check.lawRefs.length > 0
      ? `<div class="small">Lagrum: ${escapeHtml(check.lawRefs.join('; '))}</div>`
      : '',
  ].join('');
  const severity = check.status === 'failed' && check.severity === 'warning' ? ' (varning)' : '';
  return `<tr><td class="status"><span class="mark">${mark}</span> ${escapeHtml(check.statusLabel)}${severity}</td><td><strong>${escapeHtml(check.title)}</strong><br>${escapeHtml(check.message)}${extra}</td></tr>`;
}

function sectionDecision(report: DecisionReport): string {
  const d = report.decision;
  const lawRefs =
    d.lawRefs.length > 0
      ? `<p>Beslutet fattas med stöd av ${escapeHtml(d.lawRefs.join(', '))}.</p>`
      : '<p class="empty">Inget lagstöd angivet.</p>';
  const feeNote =
    d.expectedFee !== null && d.fee !== d.expectedFee
      ? `<p class="small">Enligt taxan och tidsfristen väntade sig appen ${escapeHtml(formatKronor(d.expectedFee))}.</p>`
      : '';
  const appeal =
    d.appealNotice === null
      ? '<p class="empty">Inte angivet.</p>'
      : d.appealNotice
        ? '<p>Hänvisning om hur man överklagar bifogas beslutet.</p>'
        : '<p>Ingen hänvisning om hur man överklagar.</p>';
  const recipients =
    d.recipients.length > 0
      ? `<table><thead><tr><th>Mottagare</th><th>Sätt</th></tr></thead><tbody>${d.recipients
          .map(
            (r) => `<tr><td>${escapeHtml(r.recipient)}</td><td>${escapeHtml(r.method)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="empty">Ingen expediering angiven.</p>';
  return `<section>
<h2>Hennes beslut</h2>
<div class="decision">
<p class="meta">${escapeHtml(report.property)} · Beslutsdatum ${escapeHtml(date(report.decisionDate))}</p>
<h3>Beslut</h3>
<p><strong>${escapeHtml(d.outcomeLabel)}</strong></p>
${lawRefs}
<h3>Avgift</h3>
<p>${escapeHtml(d.feeLabel)}</p>
${feeNote}
<h3>Skäl för beslutet</h3>
${paragraphs(d.reasoning, 'Ingen motivering angiven.')}
<h3>Villkor och upplysningar</h3>
${paragraphs(d.conditions, 'Inga villkor eller upplysningar angivna.')}
<h3>Hur man överklagar</h3>
${appeal}
<h3>Expediering</h3>
${recipients}
</div>
</section>`;
}

function sectionChecks(report: DecisionReport): string {
  if (!report.checks) {
    return '<section><h2>Automatiska kontroller</h2><p class="empty">Den automatiska bedömningen saknas för det här beslutet.</p></section>';
  }
  return `<section>
<h2>Automatiska kontroller</h2>
<p class="sans">${report.checks.passed} av ${report.checks.total} kontroller uppfyllda. Tips räknas inte.</p>
<table><thead><tr><th>Utfall</th><th>Kontroll</th></tr></thead><tbody>
${report.checks.items.map(checkRow).join('\n')}
</tbody></table>
</section>`;
}

function sectionCriteria(report: DecisionReport): string {
  const intro = report.selfAssessed
    ? 'Så här bockade hon själv av bedömningspunkterna.'
    : 'Hon har inte bedömt sig själv mot bedömningspunkterna ännu.';
  const items =
    report.criteria.length > 0
      ? `<ul class="criteria">${report.criteria
          .map((c) => {
            const mark = c.checked === null ? '☐' : c.checked ? '☑' : '☐';
            const label =
              c.checked === null
                ? ''
                : c.checked
                  ? ' <span class="small">(uppfyllt enligt henne)</span>'
                  : ' <span class="small">(inte uppfyllt enligt henne)</span>';
            return `<li><span class="mark">${mark}</span> ${escapeHtml(c.text)}${label}</li>`;
          })
          .join('')}</ul>`
      : '<p class="empty">Ärendet har inga bedömningspunkter.</p>';
  return `<section><h2>Bedömningspunkter</h2><p>${escapeHtml(intro)}</p>${items}</section>`;
}

function sectionTimeline(report: DecisionReport): string {
  const rows =
    report.timeline.length > 0
      ? `<table><thead><tr><th class="date">Datum</th><th>Händelse</th></tr></thead><tbody>${report.timeline
          .map(
            (e) =>
              `<tr><td class="date">${escapeHtml(e.date)}</td><td>${escapeHtml(e.label)}${e.detail ? `<br><span class="small">${escapeHtml(e.detail)}</span>` : ''}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="empty">Ingen datumlinje.</p>';
  return `<section><h2>Datumlinje</h2><p class="small">Datum i ärendets simulerade kalender.</p>${rows}<p>${escapeHtml(report.deadline.summary)}</p></section>`;
}

function sectionSteps(report: DecisionReport): string {
  if (report.steps.length === 0) return '';
  return `<section><h2>Handläggningens steg</h2><table><thead><tr><th>Steg</th><th>Typ</th><th class="date">Datum</th><th>Resultat</th></tr></thead><tbody>${report.steps
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.title)}</td><td>${escapeHtml(s.typeLabel)}</td><td class="date">${escapeHtml(s.date ?? '–')}</td><td>${escapeHtml(s.result)}</td></tr>`,
    )
    .join('')}</tbody></table></section>`;
}

function sectionNotes(report: DecisionReport): string {
  const writings = report.writings
    .map(
      (w) => `<div class="writing"><h4>${escapeHtml(w.title)}</h4>${paragraphs(w.text, '')}</div>`,
    )
    .join('');
  return `<section><h2>Hennes anteckningar och reflektioner</h2>${paragraphs(report.notes ?? '', 'Inga anteckningar.')}${
    writings ? `<h3>Skrivelser och svar under handläggningen</h3>${writings}` : ''
  }</section>`;
}

function sectionSupervisor(): string {
  const lines = Array.from({ length: 6 }, () => '<div class="line"></div>').join('');
  const grades = SUPERVISOR_GRADES.map(
    (g) => `<span><span class="grade-box"></span>${escapeHtml(g)}</span>`,
  ).join('');
  return `<section class="supervisor">
<h2>Handledarens bedömning</h2>
<p class="box-label">Kommentar</p>
${lines}
<p class="box-label">Betyg</p>
<div class="grades">${grades}</div>
<div class="sign">
<div><p class="box-label">Datum</p><div class="line"></div></div>
<div><p class="box-label">Signatur</p><div class="line"></div></div>
<div><p class="box-label">Namnförtydligande</p><div class="line"></div></div>
</div>
</section>`;
}

function sectionAppendix(report: DecisionReport, render: (md: string) => string): string {
  const body = report.appendix.markdown
    ? `<div class="appendix-body">${render(report.appendix.markdown)}</div>`
    : '<p class="empty">Modellbeslutet finns inte för det här ärendet.</p>';
  const mistakes =
    report.appendix.commonMistakes.length > 0
      ? `<h3>Vanliga fel i ärendet</h3><ul>${report.appendix.commonMistakes.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
      : '';
  return `<section class="appendix"><h2>${escapeHtml(report.appendix.title)}</h2><p class="small">Modellbeslutet är ett facit skrivet för övningen. Det visades för henne först efter att hon lämnat in sitt beslut.</p>${body}${mistakes}</section>`;
}

export function renderDecisionReportHtml(
  report: DecisionReport,
  options: RenderHtmlOptions = {},
): string {
  const render = options.renderMarkdown ?? markdownToHtml;
  const title = `Beslutsrapport ${report.caseId} ${report.property}`;
  const warnings =
    report.warnings.length > 0
      ? `<div class="warning sans"><strong>Obs!</strong><ul>${report.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
      : '';
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<div class="fiction">Övningsärende · fiktiva uppgifter</div>
<h1>Beslutsrapport: ${escapeHtml(report.caseTitle)}</h1>
<p class="meta">Ärende ${escapeHtml(report.caseId)} · ${escapeHtml(report.property)} · Nivå ${report.level}</p>
<p class="meta">Beslutsdatum i ärendet: ${escapeHtml(date(report.decisionDate))} · Rapporten skapad ${escapeHtml(realDate(report.generatedAt))}</p>
<p class="meta">Innehållsstatus: ${escapeHtml(report.contentStatus)} · Rättsläge ${escapeHtml(report.legalState)}</p>
</header>
${warnings}
<section><h2>Ärendet</h2>${paragraphs(report.caseSummary, '')}</section>
${sectionTimeline(report)}
${sectionDecision(report)}
${sectionChecks(report)}
${sectionCriteria(report)}
${sectionSteps(report)}
${sectionNotes(report)}
${sectionSupervisor()}
${sectionAppendix(report, render)}
</body>
</html>
`;
}
