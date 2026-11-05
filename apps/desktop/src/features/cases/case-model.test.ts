import { describe, expect, it } from 'vitest';
import { parseCaseFile, type CaseFile } from '@bygglov/content-schema';
import { extendDeadline, startCase, submitStep } from '@/engine';
import {
  caseLawRefs,
  caseProgress,
  deadlineSummary,
  extensionAvailability,
  factLabel,
  factValue,
  listStatusOf,
  municipalityName,
  propertyName,
  recipientSuggestions,
  splitUnit,
} from './case-model';
import {
  appealText,
  decisionSentence,
  decisionTitle,
  OUTCOME_OPTIONS,
  outcomeOptions,
  parseFee,
  taxaLabel,
  validateDecisionDraft,
} from './decision/decision-text';
import { parseFrontMatter } from './documents/front-matter';
import { emptyDecisionDraft } from '@/engine';

function caseFile(): CaseFile {
  const result = parseCaseFile({
    id: 'A900',
    titel: 'Tillbyggnad av enbostadshus',
    niva: 2,
    status: 'utkast',
    rattslage: '2025-12-01',
    fastighet: 'Eken 3, Testby kommun',
    sammanfattning: 'Ett testärende.',
    startdatum: '2026-03-02',
    larandemal: ['Testa'],
    taxa: { bygglov_tillbyggnad_16_49kvm: 9800, reduktion_per_vecka: 0.2 },
    handlingar: [
      {
        id: 'H1',
        typ: 'ansokan',
        titel: 'Ansökan',
        fil: 'handlingar/ansokan.md',
        inkom: '2026-03-02',
      },
    ],
    steg: [
      {
        id: 'S1',
        typ: 'skrivelse',
        rubrik: 'Skriv föreläggande om komplettering',
        ar_forelaggande: true,
        bedomningspunkter: ['Konkret'],
        lagrum: ['PBL 9 kap. 91 §', 'PBL 9 kap. 99 §'],
      },
      {
        id: 'S2',
        typ: 'urval',
        rubrik: 'Vilka ska höras?',
        lagrum: ['PBL 9 kap. 94 §', 'PBL 9 kap. 91 §'],
        alternativ: [
          { text: 'Eken 2 (väster)', ratt: true },
          { text: 'Eken 9', ratt: false },
        ],
      },
      {
        id: 'S3',
        typ: 'beslut',
        rubrik: 'Beslut',
        forvantat_beslut: 'bevilja',
        bedomningspunkter: ['Rätt'],
      },
    ],
  });
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

describe('case model helpers', () => {
  it('maps data-layer statuses to list statuses', () => {
    expect(listStatusOf(null)).toBe('ny');
    expect(listStatusOf({ status: 'in_progress' })).toBe('pagar');
    expect(listStatusOf({ status: 'submitted' })).toBe('inlamnat');
    expect(listStatusOf({ status: 'reviewed' })).toBe('bedomt');
  });

  it('splits the property and municipality', () => {
    const c = caseFile();
    expect(propertyName(c)).toBe('Eken 3');
    expect(municipalityName(c)).toBe('Testby kommun');
  });

  it('formats facts with Swedish words, units and decimal comma', () => {
    expect(factLabel('hogsta_byggnadshojd')).toBe('Högsta byggnadshöjd');
    expect(factLabel('storsta_byggnadsarea_procent')).toBe('Största byggnadsarea (%)');
    expect(factLabel('avstand_till_grans_m')).toBe('Avstånd till gräns (m)');
    expect(factLabel('byggnadsarea_kvm')).toBe('Byggnadsarea (m²)');
    expect(factValue(4.5)).toBe('4,5');
    expect(factValue(true)).toBe('Ja');
    expect(factValue(['a', 2.5])).toBe('a, 2,5');
  });

  it('splits units out of calculation texts', () => {
    expect(splitUnit('Tillbyggnadens byggnadshöjd (m)')).toEqual({
      label: 'Tillbyggnadens byggnadshöjd',
      unit: 'm',
    });
    expect(splitUnit('Andel av tomtarean (%)')).toEqual({ label: 'Andel av tomtarean', unit: '%' });
    expect(splitUnit('Hur många kvm hamnar på prickmark?')).toEqual({
      label: 'Hur många kvm hamnar på prickmark?',
      unit: null,
    });
    expect(splitUnit('Höjd (m)', 'meter')).toEqual({ label: 'Höjd', unit: 'meter' });
  });

  it('collects law references and recipient suggestions from the case', () => {
    const c = caseFile();
    expect(caseLawRefs(c)).toEqual(['PBL 9 kap. 91 §', 'PBL 9 kap. 99 §', 'PBL 9 kap. 94 §']);
    expect(recipientSuggestions(c)).toEqual([
      'Sökanden',
      'Fastighetsägaren (Eken 3)',
      'Ägaren till Eken 2',
      'Ägaren till Eken 9',
    ]);
  });

  it('says the deadline runs from the change of the application (99 § första stycket 2)', () => {
    const state = startCase(caseFile(), { seed: 1 });
    const changed = { ...state, amendmentDates: ['2026-03-20'], simDate: '2026-03-25' };
    const summary = deadlineSummary(changed);
    expect(summary.label).toBe('65 dagar kvar');
    expect(summary.detail).toBe(
      'Beslut senast 2026-05-29 (9 kap. 99 §). 5 dagar sedan ändringen av ansökan.',
    );
  });

  it('summarises the 99 § deadline for the header', () => {
    const c = caseFile();
    const state = startCase(c, { seed: 1 });
    expect(deadlineSummary(state)).toMatchObject({ label: '70 dagar kvar', tone: 'normal' });
    // An injunction within three weeks pauses the deadline until the completion arrives.
    const after = submitStep(c, state, 'S1', { type: 'skrivelse', text: 'x' }).state;
    expect(deadlineSummary(after).tone).toBe('paused');
    const late = { ...state, simDate: '2026-05-20' };
    expect(deadlineSummary(late)).toMatchObject({ label: '9 dagar över fristen', tone: 'overdue' });
    // After the decision the header shows whether it was made in time, not the running days.
    const decision = {
      stepId: 'S3',
      date: '2026-04-20',
      draft: emptyDecisionDraft(),
      assessment: null as never,
      checkedCriteria: null,
    };
    const decidedInTime = { ...late, decisions: [decision] };
    expect(deadlineSummary(decidedInTime)).toMatchObject({
      label: 'Beslut inom fristen',
      tone: 'done',
    });
    const decidedLate = { ...late, decisions: [{ ...decision, date: '2026-05-13' }] };
    expect(deadlineSummary(decidedLate)).toMatchObject({
      label: 'Beslut 2 dagar för sent',
      tone: 'overdue',
    });
    expect(caseProgress(c, state)).toEqual({
      done: 0,
      total: 3,
      currentStepTitle: 'Skriv föreläggande om komplettering',
    });
  });
});

describe('vilande and extension in the header', () => {
  it('shows a resting case as paused and counts the resting days afterwards', () => {
    const state = startCase(caseFile(), { seed: 1 });
    const resting = {
      ...state,
      simDate: '2026-03-20',
      suspensions: [{ reason: 'strandskydd' as const, from: '2026-03-10', to: null }],
    };
    expect(deadlineSummary(resting)).toMatchObject({ label: 'Vilande', tone: 'paused' });
    expect(deadlineSummary(resting).detail).toContain('9 kap. 102 §');
    const ended = {
      ...resting,
      suspensions: [{ reason: 'strandskydd' as const, from: '2026-03-10', to: '2026-03-20' }],
    };
    // 2026-05-11 + 10 resting days = 2026-05-21, 62 days after 2026-03-20.
    expect(deadlineSummary(ended)).toMatchObject({ label: '62 dagar kvar', tone: 'normal' });
    expect(deadlineSummary(ended).detail).toContain('10 dagar som vilande (102 §) räknas inte.');
  });

  it('allows one extension before the deadline has run out and before the decision', () => {
    const state = startCase(caseFile(), { seed: 1 });
    expect(extensionAvailability(state)).toEqual({ allowed: true });
    const extended = extendDeadline(state, 3, 'Remiss');
    expect(extensionAvailability(extended)).toMatchObject({ allowed: false });
    expect(deadlineSummary(extended).detail).toContain('Förlängd med 3 veckor');
    const late = { ...state, simDate: '2026-05-20' };
    const why = extensionAvailability(late);
    expect(why.allowed).toBe(false);
    expect(!why.allowed && why.reason).toContain('100 § 3');
  });
});

describe('front matter', () => {
  it('reads rubrik, avsändare, datum and diarienummer and returns the body', () => {
    const parsed = parseFrontMatter(
      '---\nrubrik: Ansökan om bygglov\navsandare: "Maria Lindqvist"\ndatum: 2026-02-27\ndiarienummer: BN 2026-000214\nannat: x\n---\n\n# Ansökan\n',
    );
    expect(parsed.meta).toEqual({
      rubrik: 'Ansökan om bygglov',
      avsandare: 'Maria Lindqvist',
      datum: '2026-02-27',
      diarienummer: 'BN 2026-000214',
      extra: { annat: 'x' },
    });
    expect(parsed.body).toBe('\n# Ansökan\n');
  });

  it('leaves a document without front matter as it is', () => {
    expect(parseFrontMatter('# Rubrik\n\n---\n')).toEqual({
      meta: { extra: {} },
      body: '# Rubrik\n\n---\n',
    });
  });
});

describe('decision texts', () => {
  it('validates the form, with the appeal notice first', () => {
    const issues = validateDecisionDraft(emptyDecisionDraft());
    expect(issues.map((i) => i.field)).toEqual([
      'overklagandehanvisning',
      'lagstod',
      'motivering',
      'avgift',
      'expediering',
    ]);
    expect(
      validateDecisionDraft({
        ...emptyDecisionDraft(),
        overklagandehanvisning: true,
        lagstod: ['PBL 9 kap. 56 §'],
        motivering: 'Skäl',
        avgift: 0,
        expediering: [{ mottagare: 'Sökanden', satt: 'delges' }],
      }),
    ).toEqual([]);
  });

  it('writes the standard appeal text with the diary number', () => {
    const text = appealText(caseFile(), { diaryNumber: 'BN 1', outcome: 'bevilja' }).join(' ');
    expect(text).toMatch(/länsstyrelsen \(13 kap\. 3 § PBL\)/);
    expect(text).toMatch(/inom tre veckor/);
    expect(text).toMatch(/kungjorts på kommunens anslagstavla \(13 kap\. 16 § PBL\)/);
    expect(text).toMatch(/diarienummer BN 1/);
    const refusal = appealText(caseFile(), { outcome: 'avsla' }).join(' ');
    expect(refusal).not.toMatch(/kungjorts/);
  });

  it('writes a start notice as a start notice, with its own appeal limits', () => {
    const file = { ...caseFile(), titel: 'Anmälan: installation av eldstad' };
    expect(decisionTitle('startbesked', file)).toBe('Startbesked för installation av eldstad');
    expect(
      decisionSentence(
        { ...emptyDecisionDraft(), utfall: 'startbesked', lagstod: ['10 kap. 23 c § PBL'] },
        file,
      ),
    ).toMatchObject({
      verb: 'ger startbesked',
      rest: ' för installation av eldstad, med stöd av 10 kap. 23 c § PBL.',
    });
    const text = appealText(file, { outcome: 'startbesked' }).join(' ');
    expect(text).toMatch(/13 kap\. 2 § 5 PBL/);
    expect(text).not.toMatch(/kungjorts/);
    expect(OUTCOME_OPTIONS.map((o) => o.value)).toContain('startbesked');
  });

  it('names the decision after the kind of permit', () => {
    const marklov = {
      ...caseFile(),
      titel: 'Marklov och trädfällning på Eken 2',
      lovtyp: 'marklov' as const,
    };
    expect(decisionTitle('bevilja_med_villkor', marklov)).toBe(
      'Beslut om marklov och trädfällning på Eken 2',
    );
    expect(
      decisionSentence({ ...emptyDecisionDraft(), utfall: 'bevilja_med_villkor' }, marklov).verb,
    ).toBe('beviljar marklov med villkor');
    expect(outcomeOptions(marklov)[1]?.label).toBe('Bevilja marklov med villkor');
    const advance = {
      ...caseFile(),
      titel: 'Förhandsbesked för två tomter vid Kvarnbacken',
      lovtyp: 'forhandsbesked' as const,
    };
    expect(decisionTitle('bevilja', advance)).toBe(
      'Beslut om förhandsbesked för två tomter vid Kvarnbacken',
    );
    expect(decisionSentence({ ...emptyDecisionDraft(), utfall: 'bevilja' }, advance)).toMatchObject(
      {
        verb: 'ger positivt förhandsbesked',
        rest: ' i ärendet om förhandsbesked för två tomter vid Kvarnbacken.',
      },
    );
    expect(outcomeOptions(advance)[0]?.label).toBe('Ge positivt förhandsbesked');
    // Without lovtyp it is a building permit, as before.
    expect(decisionTitle('bevilja', caseFile())).toBe(
      'Beslut om bygglov för tillbyggnad av enbostadshus',
    );
  });

  it('parses fees and labels taxa entries', () => {
    expect(parseFee('9 800')).toBe(9800);
    expect(parseFee('7840 kr')).toBe(7840);
    expect(parseFee('')).toBeNull();
    expect(parseFee('abc')).toBeNaN();
    expect(taxaLabel('bygglov_tillbyggnad_16_49kvm')).toBe('Bygglov tillbyggnad 16–49 kvm');
  });
});
