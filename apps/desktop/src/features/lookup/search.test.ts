import { describe, expect, it } from 'vitest';
import type { LookupContent } from '@/content';
import { buildLawRegister } from './law-register';
import { buildSearchIndex, groupHits, normalize, normalizeQuery, searchLookup } from './search';
import { sampleProcess } from './test-fixtures';

const lookup = {
  glossary: [
    {
      id: 'nockhojd',
      term: 'Nockhöjd',
      synonymer: ['taknockshöjd'],
      definition: 'Höjden till taknocken.',
      lagrum: ['PBL 9 kap. 4 §'],
      modul: '05-ritningslasning',
      status: 'utkast',
      rattslage: '2025-12-01',
    },
    {
      id: 'liten-avvikelse',
      term: 'Liten avvikelse',
      definition: 'Lov trots avvikelse från planen.',
      lagrum: ['PBL 9 kap. 60 §'],
      modul: '06-handlaggning',
      status: 'utkast',
      rattslage: '2025-12-01',
    },
  ],
  processes: [sampleProcess()],
  laws: [{ kod: 'PBL', namn: 'Plan- och bygglagen (2010:900)', lank: 'https://www.riksdagen.se/' }],
  chapters: [
    {
      lag: 'PBL',
      kapitel: 9,
      rubrik: 'Lov och förhandsbesked',
      kalla: 'riksdagen.se',
      andrad_tom: 'SFS 2026:1583',
      hamtad: '2026-11-04',
      status: 'utkast',
      rattslage: '2025-12-01',
      paragrafer: [
        {
          paragraf: '4',
          rubrik: 'Komplementbyggnader',
          sammanfattning: 'Lovbefriade komplementbyggnader.',
          lagtext: 'Text.',
        },
        {
          paragraf: '60',
          rubrik: 'Liten avvikelse',
          sammanfattning: 'Lov trots liten avvikelse.',
          lagtext: 'Text.',
        },
        { paragraf: '99 a', sammanfattning: 'Värmepumpar.', lagtext: 'Text.' },
      ],
    },
  ],
} as unknown as LookupContent;

const register = buildLawRegister({ questionsByModule: new Map(), cases: [], lookup });
const index = buildSearchIndex(lookup, register);
const top = (query: string) => searchLookup(index, query)[0]?.doc;

describe('normalize', () => {
  it('drops case, diacritics, dots and §', () => {
    expect(normalize('PBL 9 kap. 60 §')).toBe('pbl 9 kap 60');
    expect(normalize('Nockhöjd')).toBe('nockhojd');
    expect(normalizeQuery('9:60')).toBe('9 kap 60');
  });
});

describe('searchLookup', () => {
  it('finds a section of 9 kap. however it is written', () => {
    for (const query of ['9 kap. 60 §', '9 kap 60', 'PBL 9 kap 60', '9:60']) {
      expect(top(query), query).toMatchObject({ kind: 'lagrum', title: 'PBL 9 kap. 60 §' });
    }
    expect(top('9 kap 99 a')?.title).toBe('PBL 9 kap. 99 a §');
    expect(top('9 kap 60')?.target).toEqual({ kind: 'section', key: 'PBL 9 kap. 60 §' });
  });

  it('finds terms by name, prefix and synonym', () => {
    expect(top('nockhöjd')?.target).toEqual({ kind: 'term', id: 'nockhojd' });
    expect(top('nockh')?.target).toEqual({ kind: 'term', id: 'nockhojd' });
    expect(top('taknockshojd')?.target).toEqual({ kind: 'term', id: 'nockhojd' });
  });

  it('finds process steps and opens the step', () => {
    expect(top('komplettering')?.kind).toBe('process');
    const hit = searchLookup(index, 'föreläggande om komplettering')[0]?.doc;
    expect(hit?.target).toEqual({ kind: 'process', processId: 'prov', stepId: 'komplettering' });
  });

  it('lists other references from the register', () => {
    const hit = searchLookup(index, 'FL 20').find((h) => h.doc.title === 'FL 20 §');
    expect(hit?.doc.target).toEqual({ kind: 'reference', reference: 'FL 20 §' });
  });

  it('returns nothing for an empty or unknown query and groups hits by kind', () => {
    expect(searchLookup(index, '  ')).toEqual([]);
    expect(searchLookup(index, 'xyzzy')).toEqual([]);
    const groups = groupHits(searchLookup(index, 'avvikelse'));
    expect(groups.map((g) => g.label)).toContain('Begrepp');
    for (const group of groups) expect(group.hits.length).toBeLessThanOrEqual(8);
  });
});
