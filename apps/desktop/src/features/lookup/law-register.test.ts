import { describe, expect, it } from 'vitest';
import type { CaseFile, Question } from '@bygglov/content-schema';
import { buildLawRegister, matchesQuery } from './law-register';

const question = (id: string, lagrum: string[]) => ({ id, lagrum }) as unknown as Question;

const caseFile = {
  id: 'A099',
  steg: [
    { id: 'S1', lagrum: ['PBL 9 kap. 91 §', 'FL 25 §'] },
    { id: 'S2', lagrum: ['VägL 39 §'] },
  ],
  handelser: [{ id: 'E1', effekt: { nytt_steg: { id: 'S3', lagrum: ['PBL 13 kap. 16 §'] } } }],
} as unknown as CaseFile;

describe('law register', () => {
  it('collects references from questions and from every step of the cases', () => {
    const groups = buildLawRegister({
      questionsByModule: new Map([['06-handlaggning', [question('q1', ['PBL 9 kap. 91 §'])]]]),
      cases: [caseFile],
    });
    expect(groups.map((g) => g.code)).toEqual(['PBL', 'FL', 'VägL']);
    const pbl = groups[0]?.entries ?? [];
    expect(pbl.map((e) => e.reference)).toEqual(['PBL 9 kap. 91 §', 'PBL 13 kap. 16 §']);
    expect(pbl[0]).toMatchObject({
      questionCount: 1,
      moduleIds: ['06-handlaggning'],
      caseIds: ['A099'],
    });
    expect(pbl[1]).toMatchObject({ questionCount: 0, caseIds: ['A099'] });
    expect(groups[2]?.name).toBe('Väglagen (1971:948)');
  });

  it('matches references without caring about dots, spaces and §', () => {
    expect(matchesQuery('PBL 9 kap. 99 §', '9 kap 99')).toBe(true);
    expect(matchesQuery('PBL 9 kap. 99 §', '9 kap 98')).toBe(false);
  });
});
