// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentStep } from '@/engine';
import { buildCaseContext, buildGeneralContext, buildQuestionContext } from './context';
import {
  buildTutorRequest,
  buildTutorSystem,
  LEGAL_STATUS_TEXT,
  MAX_HISTORY_MESSAGES,
  trimHistory,
  TUTOR_ROLE,
} from './system-prompt';
import { a002, a002AtDecision, multipleChoice } from './test-fixtures';
import type { TutorMessage } from './types';

const readme = readFileSync(
  new URL('../../../../../docs/rattslage/README.md', import.meta.url),
  'utf8',
);

describe('system prompt', () => {
  it('embeds the whole of docs/rattslage/README.md as the cached block', () => {
    expect(LEGAL_STATUS_TEXT).toBe(readme);
    const [role, legal, context] = buildTutorSystem(buildQuestionContext(multipleChoice));
    expect(role).toEqual({ text: TUTOR_ROLE, cache: false });
    expect(legal?.cache).toBe(true);
    expect(legal?.text).toContain(readme);
    expect(legal?.text).toContain('9 kap. 99 §');
    expect(legal?.text).toContain('Översättningstabell');
    // The changing context comes last, after the cache marker, without cache.
    expect(context?.cache).toBe(false);
    expect(context?.text).toContain('lov-042');
  });

  it('keeps the cached prefix identical whatever the context', () => {
    const a = buildTutorSystem(buildQuestionContext(multipleChoice));
    const b = buildTutorSystem(null);
    expect(a.slice(0, 2)).toEqual(b.slice(0, 2));
    expect(a[2]?.text).not.toEqual(b[2]?.text);
  });

  it('states the rules: Swedish, law references, uncertainty, no invented sections, no answer key', () => {
    expect(TUTOR_ROLE).toContain('Svara alltid på svenska');
    expect(TUTOR_ROLE).toContain('kapitel och paragraf');
    expect(TUTOR_ROLE).toContain('Hitta aldrig på paragrafer');
    expect(TUTOR_ROLE).toContain('osäker');
    expect(TUTOR_ROLE).toContain('2025-12-01');
    expect(TUTOR_ROLE).toContain('Lagtextens byggregler 2026-01-01');
    expect(TUTOR_ROLE).toContain('pappa');
    expect(TUTOR_ROLE).toContain('Avslöja aldrig facit');
    expect(TUTOR_ROLE).toContain('motfråga');
  });

  it('tells the tutor whether the answer is given', () => {
    const before = buildTutorSystem(buildQuestionContext(multipleChoice))[2]?.text ?? '';
    expect(before).toContain('INTE besvarat');
    const answer = { type: 'flerval', selected: 1 } as const;
    const after = buildTutorSystem(buildQuestionContext(multipleChoice, answer))[2]?.text ?? '';
    expect(after).toContain('HAR besvarat');
  });

  it('gives a general context (Hem) its own instruction instead of the answer status', () => {
    const general = buildGeneralContext({ modules: [], streakDays: 0, ongoingCase: null });
    const block = buildTutorSystem(general)[2]?.text ?? '';
    expect(block).toContain('Dina studier');
    expect(block).toContain('ingen quizfråga eller något ärende');
    expect(block).not.toContain('INTE besvarat');
    expect(block).not.toContain('HAR besvarat');
  });

  it('holds no answer key for a case when includeModelAnswers is false', () => {
    const state = a002AtDecision();
    const context = buildCaseContext(a002, state, currentStep(a002, state), {
      includeModelAnswers: false,
      modelDecisionText: 'MODELLBESLUT-HEMLIG',
    });
    const whole = buildTutorSystem(context)
      .map((b) => b.text)
      .join('\n');
    const decisionStep = a002.steg.find((s) => s.typ === 'beslut');
    if (decisionStep?.typ !== 'beslut') throw new Error('no decision step');
    for (const point of decisionStep.bedomningspunkter) expect(whole).not.toContain(point);
    for (const mistake of a002.facit?.vanliga_fel ?? []) expect(whole).not.toContain(mistake);
    expect(whole).not.toContain('MODELLBESLUT-HEMLIG');
    expect(whole).not.toContain('Förväntat utfall');
  });
});

describe('request', () => {
  it('builds a request per the IPC contract without sampling parameters', () => {
    const history: TutorMessage[] = [
      { role: 'user', content: 'Förklara djupare' },
      { role: 'assistant', content: 'Visst.' },
    ];
    const request = buildTutorRequest(null, history, '  Och 10 §?  ', 'claude-haiku-5-5');
    expect(Object.keys(request).sort()).toEqual([
      'effort',
      'maxTokens',
      'messages',
      'model',
      'system',
    ]);
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.maxTokens).toBeGreaterThan(1000);
    expect(['low', 'medium', 'high']).toContain(request.effort);
    expect(request.messages).toEqual([...history, { role: 'user', content: 'Och 10 §?' }]);
    expect(buildTutorRequest(null, [], 'x', 'claude-opus-5-5').model).toBe('claude-opus-5-5');
  });

  it('keeps the history alternating, starting with the user and limited in length', () => {
    const many: TutorMessage[] = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    const trimmed = trimHistory(many);
    expect(trimmed.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(trimmed[0]?.role).toBe('user');
    expect(trimmed.at(-1)?.role).toBe('assistant');
    expect(
      trimHistory([
        { role: 'assistant', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: 'd' },
        { role: 'user', content: 'e' },
      ]),
    ).toEqual([
      { role: 'user', content: 'b\n\nc' },
      { role: 'assistant', content: 'd' },
    ]);
  });
});
