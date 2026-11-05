import { z } from 'zod';
import {
  fieldError,
  identifier,
  isoDate,
  lawRefs,
  moduleId,
  reviewFields,
  reviewStatus,
  text,
} from './common';

/*
 * Schemas for Uppslag (content/uppslag/): the glossary, the process maps, the catalogue of
 * statutes and the per-section summaries of a law chapter (PBL 9 kap.).
 */

/* ------------------------------------------------------------------------------ Glossary */

export const GlossaryTermSchema = z.strictObject({
  id: identifier,
  /** The term as she meets it, e.g. "Byggnadsarea". */
  term: text,
  /** Other names and older terms that should find the term in search (e.g. "attefallshus"). */
  synonymer: z
    .array(text, { error: fieldError('synonymer ska vara en lista, t.ex. [BYA].') })
    .optional(),
  /** One to three sentences in plain Swedish. */
  definition: text,
  lagrum: lawRefs.default([]),
  /** Ids of related terms in the same file. */
  relaterade: z
    .array(identifier, { error: fieldError('relaterade ska vara en lista med begrepps-id.') })
    .optional(),
  /** Module the term belongs to (id from moduler.yaml). */
  modul: moduleId,
  ...reviewFields,
});

export const GlossaryFileSchema = z
  .strictObject({
    begrepp: z
      .array(GlossaryTermSchema, { error: fieldError('begrepp ska vara en lista med begrepp.') })
      .min(1, { error: fieldError('begrepp.yaml måste innehålla minst ett begrepp.') }),
  })
  .superRefine((file, ctx) => {
    const ids = new Map<string, number>();
    const terms = new Map<string, number>();
    file.begrepp.forEach((term, index) => {
      const same = ids.get(term.id);
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['begrepp', index, 'id'],
          message: `Begrepps-id "${term.id}" finns redan (begrepp nr ${same + 1} i listan).`,
        });
      } else {
        ids.set(term.id, index);
      }
      const key = term.term.toLocaleLowerCase('sv');
      const sameTerm = terms.get(key);
      if (sameTerm !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['begrepp', index, 'term'],
          message: `Begreppet "${term.term}" finns redan (begrepp nr ${sameTerm + 1} i listan).`,
        });
      } else {
        terms.set(key, index);
      }
    });
    file.begrepp.forEach((term, index) => {
      const seen = new Set<string>();
      term.relaterade?.forEach((ref, refIndex) => {
        const path = ['begrepp', index, 'relaterade', refIndex];
        if (ref === term.id) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: 'Ett begrepp kan inte vara relaterat till sig självt.',
          });
        } else if (!ids.has(ref)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `Begreppet "${ref}" finns inte i begrepp.yaml.`,
          });
        } else if (seen.has(ref)) {
          ctx.addIssue({ code: 'custom', path, message: `"${ref}" står två gånger i relaterade.` });
        }
        seen.add(ref);
      });
    });
  });

export type GlossaryTerm = z.output<typeof GlossaryTermSchema>;
export type GlossaryFile = z.output<typeof GlossaryFileSchema>;

/* ---------------------------------------------------------------------------- Processes */

/** Longest step title that still fits two lines in a process map box. */
export const PROCESS_TITLE_MAX = 56;
/** Number of lanes (columns) a process map can use. */
export const PROCESS_LANES = 3;

export const ProcessBranchSchema = z.strictObject({
  /** Id of the step the branch leads to. */
  till: identifier,
  /** Answer or condition shown on the arrow, e.g. "Ja", "Nej", "Avvikelse". */
  etikett: text.optional(),
});

export const ProcessStepSchema = z.strictObject({
  id: identifier,
  titel: text.max(PROCESS_TITLE_MAX, {
    error: fieldError(
      `titel får vara högst ${PROCESS_TITLE_MAX} tecken så att den får plats i rutan.`,
    ),
  }),
  beskrivning: text,
  lagrum: lawRefs.default([]),
  /** Typical deadline, e.g. "Tio veckor från ansökningsdagen". */
  frist: text.optional(),
  /** A question that makes the step a branch point, e.g. "Är ansökan komplett?". */
  fraga: text.optional(),
  /**
   * Outgoing arrows. Without `nasta` the step leads to the next step in the list, unless it
   * is the last one or has `slut: true`.
   */
  nasta: z
    .array(ProcessBranchSchema, {
      error: fieldError('nasta ska vara en lista, t.ex. [{ till: S4 }].'),
    })
    .min(1, { error: fieldError('nasta behöver minst en rad; ta bort fältet annars.') })
    .optional(),
  /** The process ends here (no arrow to the next step in the list). */
  slut: z.boolean({ error: fieldError('slut ska vara true eller false.') }).optional(),
  /** Column in the map: 0 is the main flow, 1 and 2 are side tracks. */
  spar: z
    .number({ error: fieldError('spar ska vara 0, 1 eller 2.') })
    .int({ error: fieldError('spar ska vara 0, 1 eller 2.') })
    .min(0, { error: fieldError('spar ska vara 0, 1 eller 2.') })
    .max(PROCESS_LANES - 1, { error: fieldError('spar ska vara 0, 1 eller 2.') })
    .default(0),
  /** Glossary ids explained by the step. */
  begrepp: z
    .array(identifier, { error: fieldError('begrepp ska vara en lista med begrepps-id.') })
    .optional(),
  /** Another process that continues from this step (e.g. bygglov → startbesked). */
  se_process: identifier.optional(),
});

export type ProcessStep = z.output<typeof ProcessStepSchema>;

export interface ProcessEdge {
  from: string;
  to: string;
  label?: string;
  /** True when the arrow points back to an earlier step (a loop, e.g. new komplettering). */
  back: boolean;
}

export interface ProcessGraphNode {
  id: string;
  /** Row in the map, 0 for the first step. */
  rank: number;
  /** Column in the map (the step's `spar`). */
  lane: number;
}

export interface ProcessGraph {
  nodes: ProcessGraphNode[];
  edges: ProcessEdge[];
  /** Steps that cannot be reached from the first step. */
  unreachable: string[];
  /** Pairs of steps that end up in the same row and lane. */
  collisions: [string, string][];
  rows: number;
}

type GraphInput = { steg: readonly Pick<ProcessStep, 'id' | 'nasta' | 'slut' | 'spar'>[] };

/** The arrows of a process: explicit `nasta`, otherwise the next step in the list. */
export function processEdges(process: GraphInput): ProcessEdge[] {
  const index = new Map(process.steg.map((s, i) => [s.id, i]));
  const edges: ProcessEdge[] = [];
  process.steg.forEach((step, i) => {
    if (step.nasta) {
      for (const branch of step.nasta) {
        const target = index.get(branch.till);
        if (target === undefined) continue;
        edges.push({
          from: step.id,
          to: branch.till,
          ...(branch.etikett ? { label: branch.etikett } : {}),
          back: target <= i,
        });
      }
      return;
    }
    const next = process.steg[i + 1];
    if (!step.slut && next) edges.push({ from: step.id, to: next.id, back: false });
  });
  return edges;
}

/**
 * Rows and lanes of a process map. A step's row is one below the lowest-placed step that
 * leads to it with a forward arrow (steps are listed in reading order, so arrows to later
 * steps go forward and arrows to earlier steps are loops). Lanes come from `spar`.
 */
export function layoutProcessGraph(process: GraphInput): ProcessGraph {
  const edges = processEdges(process);
  const rank = new Map<string, number>();
  const first = process.steg[0];
  if (first) rank.set(first.id, 0);
  for (const step of process.steg.slice(1)) {
    let best = -1;
    for (const edge of edges) {
      if (edge.back || edge.to !== step.id) continue;
      const from = rank.get(edge.from);
      if (from !== undefined) best = Math.max(best, from + 1);
    }
    if (best >= 0) rank.set(step.id, best);
  }
  const unreachable = process.steg.filter((s) => !rank.has(s.id)).map((s) => s.id);
  const nodes: ProcessGraphNode[] = process.steg
    .filter((s) => rank.has(s.id))
    .map((s) => ({ id: s.id, rank: rank.get(s.id) ?? 0, lane: s.spar ?? 0 }));
  const cells = new Map<string, string>();
  const collisions: [string, string][] = [];
  for (const node of nodes) {
    const key = `${node.rank}:${node.lane}`;
    const other = cells.get(key);
    if (other) collisions.push([other, node.id]);
    else cells.set(key, node.id);
  }
  const rows = nodes.reduce((max, n) => Math.max(max, n.rank + 1), 0);
  return {
    nodes,
    edges: edges.filter((e) => rank.has(e.from) && rank.has(e.to)),
    unreachable,
    collisions,
    rows,
  };
}

export const ProcessSchema = z
  .strictObject({
    id: identifier,
    titel: text,
    /** One or two sentences about when the process applies. */
    beskrivning: text,
    modul: moduleId,
    steg: z
      .array(ProcessStepSchema, { error: fieldError('steg ska vara en lista med steg.') })
      .min(2, { error: fieldError('En process behöver minst två steg.') }),
    ...reviewFields,
  })
  .superRefine((process, ctx) => {
    const ids = new Map<string, number>();
    process.steg.forEach((step, index) => {
      const same = ids.get(step.id);
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['steg', index, 'id'],
          message: `Steg-id "${step.id}" finns redan i processen (steg nr ${same + 1}).`,
        });
      } else {
        ids.set(step.id, index);
      }
    });
    process.steg.forEach((step, index) => {
      const path = ['steg', index];
      step.nasta?.forEach((branch, branchIndex) => {
        if (!ids.has(branch.till)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'nasta', branchIndex, 'till'],
            message: `Steget "${branch.till}" finns inte i processen.`,
          });
        } else if (branch.till === step.id) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'nasta', branchIndex, 'till'],
            message: 'Ett steg kan inte leda till sig självt.',
          });
        }
        if ((step.nasta?.length ?? 0) > 1 && !branch.etikett) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'nasta', branchIndex],
            message:
              'När ett steg har flera vägar behöver varje väg en etikett, t.ex. "Ja" eller "Nej".',
          });
        }
      });
      if (step.slut && step.nasta) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'slut'],
          message: 'Ett steg med slut: true kan inte också ha nasta.',
        });
      }
      if (step.fraga && (step.nasta?.length ?? 0) < 2) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'fraga'],
          message: 'Ett steg med en fråga behöver minst två vägar i nasta (t.ex. Ja och Nej).',
        });
      }
    });
    const graph = layoutProcessGraph(process);
    for (const id of graph.unreachable) {
      ctx.addIssue({
        code: 'custom',
        path: ['steg', ids.get(id) ?? 0],
        message: `Steget "${id}" går inte att nå från första steget. Lägg till det i något stegs nasta.`,
      });
    }
    for (const [a, b] of graph.collisions) {
      ctx.addIssue({
        code: 'custom',
        path: ['steg', ids.get(b) ?? 0, 'spar'],
        message: `Steget "${b}" hamnar på samma rad och i samma spår som "${a}" i processkartan. Ge ett av dem ett annat spar.`,
      });
    }
  });

export const ProcessFileSchema = z
  .strictObject({
    processer: z
      .array(ProcessSchema, { error: fieldError('processer ska vara en lista med processer.') })
      .min(1, { error: fieldError('processer.yaml måste innehålla minst en process.') }),
  })
  .superRefine((file, ctx) => {
    const ids = new Map<string, number>();
    file.processer.forEach((process, index) => {
      const same = ids.get(process.id);
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['processer', index, 'id'],
          message: `Process-id "${process.id}" finns redan (process nr ${same + 1}).`,
        });
      } else {
        ids.set(process.id, index);
      }
    });
    file.processer.forEach((process, index) => {
      process.steg.forEach((step, stepIndex) => {
        if (step.se_process && !ids.has(step.se_process)) {
          ctx.addIssue({
            code: 'custom',
            path: ['processer', index, 'steg', stepIndex, 'se_process'],
            message: `Processen "${step.se_process}" finns inte i processer.yaml.`,
          });
        }
      });
    });
  });

export type Process = z.output<typeof ProcessSchema>;
export type ProcessFile = z.output<typeof ProcessFileSchema>;

/* ------------------------------------------------------------------------- Law catalogue */

/** Short code used first in a lagrum, e.g. "PBL" in "PBL 9 kap. 60 §". */
export const lawCode = z
  .string({ error: fieldError('kod ska vara en text, t.ex. PBL.') })
  .regex(/^[A-Za-zÅÄÖåäö0-9]+$/, {
    error: fieldError('kod får bara innehålla bokstäver och siffror, t.ex. PBL eller VägL.'),
  });

const httpsUrl = z
  .string({ error: fieldError('lank ska vara en adress som börjar med https://.') })
  .regex(/^https:\/\/\S+$/, {
    error: fieldError('lank ska vara en adress som börjar med https://.'),
  });

export const LawSchema = z.strictObject({
  kod: lawCode,
  /** Full name with SFS number, e.g. "Plan- och bygglagen (2010:900)". */
  namn: text,
  /** Link to the whole statute (riksdagen.se) or the publisher. */
  lank: httpsUrl,
  /** Chapter headings, for statutes divided into chapters. */
  kapitel: z
    .array(
      z.strictObject({
        nr: z
          .number({ error: fieldError('nr ska vara ett heltal.') })
          .int({ error: fieldError('nr ska vara ett heltal.') })
          .positive({ error: fieldError('nr ska vara 1 eller större.') }),
        rubrik: text,
      }),
      { error: fieldError('kapitel ska vara en lista med nr och rubrik.') },
    )
    .optional(),
});

export const LawCatalogSchema = z
  .strictObject({
    lagar: z
      .array(LawSchema, { error: fieldError('lagar ska vara en lista.') })
      .min(1, { error: fieldError('lagar.yaml måste innehålla minst en lag.') }),
  })
  .superRefine((file, ctx) => {
    const codes = new Map<string, number>();
    file.lagar.forEach((law, index) => {
      const same = codes.get(law.kod);
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['lagar', index, 'kod'],
          message: `Koden "${law.kod}" finns redan (lag nr ${same + 1}).`,
        });
      } else {
        codes.set(law.kod, index);
      }
      const chapters = new Set<number>();
      law.kapitel?.forEach((chapter, chapterIndex) => {
        if (chapters.has(chapter.nr)) {
          ctx.addIssue({
            code: 'custom',
            path: ['lagar', index, 'kapitel', chapterIndex, 'nr'],
            message: `Kapitel ${chapter.nr} står två gånger.`,
          });
        }
        chapters.add(chapter.nr);
      });
    });
  });

export type Law = z.output<typeof LawSchema>;
export type LawCatalog = z.output<typeof LawCatalogSchema>;

/* -------------------------------------------------------------- One chapter, section by section */

/** Section number as written in the law: "60", "17 a". */
export const sectionNumber = z
  .string({ error: fieldError('paragraf ska vara en text, t.ex. "60" eller "17 a".') })
  .regex(/^\d+(?: [a-z])?$/, {
    error: fieldError('paragraf ska skrivas som "60" eller "17 a" (utan §).'),
  });

export const LawSectionSchema = z
  .strictObject({
    paragraf: sectionNumber,
    /** The heading in the law that the section stands under. */
    rubrik: text.optional(),
    /** One sentence in plain Swedish (written for the app, not law text). */
    sammanfattning: text,
    /** The section's text in force, one paragraph or list item per line. */
    lagtext: text.optional(),
    /** The amending act that gave the section its wording, e.g. "Lag (2025:974)". */
    andrad_genom: text.optional(),
    /** The section is repealed, e.g. "Har upphävts genom lag (2026:712)". */
    upphavd: text.optional(),
    /** The section stops applying on this date. */
    upphor: isoDate.optional(),
    /** A new wording that enters into force later. */
    kommande: z
      .strictObject({ fran: isoDate, lagtext: text, andrad_genom: text.optional() })
      .optional(),
  })
  .superRefine((section, ctx) => {
    if (!section.lagtext && !section.upphavd) {
      ctx.addIssue({
        code: 'custom',
        path: ['lagtext'],
        message: 'Paragrafen behöver lagtext (eller upphavd om den är upphävd).',
      });
    }
  });

export const LawChapterFileSchema = z
  .strictObject({
    /** Code from lagar.yaml, e.g. PBL. */
    lag: lawCode,
    kapitel: z
      .number({ error: fieldError('kapitel ska vara ett heltal.') })
      .int({ error: fieldError('kapitel ska vara ett heltal.') })
      .positive({ error: fieldError('kapitel ska vara 1 eller större.') }),
    rubrik: text,
    /** Where the law text was taken from. */
    kalla: text,
    /** The text is current up to and including this SFS number, e.g. "SFS 2026:1583". */
    andrad_tom: text,
    hamtad: isoDate,
    status: reviewStatus.default('utkast'),
    rattslage: reviewFields.rattslage,
    granskad_av: text.optional(),
    granskad_datum: isoDate.optional(),
    paragrafer: z
      .array(LawSectionSchema, { error: fieldError('paragrafer ska vara en lista.') })
      .min(1, { error: fieldError('paragrafer behöver minst en paragraf.') }),
  })
  .superRefine((file, ctx) => {
    const seen = new Map<string, number>();
    let previous: number[] | undefined;
    file.paragrafer.forEach((section, index) => {
      const same = seen.get(section.paragraf);
      if (same !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['paragrafer', index, 'paragraf'],
          message: `${section.paragraf} § finns redan (rad ${same + 1} i listan).`,
        });
      }
      seen.set(section.paragraf, index);
      const key = sectionSortKey(section.paragraf);
      if (previous && compareSortKeys(previous, key) >= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['paragrafer', index, 'paragraf'],
          message: `${section.paragraf} § står i fel ordning; paragraferna ska komma i lagens ordning.`,
        });
      }
      previous = key;
    });
  });

export type LawSection = z.output<typeof LawSectionSchema>;
export type LawChapterFile = z.output<typeof LawChapterFileSchema>;

/** "17 a" → [17, 1], "60" → [60, 0]. */
export function sectionSortKey(section: string): number[] {
  const match = /^(\d+)(?: ([a-z]))?$/.exec(section.trim());
  if (!match) return [Number.MAX_SAFE_INTEGER, 0];
  const letter = match[2] ? match[2].charCodeAt(0) - 96 : 0;
  return [Number(match[1]), letter];
}

function compareSortKeys(a: number[], b: number[]): number {
  return (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0);
}

/* ----------------------------------------------------------------------- Parsed references */

export interface ParsedLawRef {
  /** "PBL" */
  code: string;
  chapter?: number;
  /** "60", "17 a" */
  section?: string;
}

/**
 * Splits a lagrum such as "PBL 9 kap. 60 §", "PBL 9 kap. 85–115 §§" or "FL 25 §" into its
 * parts. For a range or list of sections, `section` is the first one.
 */
export function parseLawRef(reference: string): ParsedLawRef {
  const trimmed = reference.trim();
  const code = trimmed.split(/\s+/)[0] ?? trimmed;
  const rest = trimmed.slice(code.length);
  const chapterMatch = /(\d+)\s*kap\./.exec(rest);
  const afterChapter = chapterMatch
    ? rest.slice(chapterMatch.index + chapterMatch[0].length)
    : rest;
  const sectionMatch = /^\s*(\d+)(?:\s([a-z]))?(?=\s*(?:§|[–-]|,|och\b))/.exec(afterChapter);
  return {
    code,
    ...(chapterMatch ? { chapter: Number(chapterMatch[1]) } : {}),
    ...(sectionMatch
      ? { section: sectionMatch[2] ? `${sectionMatch[1]} ${sectionMatch[2]}` : sectionMatch[1] }
      : {}),
  };
}
