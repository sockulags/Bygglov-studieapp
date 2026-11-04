import { z } from 'zod';
import { identifier, isoDate, moduleId, reviewStatus, text } from './common';

const statusCounts = z.strictObject({
  utkast: z.number().int().nonnegative(),
  granskad: z.number().int().nonnegative(),
});

/** Summary written by `content:build` to `content-dist/index.json`. */
export const ContentIndexSchema = z.strictObject({
  /** Format version of the generated JSON. */
  format: z.literal(1),
  moduler: z.array(
    z.strictObject({
      id: moduleId,
      titel: text,
      ordning: z.number().int(),
      antal_fragor: z.number().int().nonnegative(),
    }),
  ),
  fragor: z.strictObject({ totalt: z.number().int().nonnegative(), status: statusCounts }),
  arenden: z.array(
    z.strictObject({
      id: identifier,
      titel: text,
      niva: z.number().int(),
      status: reviewStatus,
      rattslage: isoDate,
      antal_steg: z.number().int().nonnegative(),
      antal_handlingar: z.number().int().nonnegative(),
    }),
  ),
});

export type ContentIndex = z.output<typeof ContentIndexSchema>;
