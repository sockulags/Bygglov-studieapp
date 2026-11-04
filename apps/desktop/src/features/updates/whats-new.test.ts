import { describe, expect, it } from 'vitest';
import { resolveWhatsNew } from './whats-new';

const changelog = `## [Oförsläppt]

## [0.2.0] - 2026-11-20

- 40 nya frågor om tillsyn.

## [0.1.0] - 2026-11-10

- Första versionen.
`;

describe('resolveWhatsNew', () => {
  it('shows nothing on the first run', () => {
    expect(
      resolveWhatsNew({
        currentVersion: '0.1.0',
        lastSeenVersion: null,
        changelog,
        pendingNotes: null,
      }),
    ).toBeNull();
  });

  it('shows nothing when the version is unchanged or older', () => {
    for (const lastSeenVersion of ['0.2.0', '0.3.0']) {
      expect(
        resolveWhatsNew({
          currentVersion: '0.2.0',
          lastSeenVersion,
          changelog,
          pendingNotes: null,
        }),
      ).toBeNull();
    }
  });

  it('shows the bundled CHANGELOG section after an update', () => {
    const result = resolveWhatsNew({
      currentVersion: '0.2.0',
      lastSeenVersion: '0.1.0',
      changelog,
      pendingNotes: null,
    });
    expect(result?.version).toBe('0.2.0');
    expect(result?.sections).toEqual([
      { version: '0.2.0', date: '2026-11-20', body: '- 40 nya frågor om tillsyn.' },
    ]);
  });

  it('falls back to the notes saved before installing', () => {
    const result = resolveWhatsNew({
      currentVersion: '0.3.0',
      lastSeenVersion: '0.2.0',
      changelog,
      pendingNotes: { version: '0.3.0', notes: '- Tentaläge.' },
    });
    expect(result?.sections).toEqual([{ version: '0.3.0', body: '- Tentaläge.' }]);
  });

  it('still confirms the update when no notes exist', () => {
    const result = resolveWhatsNew({
      currentVersion: '0.4.0',
      lastSeenVersion: '0.3.0',
      changelog,
      pendingNotes: { version: '0.3.0', notes: '- Gammalt.' },
    });
    expect(result).toEqual({ version: '0.4.0', previousVersion: '0.3.0', sections: [] });
  });
});
