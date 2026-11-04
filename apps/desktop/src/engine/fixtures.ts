/** Test fixtures: questions parsed through the real content schema so defaults apply. */
import { QuestionSchema, type Question } from '@bygglov/content-schema';
import type { QuestionPool } from './session/session';

const base = { svarighet: 1, forklaring: 'Förklaring.', lagrum: ['PBL 9 kap. 4 §'] };

export function q(input: Record<string, unknown>): Question {
  return QuestionSchema.parse({ ...base, ...input });
}

export const multipleChoice = q({
  id: 'mc',
  typ: 'flerval',
  fraga: 'Vilken?',
  alternativ: [
    { text: 'A' },
    { text: 'B', ratt: true, forklaring: 'B är rätt.' },
    { text: 'C', forklaring: 'C är fel.' },
  ],
});

export const multipleAnswer = q({
  id: 'ma',
  typ: 'flersvar',
  fraga: 'Vilka?',
  alternativ: [
    { text: 'A', ratt: true },
    { text: 'B', ratt: true },
    { text: 'C' },
    { text: 'D', ratt: true },
    { text: 'E' },
  ],
});

export const trueFalse = q({ id: 'tf', typ: 'sant_falskt', fraga: 'Sant?', svar: false });

export const cloze = q({
  id: 'cl',
  typ: 'lucktext',
  fraga: 'Beslut inom ___ veckor, förlängning ___ veckor, föreläggande inom ___ veckor.',
  svar: ['10', '10', 3],
  lagrum: ['PBL 9 kap. 99 §'],
});

export const clozeText = q({
  id: 'ct',
  typ: 'lucktext',
  fraga: 'Kungörelse sker på kommunens ___ och höjden får vara ___ m.',
  svar: [['anslagstavla', 'digitala anslagstavla'], '4,5'],
});

export const clozeTolerance = q({
  id: 'ctol',
  typ: 'lucktext',
  fraga: 'Byggnadsarean är ___ kvm.',
  svar: ['138'],
  tolerans: 1,
});

export const matching = q({
  id: 'mt',
  typ: 'para_ihop',
  fraga: 'Para ihop.',
  par: [
    { vanster: 'Komplementbyggnad inom plan', hoger: '9 kap. 4 §' },
    { vanster: 'Komplementbyggnad utanför plan', hoger: '9 kap. 5 §' },
    { vanster: 'Handläggningstid', hoger: '9 kap. 99 §' },
  ],
});

export const ordering = q({
  id: 'or',
  typ: 'ordning',
  fraga: 'Ordna.',
  poster: ['Ansökan', 'Underrättelse', 'Kommunicering', 'Beslut', 'Kungörelse'],
});

export const calculation = q({
  id: 'ca',
  typ: 'berakning',
  fraga: 'Räkna.',
  svar: 4.5,
  tolerans: 0.05,
  enhet: 'm',
  losning: 'Så här.',
});

export const open = q({
  id: 'op',
  typ: 'oppen',
  fraga: 'Förklara.',
  bedomningspunkter: ['Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4'],
  modellsvar: 'Modellsvar.',
  lagrum_osaker: true,
});

export const drawingNumeric = q({
  id: 'dn',
  typ: 'ritning',
  fraga: 'Läs av.',
  fil: 'a.svg',
  svar: 12,
  enhet: 'kvm',
});

export const drawingSelf = q({
  id: 'ds',
  typ: 'ritning',
  fraga: 'Beskriv.',
  fil: 'a.svg',
  bedomningspunkter: ['X'],
});

function many(prefix: string, count: number): Question[] {
  return Array.from({ length: count }, (_, i) =>
    q({ id: `${prefix}-${i + 1}`, typ: 'sant_falskt', fraga: `Fråga ${i + 1}`, svar: true }),
  );
}

export const pool: QuestionPool = [
  { modul: '03-lovplikt', fragor: [...many('lov', 12), open] },
  { modul: '06-handlaggning', fragor: [...many('han', 8), cloze] },
  { modul: '01-forvaltning', fragor: many('fl', 3) },
];
