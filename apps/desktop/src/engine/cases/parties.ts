import type { CaseFile } from '@bygglov/content-schema';

/**
 * Recognises the parties of a case in free-text recipients (the decision's expediering):
 * by name ("Maria och Jonas Lindqvist", "Lindqvist"), by property designation, also when
 * several properties of the same tract are listed ("Strandvik 1:5, 1:3 och 1:1"), and by
 * role word ("Sökanden", "Fastighetsägaren", "Byggherren"). Matching ignores case and
 * diacritics (å, ä, ö), so "Akerslunda" matches "Åkerslunda".
 *
 * The names come from the case file's `parter`; without it only role words and property
 * designations are recognised.
 */

/** Lower case, without diacritics, with single spaces. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word occurrence of `phrase` in `text` (both folded). */
function containsWord(text: string, phrase: string): boolean {
  if (phrase === '') return false;
  return new RegExp(`(^|[^\\p{L}\\d])${escape(phrase)}(?![\\p{L}\\d])`, 'u').test(text);
}

const PROPERTY_NUMBER = String.raw`\d+(?::\d+)?`;
const LIST_SEPARATOR = String.raw`\s*(?:,|&|\/|\boch\b|\bsamt\b)\s*`;

/** Splits "Strandvik 1:5" into the tract ("strandvik") and the number ("1:5"), folded. */
function splitDesignation(designation: string): { tract: string; number: string } | null {
  const match = new RegExp(`^(.*\\S)\\s+(${PROPERTY_NUMBER})$`, 'u').exec(fold(designation));
  return match ? { tract: match[1] ?? '', number: match[2] ?? '' } : null;
}

/**
 * Whether the recipient names the property: "Björken 8", "ägaren till Björken 8" or a list
 * such as "Strandvik 1:5, 1:3 och 1:1". "Björken 82" and "Björken 8:2" are other properties.
 */
export function mentionsProperty(recipient: string, designation: string): boolean {
  const parts = splitDesignation(designation);
  const text = fold(recipient);
  if (!parts) return containsWord(text, fold(designation));
  const list = new RegExp(
    `(?:^|[^\\p{L}\\d])${escape(parts.tract)}\\s+(${PROPERTY_NUMBER}(?:${LIST_SEPARATOR}${PROPERTY_NUMBER})*)(?![\\d:])`,
    'gu',
  );
  for (const match of text.matchAll(list)) {
    const numbers = (match[1] ?? '').split(new RegExp(LIST_SEPARATOR, 'u'));
    if (numbers.includes(parts.number)) return true;
  }
  return false;
}

/** Legal forms and words that mark an organisation rather than a person. */
const ORGANISATION =
  /\b(ab|hb|kb|brf|kommun|region|\p{L}*verket|forvaltning\p{L}*|forening\p{L}*|bolag\p{L}*|stiftelse\p{L}*)\b/u;

/**
 * Whether the recipient names the person or organisation `name`. A person matches by the
 * whole name, by first name and surname anywhere in the text ("Maria och Jonas Lindqvist"),
 * or by surname alone unless another party in `others` has the same surname. An
 * organisation matches by its name with or without the legal form ("Strandviks gård").
 */
export function mentionsName(
  recipient: string,
  name: string,
  others: readonly string[] = [],
): boolean {
  const text = fold(recipient);
  const full = fold(name);
  if (containsWord(text, full)) return true;
  if (ORGANISATION.test(full)) {
    const bare = full.replace(/\s*\b(ab|hb|kb)\b\.?/gu, '').trim();
    return bare !== full && containsWord(text, bare);
  }
  const words = full.split(' ');
  const surname = words[words.length - 1] ?? '';
  if (words.length < 2 || !containsWord(text, surname)) return false;
  const shared = others.some((other) => {
    const o = fold(other).split(' ');
    return o.length >= 2 && o[o.length - 1] === surname && fold(other) !== full;
  });
  if (!shared) return true;
  // Several parties share the surname: the first name has to be there too.
  return words.slice(0, -1).every((w) => containsWord(text, w));
}

export interface CaseParties {
  applicants: string[];
  owners: string[];
  neighbours: { property: string; names: string[] }[];
  /** The case's own property, e.g. "Björken 7". */
  property: string | null;
}

export const DESIGNATION = /\p{Lu}[\p{L}-]*(?:\s\p{Lu}[\p{L}-]*)?\s\d+(?::\d+)?/u;

export function findDesignation(text: string): string | null {
  return DESIGNATION.exec(text)?.[0] ?? null;
}

export function caseParties(caseFile: CaseFile): CaseParties {
  const parter = caseFile.parter;
  return {
    applicants: [...(parter?.sokande ?? [])],
    owners: [...(parter?.fastighetsagare ?? [])],
    neighbours: (parter?.grannar ?? []).map((g) => ({ property: g.fastighet, names: [...g.namn] })),
    property: findDesignation(caseFile.fastighet.split(',')[0] ?? ''),
  };
}

function allNames(parties: CaseParties): string[] {
  return [...parties.applicants, ...parties.owners, ...parties.neighbours.flatMap((n) => n.names)];
}

/** Names in `names` that the recipient mentions. */
function namedIn(recipient: string, names: readonly string[], parties: CaseParties): string[] {
  const others = allNames(parties).filter((n) => !names.includes(n));
  return names.filter((name) => mentionsName(recipient, name, others));
}

const APPLICANT_WORD = /\b(sokand\p{L}*|byggherr\p{L}*)/u;
const OWNER_WORD = /\bfastighetsagar\p{L}*/u;

/** The recipient is the applicant (or all of the applicants). */
export function isApplicant(recipient: string, parties: CaseParties): boolean {
  if (APPLICANT_WORD.test(fold(recipient))) return true;
  return (
    parties.applicants.length > 0 && namedIn(recipient, parties.applicants, parties).length > 0
  );
}

/** The recipient is the owner of the case's property. */
export function isOwner(recipient: string, parties: CaseParties): boolean {
  const text = fold(recipient);
  if (OWNER_WORD.test(text)) return true;
  if (parties.property !== null && mentionsProperty(recipient, parties.property)) return true;
  if (parties.owners.length > 0 && namedIn(recipient, parties.owners, parties).length > 0) {
    return true;
  }
  // When every owner is also an applicant, "Sökanden" reaches the owner too.
  const ownersApply =
    parties.owners.length > 0 && parties.owners.every((o) => parties.applicants.includes(o));
  return ownersApply && APPLICANT_WORD.test(text);
}

/** The recipient is the owner of the neighbouring property `designation`. */
export function isNeighbour(recipient: string, designation: string, parties: CaseParties): boolean {
  if (mentionsProperty(recipient, designation)) return true;
  const folded = fold(designation);
  const neighbour = parties.neighbours.find((n) => fold(n.property) === folded);
  return neighbour !== undefined && namedIn(recipient, neighbour.names, parties).length > 0;
}
