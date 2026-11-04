/**
 * Text and number normalisation for automatically graded free-text answers
 * (`lucktext`, `berakning`, numeric `ritning`).
 */

const SWEDISH = 'sv-SE';

export interface NormalizeOptions {
  caseSensitive?: boolean;
}

/**
 * Normalises free text for comparison: Unicode NFC (so a decomposed "a" + ring equals "å"),
 * trimmed, internal whitespace collapsed, surrounding punctuation and quotes removed,
 * and lower-cased with Swedish rules unless `caseSensitive`.
 */
export function normalizeText(input: string, options: NormalizeOptions = {}): string {
  let value = input.normalize('NFC').replace(/\s+/gu, ' ').trim();
  value = value.replace(/^["'”“„«»(\s]+|["'”“„«»)\s.,;:!?]+$/gu, '');
  return options.caseSensitive ? value : value.toLocaleLowerCase(SWEDISH);
}

/**
 * Parses a number written the Swedish or the English way: "4,5", "4.5", "-2", "1 000",
 * "1 000,5" (any space, including non-breaking, as thousands separator), "−3" (minus sign).
 * Returns null when the whole string is not a number.
 */
export function parseNumber(input: string): number | null {
  const value = input
    .normalize('NFC')
    .trim()
    .replace(/^[−–]/u, '-')
    .replace(/(\d)\s(?=\d{3}(?:\D|$))/gu, '$1');
  if (!/^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Quantity {
  value: number;
  /** Normalised unit text, empty when the answer was a bare number. */
  unit: string;
}

/**
 * Splits "10 veckor", "4,5m", "30 kvm", "99 §" into a number and a unit. Returns null when
 * the text does not start with a number or has something other than a unit after it.
 */
export function parseQuantity(input: string): Quantity | null {
  const text = normalizeText(input);
  const match =
    /^([-+−–]?[\d\s]*[\d](?:[.,]\d+)?|[-+]?[.,]\d+)\s*([\p{L}§²³%][\p{L}\d§²³%.\s]*)?$/u.exec(text);
  if (!match) return null;
  const value = parseNumber(match[1] ?? '');
  if (value === null) return null;
  return { value, unit: normalizeUnit(match[2] ?? '') };
}

export function normalizeUnit(unit: string): string {
  return unit.replace(/\./gu, '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase(SWEDISH);
}

/**
 * Whether a unit the learner typed is compatible with the expected one. Abbreviations and
 * inflections are accepted ("v", "veckor", "vecka" for "veckor"; "m" for "meter"), a
 * different unit ("dagar" for "veckor") is not.
 */
export function unitsCompatible(given: string, expected: string): boolean {
  if (given === '') return true;
  if (expected === '') return false;
  if (given === expected) return true;
  const aliases = UNIT_ALIASES.get(expected);
  if (aliases?.has(given)) return true;
  if (expected.startsWith(given) || given.startsWith(expected)) return true;
  return commonPrefixLength(given, expected) >= 4;
}

const UNIT_GROUPS: readonly (readonly string[])[] = [
  ['kvm', 'm2', 'm²', 'kvadratmeter', 'kvadrat'],
  ['m', 'meter'],
  ['cm', 'centimeter'],
  ['mm', 'millimeter'],
  ['kr', 'kronor', 'sek', ':-'],
  ['§', 'paragraf', 'paragrafer'],
  ['%', 'procent'],
];

const UNIT_ALIASES = new Map<string, Set<string>>(
  UNIT_GROUPS.flatMap((group) => group.map((unit) => [unit, new Set(group)] as const)),
);

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** Absolute comparison with a small epsilon so 0.1 + 0.2 equals 0.3. */
export function numbersMatch(given: number, expected: number, tolerance = 0): boolean {
  return Math.abs(given - expected) <= tolerance + 1e-9 * Math.max(1, Math.abs(expected));
}
