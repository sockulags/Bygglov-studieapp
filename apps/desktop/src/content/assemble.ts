import {
  formatIssues,
  parseCaseFile,
  parseContentIndex,
  parseModules,
  parseQuestionFile,
  type CaseFile,
  type ContentIndex,
  type ContentIssue,
  type Module,
  type ParseResult,
  type Question,
} from '@bygglov/content-schema';

/** All bundled study content, validated and typed. */
export interface StudyContent {
  /** Modules sorted by `ordning`. */
  modules: readonly Module[];
  /** Questions per module id, in file order. Modules without questions are absent. */
  questionsByModule: ReadonlyMap<string, readonly Question[]>;
  /** Cases sorted by id. */
  cases: readonly CaseFile[];
  /** Summary from the build, or null if the content has not been built. */
  index: ContentIndex | null;
}

export class ContentLoadError extends Error {
  constructor(
    readonly file: string,
    readonly issues: readonly ContentIssue[],
  ) {
    super(`Innehållet i ${file} är ogiltigt. Kör pnpm content:build igen.\n${formatIssues(issues)}`);
    this.name = 'ContentLoadError';
  }
}

function validated<T>(file: string, value: unknown, parse: (input: unknown) => ParseResult<T>): T {
  const result = parse(value);
  if (!result.success) throw new ContentLoadError(file, result.issues);
  return result.data;
}

/**
 * Builds `StudyContent` from the generated JSON files, keyed by their path relative to
 * `content-dist/` (e.g. `fragor/03-lovplikt.json`). Every file is validated again so the
 * app never trusts a stale or hand-edited build.
 */
export function assembleContent(files: Readonly<Record<string, unknown>>): StudyContent {
  let modules: Module[] = [];
  let index: ContentIndex | null = null;
  const questionsByModule = new Map<string, readonly Question[]>();
  const cases: CaseFile[] = [];

  for (const [file, value] of Object.entries(files)) {
    if (file === 'moduler.json') {
      modules = [...validated(file, value, parseModules).moduler];
    } else if (file === 'index.json') {
      index = validated(file, value, parseContentIndex);
    } else if (file.startsWith('fragor/')) {
      const data = validated(file, value, parseQuestionFile);
      questionsByModule.set(data.modul, data.fragor);
    } else if (file.startsWith('arenden/')) {
      cases.push(validated(file, value, parseCaseFile));
    }
  }

  modules.sort((a, b) => a.ordning - b.ordning);
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return { modules, questionsByModule, cases, index };
}

/** Questions of one module; empty when the module has none. */
export function getQuestions(content: StudyContent, moduleId: string): readonly Question[] {
  return content.questionsByModule.get(moduleId) ?? [];
}

/** Finds a question by id across all modules. */
export function findQuestion(
  content: StudyContent,
  questionId: string,
): { modul: string; question: Question } | undefined {
  for (const [modul, questions] of content.questionsByModule) {
    const question = questions.find((q) => q.id === questionId);
    if (question) return { modul, question };
  }
  return undefined;
}

export function getModule(content: StudyContent, moduleId: string): Module | undefined {
  return content.modules.find((m) => m.id === moduleId);
}

export function getCase(content: StudyContent, caseId: string): CaseFile | undefined {
  return content.cases.find((c) => c.id === caseId);
}
