import { z } from 'zod';

/** Legal state the content was written against, unless stated otherwise. */
export const DEFAULT_LEGAL_STATE = '2025-12-01';

/**
 * Schema-level message that steps aside when the field is missing, so the generic
 * "Fältet saknas" message from the error map is shown instead.
 */
export const fieldError =
  (message: string) =>
  (issue: { input?: unknown }): string | undefined =>
    issue.input === undefined ? undefined : message;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar date as `YYYY-MM-DD`. YAML 1.1 parsers may turn unquoted dates into `Date`
 * objects, so those are normalised back to a string before validation.
 */
export const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z
    .string({ error: fieldError('Datum ska skrivas som ÅÅÅÅ-MM-DD, t.ex. 2026-03-02.') })
    .regex(ISO_DATE, { error: fieldError('Datum ska skrivas som ÅÅÅÅ-MM-DD, t.ex. 2026-03-02.') })
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      error: fieldError('Datumet finns inte i kalendern.'),
    }),
);

/** Non-empty trimmed text. */
export const text = z
  .string({
    error: (issue) => {
      if (issue.input === undefined) return undefined;
      if (issue.input !== null && typeof issue.input === 'object' && !Array.isArray(issue.input)) {
        return 'Ska vara en text, men YAML läste raden som ett objekt. Sätt texten inom citattecken om den innehåller ": " (eller ", " inuti { }).';
      }
      return 'Ska vara en text.';
    },
  })
  .trim()
  .min(1, { error: fieldError('Får inte vara tom.') });

/** Identifier used for references: letters, digits, `-` and `_`, no spaces. */
export const identifier = z
  .string({ error: fieldError('Id ska vara en text.') })
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    error: fieldError('Id får bara innehålla bokstäver a–z, siffror, - och _ (inga mellanslag eller å, ä, ö).'),
  });

/** Module id, e.g. `03-lovplikt`. */
export const moduleId = z
  .string({ error: fieldError('Modul-id ska vara en text.') })
  .regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: fieldError('Modul-id ska ha formatet NN-namn, t.ex. 03-lovplikt (gemener, inga å, ä, ö).'),
  });

/** List of law references, e.g. `PBL 9 kap.`. Prefer the chapter over a guessed section. */
export const lawRefs = z.array(text, { error: fieldError('lagrum ska vara en lista, t.ex. [PBL 9 kap.].') });

export const tags = z.array(text, { error: fieldError('taggar ska vara en lista, t.ex. [lovplikt, plank].') });

export const reviewStatus = z.enum(['utkast', 'granskad'], {
  error: fieldError('status ska vara "utkast" eller "granskad".'),
});

/**
 * Fields every question and case carries: review status and the legal state it was written
 * against. Spread into each object schema.
 */
export const reviewFields = {
  status: reviewStatus.default('utkast'),
  rattslage: isoDate.default(DEFAULT_LEGAL_STATE),
  lagrum_osaker: z.boolean({ error: fieldError('lagrum_osaker ska vara true eller false.') }).optional(),
  granskad_av: text.optional(),
  granskad_datum: isoDate.optional(),
};

/** Free-form JSON-compatible parameters (drawing parameters, plan facts). */
export const jsonRecord = z.record(z.string(), z.json(), {
  error: fieldError('Ska vara en samling nyckel: värde.'),
});

export const nonNegativeNumber = z
  .number({ error: fieldError('Ska vara ett tal.') })
  .nonnegative({ error: fieldError('Får inte vara negativt.') });

export const wholeDays = z
  .number({ error: fieldError('Antal dagar ska vara ett heltal.') })
  .int({ error: fieldError('Antal dagar ska vara ett heltal.') })
  .nonnegative({ error: fieldError('Antal dagar får inte vara negativt.') });
