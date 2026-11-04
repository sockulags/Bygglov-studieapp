/**
 * Front matter of the case's Markdown documents (content/README.md → Handlingar):
 *
 *   ---
 *   rubrik: Ansökan om bygglov
 *   avsandare: Maria och Jonas Lindqvist
 *   datum: 2026-02-27
 *   diarienummer: BN 2026-000214
 *   ---
 *
 * Only flat `key: value` lines are used, so a small parser is enough here (the app has no
 * YAML package). Unknown keys are kept in `extra`.
 */

export interface DocumentMeta {
  rubrik?: string;
  avsandare?: string;
  datum?: string;
  diarienummer?: string;
  extra: Record<string, string>;
}

export interface ParsedDocument {
  meta: DocumentMeta;
  /** The Markdown after the front matter. */
  body: string;
}

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KNOWN_KEYS = ['rubrik', 'avsandare', 'datum', 'diarienummer'] as const;
type KnownKey = (typeof KNOWN_KEYS)[number];

function isKnownKey(key: string): key is KnownKey {
  return (KNOWN_KEYS as readonly string[]).includes(key);
}

/** Removes matching surrounding quotes, as YAML would for a plain scalar. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.endsWith(first) && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontMatter(source: string): ParsedDocument {
  const match = FRONT_MATTER.exec(source);
  const meta: DocumentMeta = { extra: {} };
  if (!match) return { meta, body: source.replace(/^\uFEFF/, '') };
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1] ?? '';
    const value = unquote(pair[2] ?? '');
    if (value === '') continue;
    if (isKnownKey(key)) meta[key] = value;
    else meta.extra[key] = value;
  }
  return { meta, body: source.slice(match[0].length) };
}
