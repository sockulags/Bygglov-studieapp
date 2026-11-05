import type { CaseFile, LookupContent, Module } from '@/content';
import type { PaletteSources } from './palette-items';

const module = (id: string, ordning: number, titel: string): Module => ({
  id,
  ordning,
  titel,
  beskrivning: `Om ${titel.toLowerCase()}.`,
  lagrum_sammanfattning: 'PBL 9 kap.',
});

/** Only the fields the palette reads; the rest of a case is irrelevant here. */
const caseStub = (id: string, titel: string, niva: 1 | 2 | 3 | 4, fastighet: string) =>
  ({ id, titel, niva, fastighet, sammanfattning: `Ärendet ${titel}.` }) as unknown as CaseFile;

export const sampleLookup: LookupContent = {
  glossary: [
    {
      id: 'nockhojd',
      term: 'Nockhöjd',
      definition: 'Höjden från markens medelnivå till taknockens översta del.',
      lagrum: [],
      modul: '03-lovplikt',
      status: 'utkast',
      rattslage: '2025-12-01',
    },
    {
      id: 'komplementbyggnad',
      term: 'Komplementbyggnad',
      synonymer: ['uthus', 'garage'],
      definition: 'En fristående byggnad som hör till ett bostadshus.',
      lagrum: [],
      modul: '03-lovplikt',
      status: 'utkast',
      rattslage: '2025-12-01',
    },
  ],
  processes: [],
  laws: [],
  chapters: [
    {
      lag: 'PBL',
      kapitel: 9,
      paragrafer: [
        {
          paragraf: '6',
          rubrik: 'Ändring av byggnad',
          sammanfattning: 'När en ändring kräver bygglov.',
          lagtext: 'Text.',
        },
        {
          paragraf: '60',
          rubrik: 'Förutsättningar för bygglov',
          sammanfattning: 'Vad som ska vara uppfyllt för bygglov i detaljplan.',
          lagtext: 'Text.',
        },
      ],
    },
  ] as unknown as LookupContent['chapters'],
};

export function sampleSources(overrides: Partial<PaletteSources> = {}): PaletteSources {
  return {
    modules: [
      module('06-handlaggning', 6, 'Handläggningsprocessen'),
      module('03-lovplikt', 3, 'Lovplikt'),
      module('09-tom', 9, 'Tom modul'),
    ],
    questionCounts: new Map([
      ['03-lovplikt', 50],
      ['06-handlaggning', 48],
    ]),
    cases: [
      caseStub('A001', 'Komplementbyggnad nära gräns', 1, 'Lärken 4'),
      caseStub('A002', 'Tillbyggnad av enbostadshus', 2, 'Björken 7'),
    ],
    lookup: sampleLookup,
    theme: 'system',
    ...overrides,
  };
}
