// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  templateProblems,
  TEMPLATE_VARIABLES,
  type DecisionStep,
  type WritingStep,
} from '@bygglov/content-schema';
import { loadA002, loadCaseYaml } from './a002.fixture';
import { easterSunday, isNonWorkingDay, nextWorkingDay } from './dates';
import { computeDeadline } from './deadline';
import { assessDecision, emptyDecisionDraft } from './decision';
import { isMissedResult } from './grading';
import { startCase } from './engine';
import { renderTemplate } from './templates';
import { findStep, injunctionKind } from './triggers';

describe('renderTemplate', () => {
  const values = { beslutsdatum: '2026-10-12', kungorelsedatum: '2026-10-14', frist: null };

  it('writes dates in Swedish long form, or ISO with |iso', () => {
    expect(renderTemplate('Beslut {{beslutsdatum}}.', values)).toBe('Beslut 12 oktober 2026.');
    expect(renderTemplate('{{ beslutsdatum | iso }}', values)).toBe('2026-10-12');
    expect(renderTemplate('{{beslutsdatum\\|iso}}', values)).toBe('2026-10-12');
  });

  it('adds and subtracts days', () => {
    expect(renderTemplate('{{kungorelsedatum+28}}', values)).toBe('11 november 2026');
    expect(renderTemplate('{{kungorelsedatum - 14|iso}}', values)).toBe('2026-09-30');
  });

  it('moves a last day off weekends and holidays with |vardag', () => {
    // 2026-11-21 is a Saturday.
    expect(renderTemplate('{{beslutsdatum+40|vardag|iso}}', values)).toBe('2026-11-23');
    expect(renderTemplate('{{beslutsdatum+40|iso}}', values)).toBe('2026-11-21');
  });

  it('leaves variables without a value in place', () => {
    expect(renderTemplate('Senast {{frist}}, {{simdatum}}.', values)).toBe(
      'Senast {{frist}}, {{simdatum}}.',
    );
    expect(renderTemplate('Inga variabler.', values)).toBe('Inga variabler.');
  });
});

describe('working days (2 § lagen (1930:173) om beräkning av lagstadgad tid)', () => {
  it('knows Easter and the holidays that move a last day', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(isNonWorkingDay('2026-04-03')).toBe(true); // långfredagen
    expect(isNonWorkingDay('2026-04-06')).toBe(true); // annandag påsk
    expect(isNonWorkingDay('2026-05-14')).toBe(true); // Kristi himmelsfärdsdag
    expect(isNonWorkingDay('2026-06-19')).toBe(true); // midsommarafton
    expect(isNonWorkingDay('2026-12-24')).toBe(true); // julafton
    expect(isNonWorkingDay('2026-12-31')).toBe(true); // nyårsafton
    expect(isNonWorkingDay('2026-11-11')).toBe(false); // an ordinary Wednesday
    expect(nextWorkingDay('2026-12-24')).toBe('2026-12-28');
    expect(nextWorkingDay('2026-11-11')).toBe('2026-11-11');
  });
});

describe('template variables in content', () => {
  it('reports unknown variables and filters', () => {
    expect(templateProblems('{{beslutsdatum+7|iso}}')).toEqual([]);
    expect(templateProblems('{{beslutdatum}}')[0]).toMatch(
      /Okänd mallvariabel \{\{beslutdatum\}\}/,
    );
    expect(templateProblems('{{frist|kort}}')[0]).toMatch(/Okänt filter \|kort/);
    expect(templateProblems('{{frist')[0]).toMatch(/felskriven/);
  });

  it('A003 documents only use known variables', () => {
    const folder = new URL(
      '../../../../../content/arenden/A003-nybyggnad-strandvik-1-9/handlingar/',
      import.meta.url,
    );
    const files = readdirSync(fileURLToPath(folder)).filter((f) => f.endsWith('.md'));
    const problems = files.flatMap((file) =>
      templateProblems(readFileSync(fileURLToPath(new URL(file, folder)), 'utf8')).map(
        (p) => `${file}: ${p}`,
      ),
    );
    expect(problems).toEqual([]);
    expect(Object.keys(TEMPLATE_VARIABLES)).toContain('kungorelsedatum');
  });
});

describe('vilande in the deadline (9 kap. 102 §, 12 kap. 8 a §)', () => {
  it('stops the clock while the case rests and adds the resting days afterwards', () => {
    const resting = computeDeadline({
      applicationDate: '2026-03-02',
      suspensions: [{ from: '2026-03-10', to: null }],
    });
    expect(resting).toMatchObject({ deadlineDate: null, suspendedSince: '2026-03-10' });
    expect(resting.explanation).toContain('vilande sedan 2026-03-10');
    const ended = computeDeadline({
      applicationDate: '2026-03-02',
      suspensions: [{ from: '2026-03-10', to: '2026-03-31' }],
    });
    // 2026-05-11 + 21 days.
    expect(ended).toMatchObject({ suspendedDays: 21, deadlineDate: '2026-06-01' });
    expect(ended.explanation).toContain('12 kap. 8 a §');
  });

  it('only counts resting days after the clock started', () => {
    const d = computeDeadline({
      applicationDate: '2026-03-02',
      amendmentDates: ['2026-03-20'],
      suspensions: [{ from: '2026-03-10', to: '2026-03-31' }],
    });
    expect(d).toMatchObject({ startDate: '2026-03-20', suspendedDays: 11 });
    expect(d.deadlineDate).toBe('2026-06-09');
  });
});

describe('fields that replace guessing (ar_forelaggande, godtagbara_utfall)', () => {
  it('treats only a writing step marked ar_forelaggande as an injunction', () => {
    const a002 = loadA002();
    const s2 = findStep(a002, 'S2') as WritingStep;
    expect(s2.ar_forelaggande).toBe(true);
    expect(injunctionKind(s2)).toBe('komplettering');
    expect(injunctionKind({ ...s2, ar_forelaggande: false })).toBeNull();
    const { ar_forelaggande: _unused, ...unmarked } = s2;
    expect(injunctionKind(unmarked)).toBeNull();
  });

  it('accepts a voluntary permit in A001 without marking the outcome wrong', () => {
    const a001 = loadCaseYaml('A001-komplementbyggnad-larken-4');
    const decision = a001.steg.find((s): s is DecisionStep => s.typ === 'beslut');
    if (!decision) throw new Error('A001 har inget beslutssteg');
    expect(decision.godtagbara_utfall?.map((a) => a.utfall)).toEqual(['bevilja']);
    const state = startCase(a001, { seed: 1 });
    const draft = { ...emptyDecisionDraft(), utfall: 'bevilja' as const };
    const outcome = assessDecision(a001, decision, draft, state).checks.find(
      (c) => c.id === 'utfall',
    );
    expect(outcome?.passed).toBe(true);
    expect(outcome?.message).toMatch(/^Godtagbart utfall: Bevilja bygglov\./);
    const refusal = assessDecision(a001, decision, { ...draft, utfall: 'avsla' }, state);
    expect(refusal.checks.find((c) => c.id === 'utfall')?.passed).toBe(false);
    const result = {
      stepId: decision.id,
      stepType: 'beslut' as const,
      date: state.simDate,
      skipped: false,
      answer: { type: 'beslut' as const, draft },
      score: 1,
      outcome: 'correct' as const,
      checkedCriteria: null,
    };
    expect(isMissedResult(decision, result)).toBe(false);
    expect(
      isMissedResult(decision, {
        ...result,
        answer: { type: 'beslut', draft: { ...draft, utfall: 'avvisa' } },
      }),
    ).toBe(true);
  });
});
