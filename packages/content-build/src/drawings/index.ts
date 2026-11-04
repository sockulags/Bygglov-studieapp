// Drawing generator: parameters in a case's arende.yaml → deterministic SVG.
import { safeParseContent, type ParseResult } from '@bygglov/content-schema';
import type { DrawingContext } from './context';
import { renderFasadritning } from './fasadritning';
import { renderPlankarta } from './plankarta';
import { renderPlanritning } from './planritning';
import { DRAWING_KINDS, DRAWING_SCHEMAS, type DrawingKind, type DrawingSpec } from './schema';
import { renderSituationsplan } from './situationsplan';

export * from './schema';
export type { DrawingContext } from './context';
export { DrawingDoesNotFitError } from './svg';

export function isDrawingKind(typ: string): typ is DrawingKind {
  return (DRAWING_KINDS as string[]).includes(typ);
}

/** A handling is generated when it has `parametrar` and its file is an SVG. */
export function isGeneratedDrawing(h: { fil: string; parametrar?: unknown }): boolean {
  return h.parametrar !== undefined && h.fil.toLowerCase().endsWith('.svg');
}

/** Validates drawing parameters against the schema for `kind`. Messages are in Swedish. */
export function parseDrawing(kind: DrawingKind, input: unknown): ParseResult<DrawingSpec> {
  const result = safeParseContent(DRAWING_SCHEMAS[kind], input);
  if (!result.success) return result;
  return { success: true, data: { kind, params: result.data } as DrawingSpec };
}

/** Renders a validated drawing. Throws `DrawingDoesNotFitError` if no sheet is large enough. */
export function renderDrawing(spec: DrawingSpec, context: DrawingContext): string {
  switch (spec.kind) {
    case 'situationsplan':
      return renderSituationsplan(spec.params, context);
    case 'fasadritning':
      return renderFasadritning(spec.params, context);
    case 'planritning':
      return renderPlanritning(spec.params, context);
    case 'plankarta':
      return renderPlankarta(spec.params, context);
  }
}

/** Validates and renders in one go. Throws with the Swedish validation messages on bad input. */
export function generateDrawing(
  kind: DrawingKind,
  input: unknown,
  context: DrawingContext,
): string {
  const parsed = parseDrawing(kind, input);
  if (!parsed.success) {
    throw new Error(
      `Ogiltiga parametrar för ${kind}:\n${parsed.issues.map((i) => `  ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`,
    );
  }
  return renderDrawing(parsed.data, context);
}
