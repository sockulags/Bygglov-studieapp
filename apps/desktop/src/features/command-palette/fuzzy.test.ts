import { describe, expect, it } from 'vitest';
import { fold, fuzzyMatch, mergeRanges, queryWords, scoreFields } from './fuzzy';

describe('fold', () => {
  it('removes diacritics and keeps the length', () => {
    expect(fold('Förhandsbesked')).toBe('forhandsbesked');
    expect(fold('Åtgärd')).toBe('atgard');
    expect(fold('PBL 9 kap. 60 §')).toBe('pbl 9 kap  60  ');
    for (const text of ['Ärenden', 'Nockhöjd §', 'Café – é', 'Øre æ']) {
      expect(fold(text)).toHaveLength(text.length);
    }
  });

  it('splits a query into folded words', () => {
    expect(queryWords('  Bygg-lov ÄR ')).toEqual(['bygg', 'lov', 'ar']);
    expect(queryWords(' – ')).toEqual([]);
  });
});

describe('fuzzyMatch', () => {
  it('tolerates a, o for å, ä, ö in both directions', () => {
    expect(fuzzyMatch('nockhojd', 'Nockhöjd')).not.toBeNull();
    expect(fuzzyMatch('nockhöjd', 'Nockhojd')).not.toBeNull();
    expect(fuzzyMatch('arenden', 'Ärenden')).not.toBeNull();
    expect(fuzzyMatch('åtgard', 'Åtgärd')).not.toBeNull();
  });

  it('ranks whole text over prefix over word start over inside a word', () => {
    const exact = fuzzyMatch('bygglov', 'Bygglov')!.score;
    const prefix = fuzzyMatch('bygglov', 'Bygglovsplikt')!.score;
    const wordStart = fuzzyMatch('bygglov', 'Tidsbegränsat bygglov')!.score;
    const inside = fuzzyMatch('lov', 'Bygglov')!.score;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inside);
  });

  it('prefers a whole word over the start of a longer one', () => {
    const six = fuzzyMatch('9 kap 6', 'PBL 9 kap. 6 §')!.score;
    const sixty = fuzzyMatch('9 kap 6', 'PBL 9 kap. 60 §')!.score;
    expect(six).toBeGreaterThan(sixty);
  });

  it('requires every word', () => {
    expect(fuzzyMatch('snabbquiz lov', 'Starta snabbquiz i Lovplikt')).not.toBeNull();
    expect(fuzzyMatch('snabbquiz plan', 'Starta snabbquiz i Lovplikt')).toBeNull();
  });

  it('matches abbreviations as a subsequence from a word start', () => {
    const match = fuzzyMatch('ovk', 'Obligatorisk ventilationskontroll');
    expect(match).not.toBeNull();
    expect(match!.ranges[0]).toEqual([0, 1]);
    // A subsequence must start at a word start, and single letters never match inside words.
    expect(fuzzyMatch('xk', 'Obligatorisk ventilationskontroll')).toBeNull();
    expect(fuzzyMatch('j', 'Nockhöjd')).toBeNull();
  });

  it('gives highlight ranges in the original text', () => {
    const text = 'Byggnadsnämndens förhandsbesked';
    const match = fuzzyMatch('förh', text)!;
    expect(match.ranges).toEqual([[17, 21]]);
    expect(text.slice(17, 21)).toBe('förh');
  });

  it('returns null for an empty query', () => {
    expect(fuzzyMatch('   ', 'Hem')).toBeNull();
  });
});

describe('mergeRanges', () => {
  it('sorts and joins touching ranges', () => {
    expect(
      mergeRanges([
        [5, 6],
        [0, 2],
        [2, 3],
        [6, 8],
      ]),
    ).toEqual([
      [0, 3],
      [5, 8],
    ]);
  });
});

describe('scoreFields', () => {
  it('weights title over keywords over detail', () => {
    const title = scoreFields('strand', { title: 'Strandskydd' })!.score;
    const keyword = scoreFields('strand', { title: 'Dispens', keywords: ['strandskydd'] })!.score;
    const detail = scoreFields('strand', { title: 'Dispens', detail: 'Strandskydd gäller' })!.score;
    expect(title).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(detail);
  });

  it('lets words match in different fields, and highlights only the title', () => {
    const match = scoreFields('lovplikt modul 3', {
      title: 'Lovplikt',
      keywords: ['modul 3'],
    });
    expect(match).not.toBeNull();
    expect(match!.ranges).toEqual([[0, 8]]);
  });

  it('rewards a query that covers the whole title', () => {
    const whole = scoreFields('pbl 9 kap 60', { title: 'PBL 9 kap. 60 §' })!.score;
    const part = scoreFields('pbl 9 kap 60', { title: 'PBL 9 kap. 60 a §' })!.score;
    expect(whole).toBeGreaterThan(part);
  });
});
