/**
 * Fuzzy matching for the command palette. Pure functions, so the ranking can be tested
 * without rendering.
 *
 * Text is folded before comparison: lower case, diacritics removed (å/ä → a, ö → o, é → e)
 * and punctuation turned into spaces. Folding keeps the length of the text, so the matched
 * positions point straight into the original string and can be highlighted.
 */

/** Half-open range [start, end) of matched characters in the original text. */
export type MatchRange = readonly [start: number, end: number];

export interface FuzzyMatch {
  score: number;
  /** Matched ranges in the text, sorted and merged. */
  ranges: MatchRange[];
}

const COMBINING_MARKS = /[̀-ͯ]/g;
const EXTRA_FOLDS: Readonly<Record<string, string>> = { æ: 'a', ø: 'o', ß: 's' };

/** Folds one character to a lower-case letter or digit without diacritics, else a space. */
function foldChar(char: string): string {
  const lower = char.toLowerCase();
  const extra = EXTRA_FOLDS[lower];
  if (extra) return extra;
  const base = lower.normalize('NFD').replace(COMBINING_MARKS, '');
  const first = base.charAt(0);
  return /[\p{L}\p{N}]/u.test(first) ? first : ' ';
}

/**
 * Folds text for matching: "Förhandsbesked §" → "forhandsbesked  ". The result has exactly
 * one character per UTF-16 code unit of the input.
 */
export function fold(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Surrogate pairs (emoji and similar) never match; keep the length with spaces.
    if (code >= 0xd800 && code <= 0xdfff) {
      out += ' ';
      continue;
    }
    out += foldChar(text.charAt(i));
  }
  return out;
}

/** Query words after folding: "  Bygg-lov " → ["bygg", "lov"]. */
export function queryWords(query: string): string[] {
  return fold(query).split(' ').filter(Boolean);
}

function isWordStart(folded: string, index: number): boolean {
  return index === 0 || folded.charAt(index - 1) === ' ';
}

interface WordMatch {
  score: number;
  ranges: MatchRange[];
}

/** Best match of one folded query word in folded text, or null. */
function matchWord(word: string, folded: string): WordMatch | null {
  // 1. Contiguous: the whole text, its start, a word start, then anywhere.
  let best: WordMatch | null = null;
  let from = folded.indexOf(word);
  while (from !== -1) {
    let score: number;
    if (from === 0 && folded.length === word.length) score = 120;
    else if (from === 0) score = 100;
    else if (isWordStart(folded, from)) score = 80;
    else score = word.length >= 3 ? 45 : 0;
    // A whole word ("6" in "9 kap 6") beats the start of a longer one ("60").
    const end = from + word.length;
    if (score >= 80 && (end === folded.length || folded.charAt(end) === ' ')) score += 10;
    // Earlier matches read as more relevant; the penalty never flips a category.
    score -= Math.min(from, 40) * 0.1;
    if (score > 0 && (!best || score > best.score)) {
      best = { score, ranges: [[from, from + word.length]] };
    }
    from = folded.indexOf(word, from + 1);
  }
  if (best) return best;

  // 2. Subsequence starting at a word start ("ovk" → "obligatorisk ventilationskontroll").
  // Each next character prefers the start of a following word, otherwise the next
  // occurrence. Short words would match almost anything this way, so two characters is
  // the minimum.
  if (word.length < 2) return null;
  let start = -1;
  for (let i = 0; i < folded.length; i++) {
    if (folded.charAt(i) === word.charAt(0) && isWordStart(folded, i)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const positions = [start];
  let cursor = start + 1;
  for (let k = 1; k < word.length; k++) {
    const char = word.charAt(k);
    const next = folded.indexOf(char, cursor);
    if (next === -1) return null;
    // Next character directly after the previous one keeps the run going; otherwise look
    // for a word start with that character before settling for the plain occurrence.
    let chosen = next;
    if (next !== cursor) {
      for (let i = cursor; i < folded.length; i++) {
        if (folded.charAt(i) === char && isWordStart(folded, i)) {
          chosen = i;
          break;
        }
      }
    }
    positions.push(chosen);
    cursor = chosen + 1;
  }
  let score = 30;
  let gaps = 0;
  for (let k = 1; k < positions.length; k++) {
    const prev = positions[k - 1] ?? 0;
    const pos = positions[k] ?? 0;
    if (pos === prev + 1) score += 2;
    else gaps += 1;
    if (isWordStart(folded, pos)) score += 4;
  }
  score -= gaps * 3;
  score -= Math.min(start, 40) * 0.1;
  if (score <= 0) return null;
  return { score, ranges: positions.map((p): MatchRange => [p, p + 1]) };
}

/** Sorts and merges overlapping or touching ranges. */
export function mergeRanges(ranges: readonly MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Matches every word of `query` in `text`. Returns null when some word is missing. The score
 * is the sum of the word scores, so texts that match more strongly rank higher.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const words = queryWords(query);
  if (words.length === 0) return null;
  const folded = fold(text);
  let score = 0;
  const ranges: MatchRange[] = [];
  for (const word of words) {
    const match = matchWord(word, folded);
    if (!match) return null;
    score += match.score;
    ranges.push(...match.ranges);
  }
  return { score, ranges: mergeRanges(ranges) };
}

export interface SearchFields {
  title: string;
  /** Other names that should match almost as well as the title. */
  keywords?: readonly string[];
  /** Secondary line; matches count less. */
  detail?: string;
}

const KEYWORD_WEIGHT = 0.8;
const DETAIL_WEIGHT = 0.4;

/**
 * Scores an item against a query. Each query word may match in the title, a keyword or the
 * detail line (with falling weight); every word must match somewhere. Highlight ranges are
 * given for the title only.
 */
export function scoreFields(query: string, fields: SearchFields): FuzzyMatch | null {
  const words = queryWords(query);
  if (words.length === 0) return null;
  const title = fold(fields.title);
  const keywords = (fields.keywords ?? []).map(fold);
  const detail = fold(fields.detail ?? '');
  let score = 0;
  const ranges: MatchRange[] = [];
  for (const word of words) {
    const inTitle = matchWord(word, title);
    let best = inTitle ? inTitle.score : 0;
    for (const keyword of keywords) {
      const m = matchWord(word, keyword);
      if (m) best = Math.max(best, m.score * KEYWORD_WEIGHT);
    }
    const inDetail = detail ? matchWord(word, detail) : null;
    if (inDetail) best = Math.max(best, inDetail.score * DETAIL_WEIGHT);
    if (best === 0) return null;
    score += best;
    if (inTitle) ranges.push(...inTitle.ranges);
  }
  // A query that covers the whole title is what she meant.
  if (words.join(' ') === title.trim().replace(/\s+/g, ' ')) score += 30;
  return { score, ranges: mergeRanges(ranges) };
}
