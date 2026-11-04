// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CaseFile } from '@bygglov/content-schema';
import { createMemoryDataStore, type DataStore } from '@/data';
import type { StudyContent } from '@/content';
import {
  currentStep,
  selfAssessStep,
  startCase,
  submitDecision,
  submitStep,
  type CaseState,
  type DecisionDraft,
  type StepAnswer,
} from '@/engine';
import { loadA002 } from '@/engine/cases/a002.fixture';
import { loadDecisionReport, parseDecisionValue, reportNotesKey } from './load';
import { buildDecisionReport, reportFileBaseName } from './report';
import { escapeHtml, renderDecisionReportHtml } from './report-html';
import { renderDecisionReportMarkdown } from './report-markdown';

const a002: CaseFile = loadA002();
const GENERATED = '2026-11-04T10:00:00.000Z';

const answers: Record<string, StepAnswer> = {
  S1: { type: 'checklista', marks: [true, true, true, false, false, false, false] },
  S2: {
    type: 'skrivelse',
    text: 'Föreläggande: komplettera med planritning, sektionsritning och anmälan om kontrollansvarig inom tre veckor.',
    checkedCriteria: [0, 1, 2, 3, 4],
  },
  S3: {
    type: 'berakning',
    values: {
      byggnadsarea_efter: '138 kvm',
      byggnadsarea_procent: '18',
      byggnadshojd: '4,9 m',
      prickmark_kvm: 3.5,
    },
  },
  S4: { type: 'fraga', answer: { type: 'flerval', selected: 0 } },
  S5: { type: 'urval', selected: [0, 1, 2, 3] },
  S5b: {
    type: 'fraga',
    answer: { type: 'oppen', text: 'Skuggningen är inte en betydande olägenhet.' },
  },
};

const draft: DecisionDraft = {
  utfall: 'bevilja',
  lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 60 §'],
  motivering:
    'Avvikelserna är små och förenliga med planens syfte.\n\nGrannens invändning om skuggning <b>utgör inte</b> en betydande olägenhet.',
  villkor_upplysningar:
    'Lovet gäller omedelbart men åtgärden får inte påbörjas förrän startbesked getts. Giltighetstid två plus fem år.',
  avgift: 9800,
  overklagandehanvisning: true,
  expediering: [
    { mottagare: 'Sökanden', satt: 'delges' },
    { mottagare: 'Fastighetsägaren', satt: 'delges' },
    { mottagare: 'Ägaren till Björken 8', satt: 'delges' },
    { mottagare: 'Björken 6', satt: 'meddelande' },
  ],
};

const MODEL = `---
rubrik: Beslut om bygglov
datum: 2026-04-21
---

# Beslut om bygglov

| Fastighet | Björken 7 |
| --- | --- |
| Beslut | Bevilja |

Nämnden **beviljar bygglov**. <script>alert(1)</script>
`;

/** Plays A002 along the expected path up to and including the decision. */
function playToDecision(decision: DecisionDraft = draft): CaseState {
  let state = startCase(a002, { seed: 1, startedAt: GENERATED });
  for (let guard = 0; guard < 20; guard += 1) {
    const step = currentStep(a002, state);
    if (!step) throw new Error('no decision step reached');
    if (step.typ === 'beslut') {
      state = submitDecision(a002, state, decision).state;
      return selfAssessStep(a002, state, step.id, [0, 2, 6]).state;
    }
    const prepared = answers[step.id];
    if (!prepared) throw new Error(`no prepared answer for ${step.id}`);
    state = submitStep(a002, state, step.id, prepared).state;
  }
  throw new Error('too many steps');
}

function reportFor(state: CaseState, notes: string | null = 'Svårt att avgöra om 4,9 m är litet.') {
  const decision = state.decisions[0];
  if (!decision) throw new Error('no decision');
  return buildDecisionReport(a002, state, decision, decision.assessment, {
    notes,
    modelDecisionMarkdown: MODEL,
    generatedAt: GENERATED,
  });
}

describe('buildDecisionReport', () => {
  const state = playToDecision();
  const report = reportFor(state);

  it('collects the case, the decision and the assessment', () => {
    expect(report).toMatchObject({
      caseId: 'A002',
      caseTitle: a002.titel,
      property: a002.fastighet,
      decisionDate: state.decisions[0]?.date,
      selfAssessed: true,
      notes: 'Svårt att avgöra om 4,9 m är litet.',
      warnings: [],
    });
    expect(report.decision.outcomeLabel).toBe('Bevilja bygglov');
    expect(report.decision.feeLabel).toMatch(/9\s800 kr/);
    expect(report.decision.recipients).toHaveLength(4);
    expect(report.checks?.items.length).toBeGreaterThan(5);
    expect(report.checks?.items.find((c) => c.id === 'utfall')?.status).toBe('passed');
    expect(report.criteria).toHaveLength(8);
    expect(report.criteria.map((c) => c.checked)).toEqual(
      report.criteria.map((_, i) => [0, 2, 6].includes(i)),
    );
    expect(report.appendix.markdown).toContain('Beslut om bygglov');
  });

  it('builds a dated timeline in the simulated calendar', () => {
    const kinds = report.timeline.map((e) => e.kind);
    expect(report.timeline[0]).toMatchObject({ date: '2026-03-02', kind: 'ansokan' });
    expect(kinds).toEqual(
      expect.arrayContaining(['ansokan', 'forelaggande', 'komplett', 'underrattelse', 'beslut']),
    );
    const dates = report.timeline.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    expect(report.timeline.find((e) => e.kind === 'komplett')?.date).toBe(state.completionDate);
    expect(report.deadline.inTime).toBe(true);
  });

  it('includes her written texts', () => {
    expect(report.writings.map((w) => w.stepId)).toEqual(['S2', 'S5b']);
  });

  it('handles a missing state, assessment and fields', () => {
    const bare = buildDecisionReport(a002, null, { draft: {} }, null, { generatedAt: GENERATED });
    expect(bare.checks).toBeNull();
    expect(bare.decision).toMatchObject({
      outcome: null,
      outcomeLabel: 'Inget utfall valt',
      lawRefs: [],
      fee: null,
      appealNotice: null,
      recipients: [],
    });
    expect(bare.selfAssessed).toBe(false);
    expect(bare.criteria.length).toBeGreaterThan(0);
    expect(bare.criteria.every((c) => c.checked === null)).toBe(true);
    expect(bare.timeline.map((e) => e.kind)).toEqual(['ansokan']);
    expect(bare.notes).toBeNull();
    expect(bare.warnings.join(' ')).toMatch(/förlopp/);
    expect(bare.warnings.join(' ')).toMatch(/automatiska bedömningen/);
    expect(bare.warnings.join(' ')).toMatch(/Modellbeslutet/);
    // Renders without throwing.
    expect(renderDecisionReportHtml(bare)).toContain('Inget utfall valt');
    expect(renderDecisionReportMarkdown(bare)).toContain('_Den automatiska bedömningen saknas._');
  });

  it('makes a file name without Swedish characters', () => {
    expect(reportFileBaseName(report)).toMatch(/^beslutsrapport-A002-bjorken-7-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('renderDecisionReportHtml', () => {
  const report = reportFor(playToDecision());
  const html = renderDecisionReportHtml(report);

  it('has every section, in order, with the model decision last', () => {
    const headings = [
      'Datumlinje',
      'Hennes beslut',
      'Automatiska kontroller',
      'Bedömningspunkter',
      'Hennes anteckningar och reflektioner',
      'Handledarens bedömning',
      'Bilaga: Modellbeslut',
    ];
    const positions = headings.map((h) => html.indexOf(`<h2>${h}</h2>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('size: A4');
    expect(html).toContain(escapeHtml(a002.titel));
  });

  it('has a supervisor box with grades, comment lines and signature', () => {
    const box = html.slice(html.indexOf('class="supervisor"'), html.indexOf('class="appendix"'));
    for (const text of ['Kommentar', 'Betyg', 'Godkänt', 'Komplettera', 'Gör om', 'Signatur']) {
      expect(box).toContain(text);
    }
    expect(box.match(/class="line"/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('shows the self-assessment marks', () => {
    expect(html).toContain('☑');
    expect(html).toContain('(inte uppfyllt enligt henne)');
  });

  it('escapes her text and drops raw HTML from the model decision', () => {
    expect(html).not.toContain('<b>utgör inte</b>');
    expect(html).toContain('&lt;b&gt;utgör inte&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<table>');
    expect(html).toContain('<strong>beviljar bygglov</strong>');
    // Front matter is not shown.
    expect(html).not.toContain('rubrik: Beslut om bygglov');
  });

  it('escapes everything in a hostile report', () => {
    const hostile = reportFor(
      playToDecision({ ...draft, motivering: '"><img src=x onerror=1>' }),
      '<script>x</script>',
    );
    const out = renderDecisionReportHtml({ ...hostile, caseTitle: '<i>titel</i>' });
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<i>titel</i>');
    expect(out).not.toContain('<script>x');
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderDecisionReportMarkdown', () => {
  const report = reportFor(playToDecision());
  const md = renderDecisionReportMarkdown(report);

  it('has the same sections as text', () => {
    for (const heading of [
      '# Beslutsrapport:',
      '## Datumlinje',
      '## Hennes beslut',
      '## Automatiska kontroller',
      '## Bedömningspunkter',
      '## Hennes anteckningar',
      '## Handledarens bedömning',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain('**Bevilja bygglov**');
    expect(md).toContain('- 2026-03-02: Ansökan inkom');
    expect(md).toContain('- [x] ');
    expect(md).toContain('- [ ] ');
    expect(md).toContain('Betyg: Godkänt / Komplettera / Gör om');
    expect(md).toContain('> Svårt att avgöra om 4,9 m är litet.');
    expect(md).toMatch(/✓ /);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('leaves out the model decision unless asked for', () => {
    expect(md).not.toContain('Bilaga: Modellbeslut');
    const full = renderDecisionReportMarkdown(report, { includeAppendix: true });
    expect(full).toContain('## Bilaga: Modellbeslut');
    expect(full).toContain('Nämnden **beviljar bygglov**');
    expect(full).not.toContain('datum: 2026-04-21');
  });

  it('keeps multi-line text inside quotes and list items on one line', () => {
    expect(md).toContain('> Avvikelserna är små och förenliga med planens syfte.\n>\n> Grannens');
    const titled = renderDecisionReportMarkdown({
      ...report,
      timeline: [
        { date: '2026-03-02', kind: 'ansokan', label: 'Rad ett\n# rad två', detail: null },
      ],
    });
    expect(titled).toContain('- 2026-03-02: Rad ett # rad två');
  });
});

describe('loadDecisionReport', () => {
  const content: StudyContent = {
    modules: [],
    questionsByModule: new Map(),
    cases: [a002],
    index: null,
  };

  /** The memory store has no state field yet; add it the way the data agent will. */
  function withState(store: DataStore, state: unknown): DataStore {
    return {
      ...store,
      cases: {
        ...store.cases,
        getCaseStatus: async (caseId: string) => {
          const status = await store.cases.getCaseStatus(caseId);
          return status ? ({ ...status, state } as typeof status) : null;
        },
      },
    };
  }

  async function seed(state: CaseState) {
    const memory = createMemoryDataStore(() => new Date(GENERATED));
    await memory.cases.startCase({ caseId: 'A002', currentStepId: null, simDate: state.simDate });
    const row = await memory.cases.submitDecision({
      caseId: 'A002',
      decision: state.decisions[0]?.draft,
    });
    return { memory, row };
  }

  const fetcher = (async () => new Response(MODEL, { status: 200 })) as typeof fetch;

  it('finds the decision in the saved state and fetches the model decision', async () => {
    const state = playToDecision();
    const { memory, row } = await seed(state);
    await memory.settings.set(reportNotesKey(row.id), 'Mina reflektioner');
    const store = withState(memory, JSON.stringify(state));
    const { report } = await loadDecisionReport(store, content, 'A002', row.id, {
      fetcher,
      generatedAt: GENERATED,
    });
    expect(report.warnings).toEqual([]);
    expect(report.checks).not.toBeNull();
    expect(report.selfAssessed).toBe(true);
    expect(report.notes).toBe('Mina reflektioner');
    expect(report.decisionDate).toBe(state.decisions[0]?.date);
    expect(report.appendix.markdown).toContain('beviljar bygglov');

    // The reflection written in the comparison view takes precedence.
    await memory.cases.updateCaseStatus('A002', { reflection: 'Från jämförelsevyn' });
    const again = await loadDecisionReport(store, content, 'A002', row.id, {
      fetcher,
      generatedAt: GENERATED,
    });
    expect(again.report.notes).toBe('Från jämförelsevyn');
  });

  it('still builds a report from the draft alone', async () => {
    const state = playToDecision();
    const { memory, row } = await seed(state);
    const failing = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const { report } = await loadDecisionReport(memory, content, 'A002', row.id, {
      fetcher: failing,
      notes: 'Överstyrd',
    });
    expect(report.checks).toBeNull();
    expect(report.decision.outcomeLabel).toBe('Bevilja bygglov');
    expect(report.notes).toBe('Överstyrd');
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('reports a state that cannot be restored', async () => {
    const state = playToDecision();
    const { memory, row } = await seed(state);
    const { report } = await loadDecisionReport(
      withState(memory, { trasig: true }),
      content,
      'A002',
      row.id,
      {
        fetcher,
      },
    );
    expect(report.warnings[0]).toMatch(/format/);
  });

  it('rejects an unknown decision or case', async () => {
    const memory = createMemoryDataStore();
    await expect(loadDecisionReport(memory, content, 'A002', 99)).rejects.toThrow(/hittades inte/);
    await expect(loadDecisionReport(memory, content, 'A999', 1)).rejects.toThrow(/finns inte/);
  });
});

describe('parseDecisionValue', () => {
  it('reads a draft, a wrapper, a JSON string and garbage', () => {
    expect(parseDecisionValue(draft)).toMatchObject({ complete: true, draft });
    expect(parseDecisionValue(JSON.stringify(draft)).complete).toBe(true);
    expect(
      parseDecisionValue({ draft, stepId: 'S6', checkedCriteria: [1], anteckningar: 'Hej' }),
    ).toMatchObject({ stepId: 'S6', checkedCriteria: [1], notes: 'Hej', complete: true });
    expect(parseDecisionValue({ utfall: 'avsla', motivering: 'Kort' })).toMatchObject({
      complete: false,
      draft: { utfall: 'avsla', motivering: 'Kort' },
    });
    expect(parseDecisionValue(42)).toMatchObject({ complete: false, draft: {} });
  });
});
