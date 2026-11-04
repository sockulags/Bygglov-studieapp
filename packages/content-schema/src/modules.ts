import { z } from 'zod';
import { fieldError, lawRefs, moduleId, text } from './common';

export const ModuleSchema = z.strictObject({
  id: moduleId,
  titel: text,
  beskrivning: text,
  ordning: z
    .number({ error: fieldError('ordning ska vara ett heltal.') })
    .int({ error: fieldError('ordning ska vara ett heltal.') })
    .positive({ error: fieldError('ordning ska vara 1 eller större.') }),
  /** Short human-readable summary of the central law references. */
  lagrum_sammanfattning: text,
  /** Optional structured references, usable as links into Uppslag. */
  lagrum: lawRefs.optional(),
  lagrum_osaker: z
    .boolean({ error: fieldError('lagrum_osaker ska vara true eller false.') })
    .optional(),
});

export const ModulesFileSchema = z
  .strictObject({
    moduler: z
      .array(ModuleSchema, { error: fieldError('moduler ska vara en lista med moduler.') })
      .min(1, { error: fieldError('moduler.yaml måste innehålla minst en modul.') }),
  })
  .superRefine((file, ctx) => {
    const ids = new Map<string, number>();
    const orders = new Map<number, number>();
    file.moduler.forEach((module, index) => {
      const sameId = ids.get(module.id);
      if (sameId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['moduler', index, 'id'],
          message: `Modul-id "${module.id}" finns redan (modul nr ${sameId + 1} i listan).`,
        });
      } else {
        ids.set(module.id, index);
      }
      const sameOrder = orders.get(module.ordning);
      if (sameOrder !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['moduler', index, 'ordning'],
          message: `ordning ${module.ordning} används redan av modul nr ${sameOrder + 1} i listan.`,
        });
      } else {
        orders.set(module.ordning, index);
      }
      const prefix = Number.parseInt(module.id.slice(0, 2), 10);
      if (prefix !== module.ordning) {
        ctx.addIssue({
          code: 'custom',
          path: ['moduler', index, 'ordning'],
          message: `ordning (${module.ordning}) stämmer inte med numret i id "${module.id}".`,
        });
      }
    });
  });

export type Module = z.output<typeof ModuleSchema>;
export type ModulesFile = z.output<typeof ModulesFileSchema>;
export type ModulesFileInput = z.input<typeof ModulesFileSchema>;
