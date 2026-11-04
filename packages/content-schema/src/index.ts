// @bygglov/content-schema
// zod schemas and TypeScript types for the study content (content/*.yaml).
import { CaseFileSchema, type CaseFile } from './cases';
import { ContentIndexSchema, type ContentIndex } from './content-index';
import { safeParseContent, type ParseResult } from './errors';
import { ModulesFileSchema, type ModulesFile } from './modules';
import { QuestionFileSchema, type QuestionFile } from './questions';

export * from './common';
export * from './modules';
export * from './questions';
export * from './cases';
export * from './content-index';
export * from './errors';

/** Validates a parsed question file (`content/fragor/<modul>.yaml`). */
export function parseQuestionFile(input: unknown): ParseResult<QuestionFile> {
  return safeParseContent(QuestionFileSchema, input);
}

/** Validates a parsed case file (`content/arenden/<id>/arende.yaml`), including internal references. */
export function parseCaseFile(input: unknown): ParseResult<CaseFile> {
  return safeParseContent(CaseFileSchema, input);
}

/** Validates a parsed `content/moduler.yaml`. */
export function parseModules(input: unknown): ParseResult<ModulesFile> {
  return safeParseContent(ModulesFileSchema, input);
}

/** Validates the generated `content-dist/index.json`. */
export function parseContentIndex(input: unknown): ParseResult<ContentIndex> {
  return safeParseContent(ContentIndexSchema, input);
}
