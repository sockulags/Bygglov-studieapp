import { describe, expect, it } from 'vitest';
import { parseChangelog, sectionsBetween } from './changelog';
import { parseReleaseNotes } from './release-notes-parse';
import { compareVersions } from './version';

describe('compareVersions', () => {
  it('orders by major, minor and patch numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v0.2.1', '0.2.0')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0);
  });

  it('sorts a prerelease before its release', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
  });
});

const changelog = `# Ändringslogg

## [Oförsläppt]

### Nytt

- Kommer snart.

## [0.3.0] - 2026-12-01

### Nytt

- Nytt ärende: Tillbyggnad på prickmark.

## [0.2.0] - 2026-11-20

### Rättat

- Repetitionen visade ibland samma fråga två gånger
  i rad.

## [0.1.0] - 2026-11-10

- Första versionen.

[Oförsläppt]: https://example.com/compare/v0.3.0...HEAD
[0.3.0]: https://example.com/releases/tag/v0.3.0
`;

describe('parseChangelog', () => {
  it('reads version sections and skips Oförsläppt and link references', () => {
    const sections = parseChangelog(changelog);
    expect(sections.map((s) => s.version)).toEqual(['0.3.0', '0.2.0', '0.1.0']);
    expect(sections[0]?.date).toBe('2026-12-01');
    expect(sections[2]?.body).toBe('- Första versionen.');
  });

  it('selects the versions between the last seen and the current one', () => {
    const between = sectionsBetween(parseChangelog(changelog), '0.1.0', '0.3.0');
    expect(between.map((s) => s.version)).toEqual(['0.3.0', '0.2.0']);
  });
});

describe('parseReleaseNotes', () => {
  it('joins indented continuation lines into the list item', () => {
    const blocks = parseReleaseNotes(parseChangelog(changelog)[1]?.body ?? '');
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Rättat' },
      { kind: 'list', items: ['Repetitionen visade ibland samma fråga två gånger i rad.'] },
    ]);
  });
});
