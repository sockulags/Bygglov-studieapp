import { describe, expect, it } from 'vitest';
import { buildPaletteItems, searchPalette, type PaletteItem } from './palette-items';
import { sampleSources } from './test-fixtures';

const items = buildPaletteItems(sampleSources());
const byId = (id: string): PaletteItem => {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
};
const titles = (query: string, recent: string[] = []) =>
  searchPalette(items, query, recent).map((g) => [g.label, g.results.map((r) => r.item.title)]);

describe('buildPaletteItems', () => {
  it('has every view with its g-shortcut', () => {
    expect(byId('view:/').shortcut).toEqual(['g', 'h']);
    expect(byId('view:/cases').shortcut).toEqual(['g', 'ä']);
    expect(byId('view:/settings').action).toEqual({ type: 'navigate', to: '/settings' });
  });

  it('offers quiz actions only for modules with questions, in module order', () => {
    expect(byId('action:quiz:03-lovplikt').title).toBe('Starta snabbquiz i Lovplikt');
    expect(byId('action:quiz:03-lovplikt').action).toEqual({
      type: 'start',
      request: { mode: 'quick-quiz', moduleIds: ['03-lovplikt'] },
    });
    expect(items.some((i) => i.id.includes('09-tom'))).toBe(false);
    const modules = items.filter((i) => i.group === 'modules').map((i) => i.title);
    expect(modules).toEqual(['Lovplikt', 'Handläggningsprocessen']);
  });

  it('offers the themes that are not the current one', () => {
    const dark = buildPaletteItems(sampleSources({ theme: 'dark' }));
    expect(dark.map((i) => i.title)).not.toContain('Byt till mörkt läge');
    expect(dark.map((i) => i.title)).toContain('Byt till ljust läge');
    expect(items.map((i) => i.title)).not.toContain('Följ systemets tema');
  });

  it('turns cases, terms and 9 kap. sections into items with Uppslag targets', () => {
    expect(byId('case:A002').title).toBe('A002 · Tillbyggnad av enbostadshus');
    expect(byId('case:A002').detail).toBe('Björken 7 · Nivå 2 · normal');
    expect(byId('term:nockhojd').action).toEqual({
      type: 'lookup',
      target: { kind: 'term', id: 'nockhojd' },
    });
    expect(byId('section:PBL 9 kap. 60 §').detail).toBe(
      'Förutsättningar för bygglov · Vad som ska vara uppfyllt för bygglov i detaljplan.',
    );
  });

  it('gives every item a unique id', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});

describe('searchPalette', () => {
  it('shows views and actions, not the long lists, for an empty query', () => {
    const groups = searchPalette(items, '');
    expect(groups.map((g) => g.label)).toEqual(['Vyer', 'Åtgärder']);
    expect(groups[0]?.results[0]?.item.title).toBe('Hem');
  });

  it('puts recent picks first and does not repeat them', () => {
    const groups = searchPalette(items, '  ', ['term:nockhojd', 'view:/lookup', 'gone']);
    expect(groups[0]?.label).toBe('Senaste');
    expect(groups[0]?.results.map((r) => r.item.id)).toEqual(['term:nockhojd', 'view:/lookup']);
    const views = groups.find((g) => g.label === 'Vyer');
    expect(views?.results.map((r) => r.item.id)).not.toContain('view:/lookup');
  });

  it('finds terms without å/ä/ö and through synonyms', () => {
    expect(titles('nockhojd')[0]).toEqual(['Begrepp', ['Nockhöjd']]);
    expect(titles('garage')).toContainEqual(['Begrepp', ['Komplementbyggnad']]);
  });

  it('finds views by name without diacritics', () => {
    expect(titles('arenden')[0]?.[1]).toContain('Ärenden');
    expect(titles('installn')[0]?.[1]?.[0]).toBe('Inställningar');
  });

  it('understands "9:60" and ranks the exact paragraph first', () => {
    const groups = searchPalette(items, '9:60');
    expect(groups[0]?.label).toBe('Lagrum');
    expect(groups[0]?.results[0]?.item.title).toBe('PBL 9 kap. 60 §');
    const six = searchPalette(items, '9 kap 6').find((g) => g.label === 'Lagrum');
    expect(six?.results.map((r) => r.item.title)).toEqual(['PBL 9 kap. 6 §', 'PBL 9 kap. 60 §']);
  });

  it('finds quiz actions by module name', () => {
    const groups = searchPalette(items, 'snabbquiz lovpl');
    expect(groups[0]?.label).toBe('Åtgärder');
    expect(groups[0]?.results.map((r) => r.item.title)).toEqual(['Starta snabbquiz i Lovplikt']);
  });

  it('puts the group with the best hit first', () => {
    expect(searchPalette(items, 'björken')[0]?.label).toBe('Ärenden');
    expect(searchPalette(items, 'mörkt')[0]?.results[0]?.item.title).toBe('Byt till mörkt läge');
  });

  it('lets a recent pick win a tie', () => {
    const plain = searchPalette(items, 'starta snabbquiz')[0]?.results.map((r) => r.item.id);
    const recent = searchPalette(items, 'starta snabbquiz', [
      'action:quiz:06-handlaggning',
    ])[0]?.results.map((r) => r.item.id);
    expect(plain?.[0]).not.toBe('action:quiz:06-handlaggning');
    expect(recent?.[0]).toBe('action:quiz:06-handlaggning');
  });

  it('returns highlight ranges for the title', () => {
    const hit = searchPalette(items, 'nock')[0]?.results[0];
    expect(hit?.ranges).toEqual([[0, 4]]);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchPalette(items, 'xyzzy')).toEqual([]);
  });
});
