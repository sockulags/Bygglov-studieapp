/**
 * content/ — typed access to the study content bundled with the app.
 *
 * The JSON comes from `pnpm content:build` (packages/content-build), which writes
 * `src/content-dist/` and copies case documents to `public/content/`. Without a build the
 * content is simply empty.
 */
import { assembleContent, type StudyContent } from './assemble';

export {
  assembleContent,
  ContentLoadError,
  findQuestion,
  getCase,
  getModule,
  getQuestions,
  type StudyContent,
} from './assemble';
export type {
  CaseDocument,
  CaseEvent,
  CaseFile,
  CaseStep,
  ContentIndex,
  Module,
  Question,
  QuestionType,
} from '@bygglov/content-schema';

const DIST_PREFIX = '../content-dist/';

const distFiles = import.meta.glob<unknown>('../content-dist/**/*.json', {
  eager: true,
  import: 'default',
});

let cached: StudyContent | undefined;

/** Loads and validates all bundled content once; later calls return the same object. */
export function loadContent(): StudyContent {
  if (!cached) {
    const files: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(distFiles)) {
      files[path.startsWith(DIST_PREFIX) ? path.slice(DIST_PREFIX.length) : path] = value;
    }
    cached = assembleContent(files);
  }
  return cached;
}

/**
 * URL of a case document such as `handlingar/ansokan.pdf`, served from `public/content/`.
 */
export function caseDocumentUrl(caseId: string, file: string): string {
  return `${import.meta.env.BASE_URL}content/arenden/${encodeURIComponent(caseId)}/${file
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
