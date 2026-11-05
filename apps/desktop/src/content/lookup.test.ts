import { describe, expect, it } from 'vitest';
import { ContentLoadError } from './assemble';
import { assembleLookup, loadLookup } from './lookup';

const term = (id: string, name: string) => ({
  id,
  term: name,
  definition: 'Förklaring.',
  modul: '03-lovplikt',
});

describe('assembleLookup', () => {
  it('sorts the glossary in Swedish order and ignores files outside uppslag/', () => {
    const lookup = assembleLookup({
      'uppslag/begrepp.json': {
        begrepp: [term('oppenarea', 'Öppenarea'), term('vind', 'Vind'), term('area', 'Area')],
      },
      'moduler.json': { moduler: [] },
    });
    expect(lookup.glossary.map((t) => t.term)).toEqual(['Area', 'Vind', 'Öppenarea']);
    expect(lookup.glossary[0]).toMatchObject({ lagrum: [], status: 'utkast', rattslage: '2025-12-01' });
    expect(lookup.processes).toEqual([]);
    expect(lookup.chapters).toEqual([]);
  });

  it('throws a readable error for an invalid file', () => {
    const broken = { begrepp: [term('a', 'A'), { ...term('b', 'B'), relaterade: ['saknas'] }] };
    expect(() => assembleLookup({ 'uppslag/begrepp.json': broken })).toThrow(ContentLoadError);
    expect(() => assembleLookup({ 'uppslag/begrepp.json': broken })).toThrow(/saknas/);
  });

  it('loads the bundled Uppslag content without errors', () => {
    const lookup = loadLookup();
    expect(loadLookup()).toBe(lookup);
    for (const chapter of lookup.chapters) expect(chapter.paragrafer.length).toBeGreaterThan(0);
  });
});
