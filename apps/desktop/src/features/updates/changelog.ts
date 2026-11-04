import { compareVersions } from './version';

/** One "## [x.y.z] - date" section of CHANGELOG.md. */
export interface ChangelogSection {
  version: string;
  date?: string;
  /** Markdown body without the heading, trimmed. */
  body: string;
}

const HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+(\S+))?/;
const LINK_REFERENCE = /^\[[^\]]+\]:\s/;

/**
 * Parses a Keep a Changelog file into its version sections, in file order
 * (newest first). The "Oförsläppt" section is skipped since it has no version.
 */
export function parseChangelog(raw: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: { version: string; date?: string; lines: string[] } | null = null;

  const flush = () => {
    if (current && /^\d/.test(current.version)) {
      sections.push({
        version: current.version,
        date: current.date,
        body: current.lines.join('\n').trim(),
      });
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      current = { version: match[1] ?? '', date: match[2], lines: [] };
    } else if (LINK_REFERENCE.test(line)) {
      flush();
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * The sections newer than `fromVersion` up to and including `toVersion`, newest first.
 * Used by "Vad är nytt" so that someone who skips a version still sees everything.
 */
export function sectionsBetween(
  sections: ChangelogSection[],
  fromVersion: string,
  toVersion: string,
): ChangelogSection[] {
  return sections
    .filter(
      (s) =>
        s.body.length > 0 &&
        compareVersions(s.version, fromVersion) > 0 &&
        compareVersions(s.version, toVersion) <= 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}
