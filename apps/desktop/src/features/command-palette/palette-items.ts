import type { NavPath } from '@/app/navigation';
import { allNav } from '@/app/navigation';
import type { CaseFile, LookupContent, Module } from '@/content';
import { sectionKey } from '@/features/lookup/law-register';
import type { LookupTarget } from '@/features/lookup/search';
import type { StartRequest } from '@/features/study/study-store';
import { MODES, type PracticeMode } from '@/features/study/modes';
import type { Theme } from '@/store/ui';
import { scoreFields, type MatchRange } from './fuzzy';

/** What happens when an item is chosen. Kept as data so items can be built and tested purely. */
export type PaletteAction =
  | { type: 'navigate'; to: NavPath; hash?: string }
  | { type: 'study-mode'; mode: PracticeMode }
  | { type: 'case'; caseId: string }
  | { type: 'lookup'; target: LookupTarget }
  | { type: 'start'; request: StartRequest }
  | { type: 'theme'; theme: Theme }
  | { type: 'check-updates' }
  | { type: 'tutor' }
  | { type: 'shortcuts' }
  | { type: 'toggle-sidebar' };

export type PaletteGroupId =
  'recent' | 'views' | 'actions' | 'modules' | 'cases' | 'terms' | 'sections';

export const GROUP_LABELS: Readonly<Record<PaletteGroupId, string>> = {
  recent: 'Senaste',
  views: 'Vyer',
  actions: 'Åtgärder',
  modules: 'Moduler',
  cases: 'Ärenden',
  terms: 'Begrepp',
  sections: 'Lagrum',
};

/** Group order when searching. "Senaste" only shows in the empty palette. */
const GROUP_ORDER: readonly PaletteGroupId[] = [
  'views',
  'actions',
  'modules',
  'cases',
  'terms',
  'sections',
];

/** Icon key, resolved to a Lucide icon by the component (keeps this file free of React). */
export type PaletteIcon =
  | 'home'
  | 'study'
  | 'cases'
  | 'lookup'
  | 'results'
  | 'settings'
  | 'quiz'
  | 'review'
  | 'module'
  | 'case'
  | 'term'
  | 'section'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'update'
  | 'tutor'
  | 'keyboard'
  | 'sidebar';

export interface PaletteItem {
  /** Stable across sessions, used for "Senaste". */
  id: string;
  group: Exclude<PaletteGroupId, 'recent'>;
  title: string;
  /** One line under the title. */
  detail?: string;
  /** Other words that should find the item. */
  keywords?: readonly string[];
  icon: PaletteIcon;
  /** Shortcut shown at the right, e.g. ["g", "h"]. */
  shortcut?: readonly string[];
  action: PaletteAction;
}

export interface PaletteSources {
  modules: readonly Module[];
  /** Number of questions per module id; modules without questions get no quiz actions. */
  questionCounts: ReadonlyMap<string, number>;
  cases: readonly CaseFile[];
  lookup: LookupContent;
  theme: Theme;
}

const NAV_ICONS: Readonly<Record<NavPath, PaletteIcon>> = {
  '/': 'home',
  '/study': 'study',
  '/cases': 'cases',
  '/lookup': 'lookup',
  '/results': 'results',
  '/settings': 'settings',
};

const NAV_KEYWORDS: Readonly<Record<NavPath, readonly string[]>> = {
  '/': ['start', 'startsida', 'översikt'],
  '/study': ['quiz', 'frågor', 'öva', 'studera'],
  '/cases': ['ärendesimulator', 'bygglovsärende', 'diarium'],
  '/lookup': ['lagrum', 'ordlista', 'begrepp', 'processkarta', 'register'],
  '/results': ['statistik', 'behärskning', 'resultat', 'export'],
  '/settings': ['tema', 'textstorlek', 'uppdatering', 'studiehjälp', 'api-nyckel', 'data'],
};

const LEVEL_NAMES: Readonly<Record<number, string>> = {
  1: 'Nivå 1 · grund',
  2: 'Nivå 2 · normal',
  3: 'Nivå 3 · avancerad',
  4: 'Nivå 4 · tillsyn',
};

const THEME_ITEMS: readonly {
  theme: Theme;
  title: string;
  icon: PaletteIcon;
  keywords: string[];
}[] = [
  { theme: 'dark', title: 'Byt till mörkt läge', icon: 'moon', keywords: ['tema', 'dark', 'natt'] },
  { theme: 'light', title: 'Byt till ljust läge', icon: 'sun', keywords: ['tema', 'light', 'dag'] },
  {
    theme: 'system',
    title: 'Följ systemets tema',
    icon: 'monitor',
    keywords: ['tema', 'automatiskt', 'mörkt', 'ljust'],
  },
];

const questionsLabel = (n: number) => (n === 1 ? '1 fråga' : `${n} frågor`);

/** Every item the palette can show, in the order used for an empty query. */
export function buildPaletteItems(sources: PaletteSources): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const nav of allNav) {
    items.push({
      id: `view:${nav.to}`,
      group: 'views',
      title: nav.label,
      detail: 'Gå till vyn',
      keywords: NAV_KEYWORDS[nav.to],
      icon: NAV_ICONS[nav.to],
      shortcut: nav.shortcut,
      action: { type: 'navigate', to: nav.to },
    });
  }
  for (const mode of MODES) {
    items.push({
      id: `view:study:${mode.id}`,
      group: 'views',
      title: `Plugga: ${mode.label}`,
      detail: mode.description,
      keywords: ['plugga', 'studieläge'],
      icon: mode.id === 'review' ? 'review' : 'study',
      action: { type: 'study-mode', mode: mode.id },
    });
  }
  items.push({
    id: 'view:settings:assistant',
    group: 'views',
    title: 'Inställningar: Studiehjälp',
    detail: 'API-nyckel, modell och dagligt kostnadstak för handledaren',
    keywords: ['ai', 'claude', 'nyckel', 'handledare'],
    icon: 'settings',
    action: { type: 'navigate', to: '/settings', hash: 'settings-assistant' },
  });
  items.push({
    id: 'view:settings:data',
    group: 'views',
    title: 'Inställningar: Data',
    detail: 'Exportera, importera eller återställ studiedata',
    keywords: ['backup', 'säkerhetskopia', 'json'],
    icon: 'settings',
    action: { type: 'navigate', to: '/settings', hash: 'settings-data' },
  });

  const withQuestions = sources.modules.filter((m) => (sources.questionCounts.get(m.id) ?? 0) > 0);
  if (withQuestions.length > 0) {
    items.push({
      id: 'action:quiz:all',
      group: 'actions',
      title: 'Starta snabbquiz i alla moduler',
      detail: 'Tio slumpade frågor ur alla moduler',
      keywords: ['snabbquiz', 'quiz', 'blanda'],
      icon: 'quiz',
      action: { type: 'start', request: { mode: 'quick-quiz', moduleIds: [] } },
    });
    items.push({
      id: 'action:review',
      group: 'actions',
      title: 'Starta repetition',
      detail: 'Frågorna som väntar enligt repetitionsschemat',
      keywords: ['repetera', 'fsrs', 'schema'],
      icon: 'review',
      action: { type: 'start', request: { mode: 'review', moduleIds: [] } },
    });
  }
  for (const module of withQuestions) {
    items.push({
      id: `action:quiz:${module.id}`,
      group: 'actions',
      title: `Starta snabbquiz i ${module.titel}`,
      detail: `Modul ${module.ordning} · tio slumpade frågor`,
      keywords: ['snabbquiz', 'quiz'],
      icon: 'quiz',
      action: { type: 'start', request: { mode: 'quick-quiz', moduleIds: [module.id] } },
    });
  }
  items.push({
    id: 'action:tutor',
    group: 'actions',
    title: 'Fråga handledaren',
    detail: 'Studiehjälp med AI: fråga, bli förhörd eller få förslag på vad du ska repetera',
    keywords: ['ai', 'claude', 'hjälp', 'studiehjälp'],
    icon: 'tutor',
    action: { type: 'tutor' },
  });
  for (const theme of THEME_ITEMS) {
    if (theme.theme === sources.theme) continue;
    items.push({
      id: `action:theme:${theme.theme}`,
      group: 'actions',
      title: theme.title,
      keywords: theme.keywords,
      icon: theme.icon,
      action: { type: 'theme', theme: theme.theme },
    });
  }
  items.push({
    id: 'action:updates',
    group: 'actions',
    title: 'Sök efter uppdatering',
    detail: 'Kontrollera om en ny version av appen finns',
    keywords: ['uppdatera', 'version', 'ny version'],
    icon: 'update',
    action: { type: 'check-updates' },
  });
  items.push({
    id: 'action:shortcuts',
    group: 'actions',
    title: 'Visa kortkommandon',
    detail: 'Alla tangentbordsgenvägar i appen',
    keywords: ['tangentbord', 'genvägar', 'hjälp', 'kortkommando'],
    icon: 'keyboard',
    shortcut: ['?'],
    action: { type: 'shortcuts' },
  });
  items.push({
    id: 'action:sidebar',
    group: 'actions',
    title: 'Visa eller fäll ihop sidopanelen',
    keywords: ['meny', 'navigation', 'sidopanel'],
    icon: 'sidebar',
    action: { type: 'toggle-sidebar' },
  });

  for (const module of [...sources.modules].sort((a, b) => a.ordning - b.ordning)) {
    const count = sources.questionCounts.get(module.id) ?? 0;
    if (count === 0) continue;
    items.push({
      id: `module:${module.id}`,
      group: 'modules',
      title: module.titel,
      detail: `Modul ${module.ordning} · ${questionsLabel(count)} · starta modulgenomgång`,
      keywords: [`modul ${module.ordning}`, module.beskrivning],
      icon: 'module',
      action: { type: 'start', request: { mode: 'module-review', moduleId: module.id } },
    });
  }

  for (const caseFile of sources.cases) {
    items.push({
      id: `case:${caseFile.id}`,
      group: 'cases',
      title: `${caseFile.id} · ${caseFile.titel}`,
      detail: `${caseFile.fastighet} · ${LEVEL_NAMES[caseFile.niva] ?? `Nivå ${caseFile.niva}`}`,
      keywords: [caseFile.sammanfattning],
      icon: 'case',
      action: { type: 'case', caseId: caseFile.id },
    });
  }

  for (const term of sources.lookup.glossary) {
    items.push({
      id: `term:${term.id}`,
      group: 'terms',
      title: term.term,
      detail: term.definition,
      keywords: term.synonymer ?? [],
      icon: 'term',
      action: { type: 'lookup', target: { kind: 'term', id: term.id } },
    });
  }

  for (const chapter of sources.lookup.chapters) {
    for (const section of chapter.paragrafer) {
      const key = sectionKey(chapter.lag, chapter.kapitel, section.paragraf);
      items.push({
        id: `section:${key}`,
        group: 'sections',
        title: key,
        detail: [section.rubrik, section.sammanfattning].filter(Boolean).join(' · '),
        keywords: [
          `${chapter.kapitel} kap ${section.paragraf}`,
          `${chapter.kapitel}:${section.paragraf}`,
          section.rubrik ?? '',
        ],
        icon: 'section',
        action: { type: 'lookup', target: { kind: 'section', key } },
      });
    }
  }

  return items;
}

export interface PaletteResult {
  item: PaletteItem;
  score: number;
  /** Matched ranges in the title, for highlighting. */
  ranges: readonly MatchRange[];
}

export interface PaletteGroup {
  id: PaletteGroupId;
  label: string;
  results: PaletteResult[];
}

/** Items per group in the empty palette (the big groups are left for searching). */
const EMPTY_GROUP_LIMIT: Partial<Record<PaletteGroupId, number>> = {
  views: 6,
  actions: 6,
  modules: 0,
  cases: 0,
  terms: 0,
  sections: 0,
};
/** Items per group when searching. */
const SEARCH_GROUP_LIMIT = 6;
/** Score bonus for recently chosen items, enough to win a tie but not to beat a better hit. */
const RECENT_BONUS = 12;

/** "9:60" (older shorthand) → "9 kap 60", so it finds PBL 9 kap. 60 §. */
function expandQuery(query: string): string {
  return query.replace(/\b(\d+)\s*:\s*(\d+)\b/g, '$1 kap $2');
}

/**
 * Groups and ranks palette items for `query`. An empty query shows recent picks first, then
 * views and actions. Groups keep a fixed order; within a group the best hit comes first.
 */
export function searchPalette(
  items: readonly PaletteItem[],
  query: string,
  recent: readonly string[] = [],
): PaletteGroup[] {
  const trimmed = query.trim();
  if (trimmed === '') {
    const byId = new Map(items.map((item) => [item.id, item]));
    const recentItems = recent
      .map((id) => byId.get(id))
      .filter((item): item is PaletteItem => item !== undefined);
    const recentIds = new Set(recentItems.map((item) => item.id));
    const groups: PaletteGroup[] = [];
    if (recentItems.length > 0) {
      groups.push({
        id: 'recent',
        label: GROUP_LABELS.recent,
        results: recentItems.map((item) => ({ item, score: 0, ranges: [] })),
      });
    }
    for (const id of GROUP_ORDER) {
      const limit = EMPTY_GROUP_LIMIT[id] ?? 0;
      if (limit === 0) continue;
      const results = items
        .filter((item) => item.group === id && !recentIds.has(item.id))
        .slice(0, limit)
        .map((item) => ({ item, score: 0, ranges: [] }));
      if (results.length > 0) groups.push({ id, label: GROUP_LABELS[id], results });
    }
    return groups;
  }

  const expanded = expandQuery(trimmed);
  const recentRank = new Map(recent.map((id, i) => [id, i]));
  const byGroup = new Map<PaletteGroupId, PaletteResult[]>();
  items.forEach((item) => {
    const match = scoreFields(expanded, {
      title: item.title,
      ...(item.keywords ? { keywords: item.keywords } : {}),
      ...(item.detail ? { detail: item.detail } : {}),
    });
    if (!match) return;
    const rank = recentRank.get(item.id);
    const bonus = rank === undefined ? 0 : RECENT_BONUS - rank;
    const list = byGroup.get(item.group) ?? [];
    list.push({ item, score: match.score + bonus, ranges: match.ranges });
    byGroup.set(item.group, list);
  });

  const groups: PaletteGroup[] = [];
  for (const id of GROUP_ORDER) {
    const results = byGroup.get(id);
    if (!results || results.length === 0) continue;
    // Stable sort: equal scores keep the item order (e.g. paragraph order in a chapter).
    results.sort((a, b) => b.score - a.score);
    groups.push({ id, label: GROUP_LABELS[id], results: results.slice(0, SEARCH_GROUP_LIMIT) });
  }
  // The group with the best hit goes first, so Enter opens what she most likely meant.
  const best = (g: PaletteGroup) => g.results[0]?.score ?? 0;
  const top = groups.reduce<PaletteGroup | null>(
    (winner, g) => (winner === null || best(g) > best(winner) ? g : winner),
    null,
  );
  return top ? [top, ...groups.filter((g) => g !== top)] : groups;
}
