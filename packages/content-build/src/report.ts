import type { ContentTree, Finding } from './load';

function groupByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = groups.get(finding.file) ?? [];
    list.push(finding);
    groups.set(finding.file, list);
  }
  return groups;
}

function section(title: string, findings: readonly Finding[]): string[] {
  if (findings.length === 0) return [];
  const lines = [title];
  for (const [file, list] of groupByFile(findings)) {
    lines.push(`  ${file}`);
    for (const f of list) lines.push(`    - ${f.path ? `${f.path}: ` : ''}${f.message}`);
  }
  lines.push('');
  return lines;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Human-readable report for the terminal, in Swedish. */
export function formatReport(tree: ContentTree): string {
  const questionCount = tree.questionFiles.reduce((sum, f) => sum + f.data.fragor.length, 0);
  const drafts =
    tree.questionFiles.reduce(
      (sum, f) => sum + f.data.fragor.filter((q) => q.status === 'utkast').length,
      0,
    ) + tree.cases.filter((c) => c.data.status === 'utkast').length;

  const lines = [
    'Innehållskontroll',
    `  ${plural(tree.fileCount, 'fil lästes', 'filer lästes')}: ${plural(tree.modules?.moduler.length ?? 0, 'modul', 'moduler')}, ` +
      `${plural(questionCount, 'fråga', 'frågor')} i ${plural(tree.questionFiles.length, 'fil', 'filer')}, ` +
      `${plural(tree.cases.length, 'ärende', 'ärenden')}.`,
    `  ${plural(drafts, 'post', 'poster')} har status utkast och väntar på granskning mot Lagtextens byggregler.`,
    '',
    ...section(`Fel (${tree.errors.length}):`, tree.errors),
    ...section(`Varningar (${tree.warnings.length}):`, tree.warnings),
  ];

  if (tree.errors.length > 0) {
    lines.push(
      `Kontrollen misslyckades: ${plural(tree.errors.length, 'fel', 'fel')} måste rättas.`,
    );
  } else if (tree.warnings.length > 0) {
    lines.push(
      `Inga fel. ${plural(tree.warnings.length, 'varning', 'varningar')} stoppar inte bygget.`,
    );
  } else {
    lines.push('Inga fel eller varningar.');
  }
  return lines.join('\n');
}
