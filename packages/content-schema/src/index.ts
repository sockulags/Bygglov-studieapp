// @bygglov/content-schema
// zod schemas and TypeScript types for the study content (content/*.yaml).
import { CaseFileSchema, type CaseFile } from './cases';
import { ContentIndexSchema, type ContentIndex } from './content-index';
import { safeParseContent, type ParseResult } from './errors';
import {
  GlossaryFileSchema,
  LawCatalogSchema,
  LawChapterFileSchema,
  ProcessFileSchema,
  type GlossaryFile,
  type LawCatalog,
  type LawChapterFile,
  type ProcessFile,
} from './lookup';
import { ModulesFileSchema, type ModulesFile } from './modules';
import { QuestionFileSchema, type QuestionFile } from './questions';

export * from './common';
export * from './modules';
export * from './questions';
export * from './cases';
export * from './content-index';
export * from './errors';
export * from './lookup';

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

/** Validates `content/uppslag/begrepp.yaml`, including references between terms. */
export function parseGlossaryFile(input: unknown): ParseResult<GlossaryFile> {
  return safeParseContent(GlossaryFileSchema, input);
}

/** Validates `content/uppslag/processer.yaml`, including arrows and layout of each map. */
export function parseProcessFile(input: unknown): ParseResult<ProcessFile> {
  return safeParseContent(ProcessFileSchema, input);
}

/** Validates `content/uppslag/lagar.yaml`. */
export function parseLawCatalog(input: unknown): ParseResult<LawCatalog> {
  return safeParseContent(LawCatalogSchema, input);
}

/** Validates a chapter file such as `content/uppslag/pbl-9-kap.yaml`. */
export function parseLawChapterFile(input: unknown): ParseResult<LawChapterFile> {
  return safeParseContent(LawChapterFileSchema, input);
}
