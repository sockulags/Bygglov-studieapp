/**
 * Law references used by the decision checks. The section list for 9 kap. PBL follows the
 * wording in force from 1 December 2025 (docs/rattslage/pbl-9-kap.txt): sections 1–115
 * plus 17 a, 71 a, 72 a and 99 a.
 */

const LETTERED_SECTIONS_9 = new Set(['17 a', '71 a', '72 a', '99 a']);
const LAST_SECTION_9 = 115;

/**
 * Lettered sections from the old 9 kap. that do not exist any more, with where the topic
 * is now (docs/rattslage/README.md, översättningstabellen).
 */
const OLD_SECTIONS_9: Record<string, string> = {
  '4 a': '9 kap. 4 §',
  '4 b': '9 kap. 10 §',
  '4 c': '9 kap. 15–18 §§',
  '4 d': '9 kap. 37–38 §§',
  '27 a': '9 kap. 101 §',
  '30 a': '9 kap. 63 §',
  '31 a': '9 kap. 57 §',
  '31 b': '9 kap. 60 §',
  '31 c': '9 kap. 60 §',
  '31 d': '9 kap. 64 §',
  '33 a': '9 kap. 39–40 och 70–73 §§',
  '41 a': '9 kap. 109 §',
  '41 b': '9 kap. 110 §',
  '42 a': '9 kap. 114 §',
};

/** A law other than PBL named right before the chapter, e.g. "PBF 9 kap. 7 §". */
const OTHER_LAW_BEFORE = /\b(PBF|FL|MB|KL|förordningen|förvaltningslagen|miljöbalken)\s*$/i;

export interface ChapterNineRef {
  /** The text as written. */
  raw: string;
  /** Section with optional letter, e.g. "60" or "99 a". */
  section: string;
  exists: boolean;
  /** For old lettered sections: where the topic is in the new chapter. */
  replacedBy: string | null;
}

/**
 * Finds references to 9 kap. PBL in a free-text law reference, e.g. "PBL 9 kap. 56 §",
 * "9 kap. 56 och 60 §§", "9:60" or "9 kap 31 b §". References naming another law
 * (PBF, FL, MB) are ignored.
 */
export function chapterNineRefs(text: string): ChapterNineRef[] {
  const refs: ChapterNineRef[] = [];
  const otherLaw = (index: number) => OTHER_LAW_BEFORE.test(text.slice(0, index));
  const kap = /\b9\s*kap\.?\s*((?:\d+\s*[a-z]?\b[\s,–-]*(?:och\s*)?)+)§/gi;
  let match: RegExpExecArray | null;
  while ((match = kap.exec(text)) !== null) {
    if (otherLaw(match.index)) continue;
    for (const section of sectionsIn(match[1] ?? '')) refs.push(describe(match[0], section));
  }
  const short = /\b9\s*:\s*(\d+\s*[a-z]?)\b/gi;
  while ((match = short.exec(text)) !== null) {
    if (otherLaw(match.index)) continue;
    refs.push(describe(match[0], normaliseSection(match[1] ?? '')));
  }
  return refs;
}

function sectionsIn(list: string): string[] {
  const out: string[] = [];
  const part = /(\d+)(?:\s*([a-z])\b)?/gi;
  let match: RegExpExecArray | null;
  while ((match = part.exec(list)) !== null) {
    out.push(match[2] ? `${match[1]} ${match[2].toLowerCase()}` : (match[1] ?? ''));
  }
  return out.filter((s) => s !== '');
}

function normaliseSection(section: string): string {
  const m = /^(\d+)\s*([a-z])?$/i.exec(section.trim());
  if (!m) return section.trim();
  return m[2] ? `${m[1]} ${m[2].toLowerCase()}` : (m[1] ?? '');
}

function describe(raw: string, section: string): ChapterNineRef {
  return {
    raw: raw.trim(),
    section,
    exists: sectionExistsInChapterNine(section),
    replacedBy: OLD_SECTIONS_9[section] ?? null,
  };
}

export function sectionExistsInChapterNine(section: string): boolean {
  if (LETTERED_SECTIONS_9.has(section)) return true;
  if (!/^\d+$/.test(section)) return false;
  const n = Number(section);
  return n >= 1 && n <= LAST_SECTION_9;
}
