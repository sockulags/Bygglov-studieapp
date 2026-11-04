import type { z } from 'zod';

/** One validation problem, with a readable path and a Swedish message. */
export interface ContentIssue {
  /** Readable location, e.g. `fragor[lov-003].svar`. Empty for the file as a whole. */
  path: string;
  message: string;
}

export type ParseResult<T> =
  { success: true; data: T } | { success: false; issues: ContentIssue[] };

const TYPE_NAMES: Record<string, string> = {
  string: 'en text',
  number: 'ett tal',
  int: 'ett heltal',
  boolean: 'true eller false',
  array: 'en lista',
  object: 'ett objekt (nyckel: värde)',
  record: 'ett objekt (nyckel: värde)',
  date: 'ett datum',
  undefined: 'inget värde',
  null: 'inget värde',
};

function describeInput(input: unknown): string {
  if (input === undefined) return 'saknas';
  if (input === null) return 'är tomt';
  if (Array.isArray(input)) return 'är en lista';
  if (typeof input === 'string')
    return `är texten "${input.length > 40 ? `${input.slice(0, 40)}…` : input}"`;
  if (typeof input === 'number') return `är talet ${input}`;
  if (typeof input === 'boolean') return `är ${input}`;
  if (typeof input === 'object') return 'är ett objekt';
  return `är av typen ${typeof input}`;
}

/**
 * Swedish messages for zod's built-in issues. Messages written on the schemas themselves
 * take precedence over this map.
 */
export const swedishErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined) return 'Fältet saknas men är obligatoriskt.';
      const expected = TYPE_NAMES[issue.expected] ?? issue.expected;
      return `Ska vara ${expected}, men ${describeInput(issue.input)}.`;
    }
    case 'too_small':
      if (issue.origin === 'array') return `Listan behöver minst ${String(issue.minimum)} rader.`;
      if (issue.origin === 'string') return 'Texten får inte vara tom.';
      return `Värdet ska vara minst ${String(issue.minimum)}.`;
    case 'too_big':
      if (issue.origin === 'array') return `Listan får ha högst ${String(issue.maximum)} rader.`;
      return `Värdet får vara högst ${String(issue.maximum)}.`;
    case 'invalid_value':
      return `Ogiltigt värde. Tillåtna värden: ${issue.values.map(String).join(', ')}.`;
    case 'unrecognized_keys':
      return `Okänt fält: ${issue.keys.join(', ')}. Kontrollera stavningen (fältnamn skrivs utan å, ä, ö).`;
    case 'invalid_format':
      return 'Felaktigt format.';
    case 'invalid_union':
      return 'Värdet passar inte någon av de tillåtna formerna.';
    case 'invalid_key':
      return 'Ogiltig nyckel.';
    case 'invalid_element':
      return 'Ogiltigt värde i listan.';
    case 'not_multiple_of':
      return `Ska vara en multipel av ${String(issue.divisor)}.`;
    case 'custom':
      return 'Ogiltigt värde.';
    default:
      return undefined;
  }
};

function labelFor(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

/**
 * Formats a zod path for humans. Array indices are replaced by the element's `id` when it
 * has one (`steg[S3]`), otherwise shown 1-based (`alternativ[2]`).
 */
export function formatPath(path: readonly PropertyKey[], input: unknown): string {
  let out = '';
  let node: unknown = input;
  for (const key of path) {
    if (typeof key === 'number') {
      const element: unknown = Array.isArray(node) ? node[key] : undefined;
      out += `[${labelFor(element) ?? key + 1}]`;
      node = element;
    } else {
      const name = String(key);
      out += out ? `.${name}` : name;
      node =
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[name]
          : undefined;
    }
  }
  return out;
}

export function toContentIssues(error: z.ZodError, input: unknown): ContentIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path, input),
    message: issue.message,
  }));
}

/** One issue per line: `  fragor[lov-003].svar: message`. */
export function formatIssues(issues: readonly ContentIssue[], indent = '  '): string {
  return issues
    .map((issue) => `${indent}${issue.path ? `${issue.path}: ` : ''}${issue.message}`)
    .join('\n');
}

export function safeParseContent<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(input, { error: swedishErrorMap });
  if (result.success) return { success: true, data: result.data };
  return { success: false, issues: toContentIssues(result.error, input) };
}
