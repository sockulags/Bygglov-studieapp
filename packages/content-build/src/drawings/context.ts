import type { TitleBlockParams } from './schema';
import type { TitleBlockData } from './svg';

/** What a generator knows about the document besides its parameters. */
export interface DrawingContext {
  /** The case's `fastighet`, e.g. "Björken 7, Åkerslunda kommun". */
  fastighet: string;
  /** The case title, used as the project line. */
  projekt: string;
  /** The handling's title, used as the text alternative. */
  titel: string;
  /** The handling's `inkom`, or the case start date. */
  datum: string;
  /** Prefix for ids inside the SVG, unique per document (e.g. `A002-H2`). */
  idPrefix: string;
}

/** Fills the title block from parameters, falling back on the context. */
export function titleData(
  context: DrawingContext,
  overrides: TitleBlockParams | undefined,
  defaults: { ritningstyp: string; skala: number },
): TitleBlockData {
  return {
    fastighet: overrides?.fastighet ?? context.fastighet,
    projekt: overrides?.projekt ?? context.projekt,
    ritningstyp: overrides?.ritningstyp ?? defaults.ritningstyp,
    skala: `1:${defaults.skala}`,
    datum: overrides?.datum ?? context.datum,
    ritningsnummer: overrides?.ritningsnummer,
    ritadAv: overrides?.ritad_av,
  };
}

/** Makes a string safe to use as an XML id. */
export function idSafe(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '-');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `r-${cleaned}`;
}

/** The property label without the municipality: "Björken 7, Åkerslunda kommun" → "Björken 7". */
export function shortProperty(fastighet: string): string {
  return fastighet.split(',')[0]?.trim() || fastighet;
}
