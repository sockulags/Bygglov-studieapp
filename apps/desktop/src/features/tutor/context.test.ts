// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { currentStep, grade } from '@/engine';
import {
  buildCaseContext,
  buildGeneralContext,
  buildQuestionContext,
  clipText,
  CLIP_MARKER,
  MAX_CONTEXT_CHARS,
} from './context';
import { a002, a002AtDecision, a002Decided, draftDecision, multipleChoice } from './test-fixtures';

describe('clipText', () => {
  it('keeps short text and clips long text at a word boundary with [...]', () => {
    expect(clipText('  kort text  ', 50)).toBe('kort text');
    const long = 'ord '.repeat(100);
    const clipped = clipText(long, 50);
    expect(clipped.length).toBeLessThanOrEqual(50);
    expect(clipped.endsWith(CLIP_MARKER)).toBe(true);
    expect(clipped).not.toMatch(/or \[/);
  });
});

describe('buildQuestionContext', () => {
  it('shows the question and alternatives but no answer key before she answers', () => {
    const ctx = buildQuestionContext(multipleChoice);
    expect(ctx).toMatchObject({ key: 'question:lov-042', kind: 'question', answered: false });
    expect(ctx.text).toContain('Hur stor får en bygglovsbefriad komplementbyggnad');
    expect(ctx.text).toContain('2. 30 kvm');
    expect(ctx.text).toContain('Hon har inte svarat');
    expect(ctx.text).not.toContain('Rätt svar');
    expect(ctx.text).not.toContain('Högst 30 kvm byggnadsarea'); // the explanation
    expect(ctx.text).not.toContain('friggebodens gamla gräns'); // per-alternative comment
    expect(ctx.text).not.toContain('PBL 9 kap. 4 §');
  });

  it('adds her answer, the result, the key, explanation and law references after answering', () => {
    const answer = { type: 'flerval', selected: 0 } as const;
    const ctx = buildQuestionContext(multipleChoice, answer, grade(multipleChoice, answer));
    expect(ctx.answered).toBe(true);
    expect(ctx.text).toContain('Hennes svar: alternativ 1 ("15 kvm")');
    expect(ctx.text).toContain('Resultat: Inte rätt');
    expect(ctx.text).toContain('Rätt svar: alternativ 2');
    expect(ctx.text).toContain('Alternativ 1: Det var friggebodens gamla gräns.');
    expect(ctx.text).toContain('Förklaring i appen: Högst 30 kvm');
    expect(ctx.text).toContain('Lagrum i appen: PBL 9 kap. 4 §');
    expect(ctx.text).toContain('utkast');
  });
});

describe('buildCaseContext', () => {
  const facitStrings = () => {
    const decisionStep = a002.steg.find((s) => s.typ === 'beslut');
    if (decisionStep?.typ !== 'beslut') throw new Error('no decision step');
    return [
      ...decisionStep.bedomningspunkter,
      ...(a002.facit?.vanliga_fel ?? []),
      'Förväntat utfall',
      'FACIT',
      'Modellbeslut',
    ];
  };

  it('describes the case and the current step without any answer key before submission', () => {
    const state = a002AtDecision();
    const ctx = buildCaseContext(a002, state, currentStep(a002, state), {
      includeModelAnswers: false,
      notes: 'Kolla höjden mot planen.',
      draft: draftDecision,
      documentTexts: { H1: 'Ansökan om bygglov för tillbyggnad.' },
      modelDecisionText: 'MODELLBESLUTETS TEXT',
    });
    expect(ctx).toMatchObject({ key: 'case:A002', kind: 'case', answered: false });
    expect(ctx.text).toContain(`Ärende A002: ${a002.titel}`);
    expect(ctx.text).toContain('Aktuellt steg');
    expect(ctx.text).toContain('Fatta beslut');
    expect(ctx.text).toContain('Kolla höjden mot planen.');
    expect(ctx.text).toContain('Hennes beslutsutkast (inte inlämnat)');
    expect(ctx.text).toContain('Min egen motivering om höjden.');
    expect(ctx.text).toContain('Ansökan om bygglov för tillbyggnad.');
    for (const secret of facitStrings()) expect(ctx.text).not.toContain(secret);
    expect(ctx.text).not.toContain('MODELLBESLUTETS TEXT');
  });

  it('never includes the answer key without a submitted decision, even when asked to', () => {
    const state = a002AtDecision();
    const ctx = buildCaseContext(a002, state, currentStep(a002, state), {
      includeModelAnswers: true,
      modelDecisionText: 'MODELLBESLUTETS TEXT',
    });
    expect(ctx.answered).toBe(false);
    for (const secret of facitStrings()) expect(ctx.text).not.toContain(secret);
    expect(ctx.text).not.toContain('MODELLBESLUTETS TEXT');
  });

  it('includes the submitted decision and the answer key after submission', () => {
    const state = a002Decided();
    const ctx = buildCaseContext(a002, state, null, {
      includeModelAnswers: true,
      modelDecisionText: 'MODELLBESLUTETS TEXT',
    });
    expect(ctx).toMatchObject({ key: 'decision:A002', kind: 'decision', answered: true });
    expect(ctx.text).toContain('Hennes inlämnade beslut');
    expect(ctx.text).toContain('Förväntat utfall: Bevilja bygglov');
    expect(ctx.text).toContain('Automatiska kontroller');
    expect(ctx.text).toContain('MODELLBESLUTETS TEXT');
    const decisionStep = a002.steg.find((s) => s.typ === 'beslut');
    if (decisionStep?.typ !== 'beslut') throw new Error('no decision step');
    expect(ctx.text).toContain(decisionStep.bedomningspunkter[0]);
  });

  it('keeps the context under the limit by clipping documents with [...]', () => {
    const state = a002AtDecision();
    const huge = (label: string) => `${label} ` + 'Lång handlingstext med många ord. '.repeat(800);
    const ctx = buildCaseContext(a002, state, currentStep(a002, state), {
      includeModelAnswers: false,
      notes: 'Anteckning '.repeat(400),
      documentTexts: { H1: huge('ANSÖKAN'), H2: 'Kort handling.', H7: huge('YTTRANDE') },
    });
    expect(ctx.text.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(ctx.text).toContain(CLIP_MARKER);
    // Short documents survive whole, long ones keep their beginning.
    expect(ctx.text).toContain('Kort handling.');
    expect(ctx.text).toContain('ANSÖKAN Lång handlingstext');
    expect(ctx.text).toContain('YTTRANDE Lång handlingstext');
    // Every visible document still has its heading.
    expect(ctx.text).toMatch(/### H1 /);
    expect(ctx.text).toMatch(/### H7 /);
  });

  it('respects a smaller limit', () => {
    const state = a002AtDecision();
    const ctx = buildCaseContext(a002, state, currentStep(a002, state), {
      includeModelAnswers: false,
      documentTexts: { H1: 'x '.repeat(5000) },
      maxChars: 3000,
    });
    expect(ctx.text.length).toBeLessThanOrEqual(3000);
  });
});

describe('buildGeneralContext', () => {
  it('describes her study status for Hem without any answer key', () => {
    const ctx = buildGeneralContext({
      modules: [
        { title: 'Lovplikt', mastery: 42, questionCount: 51, seen: 20, due: 3 },
        { title: 'Handläggningsprocessen', mastery: 0, questionCount: 47, seen: 0, due: 0 },
        { title: 'Tom modul', mastery: 0, questionCount: 0, seen: 0, due: 0 },
      ],
      streakDays: 1,
      ongoingCase: 'A002 Tillbyggnad av enbostadshus, Björken 7',
    });
    expect(ctx).toMatchObject({ key: 'general:home', kind: 'general', answered: false });
    expect(ctx.text).toContain('Lovplikt: 42 %, 20 av 51 frågor besvarade, 3 väntar på repetition');
    expect(ctx.text).toContain('Handläggningsprocessen: inte påbörjad');
    expect(ctx.text).not.toContain('Tom modul');
    expect(ctx.text).toContain('Frågor som väntar på repetition i dag: 3.');
    expect(ctx.text).toContain('Streak: 1 dag');
    expect(ctx.text).toContain('Pågående ärende: A002');
  });
});
