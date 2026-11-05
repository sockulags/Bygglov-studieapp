import {
  allCaseSteps,
  type CaseDocument,
  type CaseFile,
  type DecisionOutcome,
  type DecisionStep,
  type PermitKind,
  type SelectionStep,
} from '@bygglov/content-schema';
import { calculateFee, caseDeadline, FEE_LAW_REFS, formatKronor, startedWeeks } from './deadline';
import { isMissedResult, selectionStats } from './grading';
import { chapterNineRefs } from './law';
import {
  caseParties,
  findDesignation,
  fold,
  isApplicant,
  isNeighbour,
  isOwner,
  type CaseParties,
} from './parties';
import type {
  CaseState,
  CheckSeverity,
  DecisionAssessment,
  DecisionCheck,
  DecisionDraft,
  DecisionRecipient,
  DeliveryMethod,
} from './types';

/**
 * Structured checks of a decision draft (beslutsmallen). Every check is derived from the
 * case file and the case state, never from case-specific code, and explains itself in
 * Swedish with the law reference it rests on (PBL in the wording from 2025-12-01).
 */

export const DECISION_OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  bevilja: 'Bevilja bygglov',
  bevilja_med_villkor: 'Bevilja bygglov med villkor',
  avsla: 'Avslå ansökan',
  avvisa: 'Avvisa ansökan',
  avskriva: 'Avskriva ärendet',
  startbesked: 'Ge startbesked',
};

/** What the case's application is for; bygglov unless the case says otherwise. */
export function permitKind(caseFile: Pick<CaseFile, 'lovtyp' | 'niva'>): PermitKind {
  return caseFile.niva === 4 ? 'bygglov' : (caseFile.lovtyp ?? 'bygglov');
}

/** "bygglov", "marklov", "rivningslov" or "förhandsbesked". */
export function permitNoun(caseFile: Pick<CaseFile, 'lovtyp' | 'niva'>): string {
  const kind = permitKind(caseFile);
  return kind === 'forhandsbesked' ? 'förhandsbesked' : kind;
}

/**
 * The outcome named for the case: "Bevilja marklov med villkor", "Ge positivt
 * förhandsbesked". Without a case, or for bygglov, the general labels.
 */
export function decisionOutcomeLabel(
  outcome: DecisionOutcome,
  caseFile?: Pick<CaseFile, 'lovtyp' | 'niva'>,
): string {
  const kind = caseFile ? permitKind(caseFile) : 'bygglov';
  if (kind === 'bygglov' || !caseFile) return DECISION_OUTCOME_LABELS[outcome];
  if (kind === 'forhandsbesked') {
    if (outcome === 'bevilja') return 'Ge positivt förhandsbesked';
    if (outcome === 'bevilja_med_villkor') return 'Ge positivt förhandsbesked med villkor';
    if (outcome === 'avsla') return 'Ge negativt förhandsbesked (avslå ansökan)';
    return DECISION_OUTCOME_LABELS[outcome];
  }
  if (outcome === 'bevilja') return `Bevilja ${kind}`;
  if (outcome === 'bevilja_med_villkor') return `Bevilja ${kind} med villkor`;
  return DECISION_OUTCOME_LABELS[outcome];
}

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  delges: 'delges',
  meddelande: 'meddelande',
  skickas: 'skickas',
};

/** An empty decision form. */
export function emptyDecisionDraft(): DecisionDraft {
  return {
    utfall: 'bevilja',
    lagstod: [],
    motivering: '',
    villkor_upplysningar: '',
    avgift: null,
    overklagandehanvisning: false,
    expediering: [],
  };
}

export function isGrant(outcome: DecisionOutcome): boolean {
  return outcome === 'bevilja' || outcome === 'bevilja_med_villkor';
}

/**
 * A start notice (startbesked) for a notifiable measure. It is not a permit: 9 kap. 108–110 §§
 * on service and public announcement do not apply, and its content follows 10 kap. 24 § PBL.
 */
export function isStartNotice(outcome: DecisionOutcome): boolean {
  return outcome === 'startbesked';
}

/**
 * A notification case (anmälan): its decision step expects a start notice. Its deadline is
 * four weeks (6 kap. 5 § PBF).
 */
export function isNotificationCase(caseFile: CaseFile): boolean {
  return allCaseSteps(caseFile).some(
    (s) => s.typ === 'beslut' && s.forvantat_beslut === 'startbesked',
  );
}

/** Sections of 10 kap. PBL named in a free-text law reference, e.g. "10 kap. 23 c §". */
export function chapterTenSections(text: string): string[] {
  const out: string[] = [];
  const kap = /\b10\s*kap\.?\s*((?:\d+\s*[a-z]?\b[\s,–-]*(?:och\s*)?)+)§/gi;
  let match: RegExpExecArray | null;
  while ((match = kap.exec(text)) !== null) {
    const list = match[1] ?? '';
    const part = /(\d+)(?:\s*([a-z])\b)?/gi;
    let m: RegExpExecArray | null;
    while ((m = part.exec(list)) !== null) {
      out.push(m[2] ? `${m[1]} ${m[2].toLowerCase()}` : (m[1] ?? ''));
    }
  }
  return out;
}

/** 10 kap. 23 § (lov) and 23 c § (anmälan) are the sections a start notice is given under. */
const START_NOTICE_SECTIONS = ['23', '23 c'];

/**
 * Assesses a decision draft as if it were submitted on `state.simDate`. The checks reveal
 * the expected outcome, so the UI should only show them after submission.
 */
export function assessDecision(
  caseFile: CaseFile,
  step: DecisionStep,
  draft: DecisionDraft,
  state: CaseState,
): DecisionAssessment {
  const checks: DecisionCheck[] = [];
  const add = (check: Omit<DecisionCheck, 'details'> & { details?: string[] }) =>
    checks.push({ details: [], ...check });
  const grant = isGrant(draft.utfall);
  const label = (outcome: DecisionOutcome) => decisionOutcomeLabel(outcome, caseFile);

  // 1. Outcome: the expected one, or one of the outcomes the case also accepts.
  const expected = step.forvantat_beslut;
  const outcomeRight = draft.utfall === expected;
  const alternative = outcomeRight
    ? undefined
    : step.godtagbara_utfall?.find((a) => a.utfall === draft.utfall);
  add({
    id: 'utfall',
    title: 'Beslut',
    passed: outcomeRight || alternative !== undefined,
    severity: 'error',
    message: outcomeRight
      ? `Rätt utfall: ${label(expected)}.`
      : alternative
        ? `Godtagbart utfall: ${label(draft.utfall)}. Det förväntade var "${label(expected)}". ${alternative.motivering}`
        : `Förväntat utfall var "${label(expected)}", ditt beslut är "${label(draft.utfall)}".`,
    lawRefs: step.lagrum ?? [],
  });

  // 2. Legal basis: at least one section of 9 kap., in the current numbering. A start notice
  // is given under 10 kap. 23 or 23 c §.
  const startNotice = isStartNotice(draft.utfall);
  const refs = draft.lagstod.flatMap((text) => chapterNineRefs(text));
  const existing = refs.filter((r) => r.exists);
  if (startNotice) {
    const tenth = unique(draft.lagstod.flatMap((text) => chapterTenSections(text)));
    const basis = tenth.filter((s) => START_NOTICE_SECTIONS.includes(s));
    add({
      id: 'lagstod',
      title: 'Lagstöd',
      passed: basis.length > 0,
      severity: 'error',
      message:
        basis.length > 0
          ? `Startbeskedet grundas på 10 kap. ${basis.map((s) => `${s} §`).join(' och ')} PBL.`
          : 'Ange lagrummet för startbeskedet: 10 kap. 23 c § PBL för en anmälningspliktig åtgärd (10 kap. 23 § för en lovpliktig).',
      lawRefs: ['PBL 10 kap. 23 §', 'PBL 10 kap. 23 c §', 'FL 32 §'],
    });
  } else {
    add({
      id: 'lagstod',
      title: 'Lagstöd',
      passed: existing.length > 0,
      severity: 'error',
      message:
        existing.length > 0
          ? `Lagstöd ur 9 kap. PBL anges (${unique(existing.map((r) => `${r.section} §`)).join(', ')}).`
          : 'Ange minst ett lagrum ur 9 kap. PBL som beslutet grundas på, t.ex. 9 kap. 56 § för bygglov inom detaljplan.',
      lawRefs: ['FL 32 §'],
    });
  }
  const outdated = refs.filter((r) => !r.exists);
  if (outdated.length > 0) {
    add({
      id: 'lagstod_numrering',
      title: 'Numrering i 9 kap.',
      passed: false,
      severity: 'warning',
      message:
        'Några lagrum finns inte i 9 kap. PBL i lydelsen från 1 december 2025. Kapitlet har fått ny numrering.',
      lawRefs: [],
      details: outdated.map((r) =>
        r.replacedBy
          ? `${r.raw}: motsvaras nu av ${r.replacedBy}.`
          : `${r.raw}: 9 kap. ${r.section} § finns inte.`,
      ),
    });
  }
  if (step.lagrum && step.lagrum.length > 0) {
    const given = new Set(refs.map((r) => r.section));
    const missing = step.lagrum.filter((ref) =>
      chapterNineRefs(ref).some((r) => !given.has(r.section)),
    );
    add({
      id: 'lagstod_forvantat',
      title: 'Förväntade lagrum',
      passed: missing.length === 0,
      severity: 'tip',
      message:
        missing.length === 0
          ? 'Alla lagrum som ärendet förväntar sig finns med.'
          : `Överväg att också ange ${missing.join(', ')}.`,
      lawRefs: [...step.lagrum],
    });
  }

  // 3. Reasons.
  const hasReasons = draft.motivering.trim() !== '';
  add({
    id: 'motivering',
    title: 'Motivering',
    passed: hasReasons,
    severity: 'warning',
    message: hasReasons
      ? 'Beslutet har en motivering. Jämför den med bedömningspunkterna.'
      : 'Beslutet saknar motivering. Den ska ange vilka föreskrifter som tillämpats och vilka omständigheter som varit avgörande.',
    lawRefs: ['FL 32 §'],
  });

  // 4. How to appeal.
  add({
    id: 'overklagandehanvisning',
    title: 'Överklagandehänvisning',
    passed: draft.overklagandehanvisning,
    severity: 'error',
    message: draft.overklagandehanvisning
      ? 'Överklagandehänvisning finns.'
      : startNotice
        ? 'Överklagandehänvisning saknas. Ett startbesked kan överklagas till länsstyrelsen, utom i frågan om behovet av kontrollplan, kontrollansvarig och tekniskt samråd.'
        : 'Överklagandehänvisning saknas. Beslutet ska delges tillsammans med en uppgift om vad den som vill överklaga måste göra.',
    lawRefs: startNotice
      ? ['PBL 13 kap. 2 § 5', 'PBL 13 kap. 3 §', 'FL 33 §']
      : ['PBL 9 kap. 108 §', 'FL 33 §'],
  });

  // 5. Neighbour notice when the case requires it.
  const notice = neighbourNoticeCheck(caseFile, state);
  if (notice) add(notice);

  // 6. Fee, with the reduction for an exceeded deadline.
  const fee = calculateFee(caseFile.taxa, caseDeadline(state), state.simDate);
  add(feeCheck(draft, fee, draft.utfall));

  // 7. Delivery: the applicant and the owner are served (delges). Recipients are matched
  // by role word, name (from `parter`) and property designation.
  const parties = caseParties(caseFile);
  if (startNotice) {
    add(startNoticeDeliveryCheck(draft.expediering, parties));
  }
  if (!startNotice)
    add(
      deliveryCheck({
        id: 'delgivning_sokande',
        title: 'Delgivning av sökanden',
        who: 'Sökanden',
        matches: (m) => isApplicant(m, parties),
        recipients: draft.expediering,
        lawRefs: ['PBL 9 kap. 108 § första stycket 1'],
      }),
    );
  if (!startNotice)
    add(
      deliveryCheck({
        id: 'delgivning_fastighetsagare',
        title: 'Delgivning av fastighetsägaren',
        who: 'Fastighetsägaren',
        matches: (m) => isOwner(m, parties),
        recipients: draft.expediering,
        lawRefs: ['PBL 9 kap. 108 § första stycket 1'],
      }),
    );

  // 8. Neighbours whose objections were not accommodated are served too.
  const objectors = objectingNeighbours(caseFile, state);
  if (grant && objectors.length > 0) {
    add(objectorDeliveryCheck(objectors, draft.expediering, parties));
  }

  // 9. Other notified neighbours get the notice of the public announcement.
  if (grant) {
    const tip = announcementNoticeTip(caseFile, state, draft.expediering, objectors, parties);
    if (tip) add(tip);
  }

  // 10. Mandatory information in a permit (105 §), looked for in the free text. A start
  // notice has its own content (10 kap. 24 §), looked for in the reasons and the information.
  if (startNotice) {
    const written = `${draft.motivering}\n${draft.villkor_upplysningar}`;
    for (const info of START_NOTICE_INFORMATION) {
      const found = info.pattern.test(written);
      add({
        id: info.id,
        title: info.title,
        passed: found,
        severity: 'tip',
        message: found ? info.found : info.missing,
        lawRefs: info.lawRefs,
      });
    }
  }
  if (grant) {
    const information =
      permitKind(caseFile) === 'forhandsbesked' ? ADVANCE_NOTICE_INFORMATION : PERMIT_INFORMATION;
    for (const info of information) {
      const found = info.pattern.test(draft.villkor_upplysningar);
      add({
        id: info.id,
        title: info.title,
        passed: found,
        severity: 'tip',
        message: found ? info.found : info.missing,
        lawRefs: info.lawRefs,
      });
    }
  }

  const counted = checks.filter((c) => c.severity !== 'tip');
  const criteria = [...step.bedomningspunkter];
  return {
    caseId: caseFile.id,
    stepId: step.id,
    decisionDate: state.simDate,
    expectedOutcome: expected,
    checks,
    passedChecks: counted.filter((c) => c.passed).length,
    totalChecks: counted.length,
    fee,
    criteria,
    modelDecisionPath: step.modellbeslut ?? caseFile.facit?.modellbeslut ?? null,
    commonMistakes: [...(caseFile.facit?.vanliga_fel ?? [])],
  };
}

/** Share of the counted checks (errors and warnings) that passed, 0..1. */
export function assessmentScore(assessment: DecisionAssessment): number {
  return assessment.totalChecks === 0 ? 0 : assessment.passedChecks / assessment.totalChecks;
}

/* ----------------------------------------------------------------- neighbour notice */

/**
 * The case requires neighbours to be notified (9 kap. 94 §) when it has a selection step
 * for whom to notify, or when its steps refer to 94–96 §§ or to a minor deviation (60 §).
 * The notice counts as given when a selection step was completed without leaving out
 * anyone who should be notified.
 */
function neighbourNoticeCheck(
  caseFile: CaseFile,
  state: CaseState,
): (Omit<DecisionCheck, 'details'> & { details?: string[] }) | null {
  const steps = allCaseSteps(caseFile);
  const selectionSteps = steps.filter((s): s is SelectionStep => s.typ === 'urval');
  const mentionsNotice = steps.some((s) =>
    (s.lagrum ?? []).some((ref) =>
      chapterNineRefs(ref).some((r) => ['60', '94', '95', '96'].includes(r.section)),
    ),
  );
  if (selectionSteps.length === 0 && !mentionsNotice) return null;
  const lawRefs = ['PBL 9 kap. 94 §', 'PBL 9 kap. 96 §'];
  if (selectionSteps.length === 0) {
    return {
      id: 'underrattelse',
      title: 'Underrättelse till grannar',
      passed: true,
      severity: 'tip',
      message:
        'Åtgärden avviker från planen. Kontrollera att berörda grannar underrättats innan beslut.',
      lawRefs,
    };
  }
  const results = selectionSteps.map((s) => ({ step: s, result: state.stepResults[s.id] }));
  const done = results.filter((r) => r.result && !r.result.skipped);
  if (done.length === 0) {
    return {
      id: 'underrattelse',
      title: 'Underrättelse till grannar',
      passed: false,
      severity: 'warning',
      message:
        'Beslut utan underrättelse enligt 9 kap. 94 §. Åtgärden avviker från planen, så berörda grannar ska ges tillfälle att yttra sig före beslut. Ett lov som ges utan det riskerar att upphävas vid överklagande.',
      lawRefs,
    };
  }
  const incomplete = done.filter((r) => r.result && isMissedResult(r.step, r.result));
  if (incomplete.length > 0) {
    const missing = incomplete.flatMap(({ step, result }) => {
      const answer = result?.answer;
      if (answer?.type !== 'urval') return [];
      return step.alternativ.filter((alt, i) => alt.ratt && !answer.selected.includes(i));
    });
    return {
      id: 'underrattelse',
      title: 'Underrättelse till grannar',
      passed: false,
      severity: 'warning',
      message:
        'Alla som skulle underrättas fick inte tillfälle att yttra sig. Meddelandet ska skickas till ägare och innehavare av särskild rätt till grannfastigheterna.',
      lawRefs,
      details: missing.map((alt) => `Underrättades inte: ${alt.text}`),
    };
  }
  const stats = done.map((r) =>
    r.result?.answer?.type === 'urval' ? selectionStats(r.step, r.result.answer.selected) : null,
  );
  const extra = stats.some((s) => s !== null && s.falsePositives > 0);
  return {
    id: 'underrattelse',
    title: 'Underrättelse till grannar',
    passed: true,
    severity: 'warning',
    message: extra
      ? 'Berörda grannar har underrättats (även några som inte behövde det).'
      : 'Berörda grannar har underrättats före beslut.',
    lawRefs,
  };
}

/* ---------------------------------------------------------------------------- fee */

function feeCheck(
  draft: DecisionDraft,
  fee: ReturnType<typeof calculateFee>,
  outcome: DecisionOutcome,
): Omit<DecisionCheck, 'details'> & { details?: string[] } {
  const base = { id: 'avgift', title: 'Avgift', lawRefs: [...FEE_LAW_REFS] };
  if (fee.lines.length === 0) {
    return {
      ...base,
      passed: true,
      severity: 'tip',
      message: 'Ärendet har ingen taxa att räkna avgiften mot.',
    };
  }
  const severity: CheckSeverity = outcome === 'avvisa' || outcome === 'avskriva' ? 'tip' : 'error';
  const expected = fee.lines.map((l) => formatKronor(l.expectedAmount)).join(' eller ');
  if (draft.avgift === null) {
    return {
      ...base,
      passed: false,
      severity,
      message: `Avgift saknas. Beslutet ska redovisa avgiften och hur den bestämts; enligt taxan blir den ${expected}.`,
      details: fee.explanation,
    };
  }
  const given = draft.avgift;
  const match = fee.lines.find((l) => Math.abs(l.expectedAmount - given) <= 1);
  if (match) {
    return {
      ...base,
      passed: true,
      severity,
      message:
        fee.weeksOverdue > 0
          ? `Rätt avgift, ${formatKronor(given)}, med reduktion för överskriden tidsfrist.`
          : `Rätt avgift enligt taxan, ${formatKronor(given)}.`,
      details: fee.explanation,
    };
  }
  const unreduced =
    fee.weeksOverdue > 0 && fee.lines.some((l) => Math.abs(l.baseAmount - given) <= 1);
  return {
    ...base,
    passed: false,
    severity,
    message: unreduced
      ? `Avgiften ${formatKronor(given)} är inte reducerad. Tidsfristen har överskridits med ${startedWeeks(fee.weeksOverdue)}, så avgiften ska vara ${expected}.`
      : `Avgiften ${formatKronor(given)} stämmer inte med taxan. Förväntat: ${expected}.`,
    details: fee.explanation,
  };
}

/* ----------------------------------------------------------------------- delivery */

function deliveryCheck(options: {
  id: string;
  title: string;
  who: string;
  matches: (recipient: string) => boolean;
  recipients: readonly DecisionRecipient[];
  lawRefs: string[];
}): Omit<DecisionCheck, 'details'> {
  const found = options.recipients.filter((r) => options.matches(r.mottagare));
  const served = found.some((r) => r.satt === 'delges');
  let message: string;
  if (served) message = `${options.who} delges beslutet.`;
  else if (found.length === 0)
    message = `${options.who} saknas i expedieringen. Beslutet ska delges ${options.who.toLowerCase()}.`;
  else
    message = `${options.who} får beslutet som "${found[0]?.satt ?? ''}" men ska delges. Att bara skicka beslutet räcker endast om delgivning är uppenbart obehövlig (108 § andra stycket).`;
  return {
    id: options.id,
    title: options.title,
    passed: served,
    severity: 'error',
    message,
    lawRefs: options.lawRefs,
  };
}

interface Objector {
  documentId: string;
  title: string;
  designation: string | null;
}

/**
 * Neighbours who submitted objections: visible documents of type `grannyttrande`, unless
 * the document's `fakta.invandning` is false. The property comes from `fakta.fastighet`
 * or from the document title ("Yttrande från ägaren till Björken 8").
 */
export function objectingNeighbours(caseFile: CaseFile, state: CaseState): Objector[] {
  const visible = new Set(state.visibleDocuments.map((d) => d.documentId));
  return caseFile.handlingar
    .filter((doc) => doc.typ === 'grannyttrande' && visible.has(doc.id))
    .filter((doc) => doc.fakta?.['invandning'] !== false)
    .map((doc) => ({ documentId: doc.id, title: doc.titel, designation: designationOf(doc) }));
}

function designationOf(doc: CaseDocument): string | null {
  const fact = doc.fakta?.['fastighet'];
  if (typeof fact === 'string' && fact.trim() !== '') return fact.trim();
  return findDesignation(doc.titel);
}

function objectorDeliveryCheck(
  objectors: readonly Objector[],
  recipients: readonly DecisionRecipient[],
  parties: CaseParties,
): Omit<DecisionCheck, 'details'> & { details?: string[] } {
  const lawRefs = ['PBL 9 kap. 108 § första stycket 2'];
  const unknown = objectors.filter((o) => o.designation === null);
  const known = objectors.filter(
    (o): o is Objector & { designation: string } => o.designation !== null,
  );
  const notServed = known.filter(
    (o) =>
      !recipients.some(
        (r) => r.satt === 'delges' && isNeighbour(r.mottagare, o.designation, parties),
      ),
  );
  const details = [
    ...notServed.map((o) => {
      const listed = recipients.find((r) => isNeighbour(r.mottagare, o.designation, parties));
      return listed
        ? `${o.designation} finns med som "${listed.satt}" men ska delges.`
        : `${o.designation} saknas i expedieringen (se ${o.title}).`;
    }),
    ...unknown.map((o) => `Kontrollera själv att den som skrev "${o.title}" delges.`),
  ];
  const passed = notServed.length === 0;
  return {
    id: 'delgivning_grannar',
    title: 'Delgivning av grannar med invändningar',
    passed,
    severity: 'error',
    message: passed
      ? 'Grannar vars synpunkter inte tillgodosetts delges beslutet.'
      : 'Grannar som lämnat synpunkter som inte tillgodosetts ska delges beslutet tillsammans med överklagandehänvisningen.',
    lawRefs,
    details,
  };
}

/**
 * 110 §: neighbours who were notified (the right alternatives of a completed selection
 * step) but are not served get the notice of the announcement.
 */
function announcementNoticeTip(
  caseFile: CaseFile,
  state: CaseState,
  recipients: readonly DecisionRecipient[],
  objectors: readonly Objector[],
  parties: CaseParties,
): (Omit<DecisionCheck, 'details'> & { details?: string[] }) | null {
  const notified = allCaseSteps(caseFile)
    .filter((s): s is SelectionStep => s.typ === 'urval')
    .filter((s) => {
      const r = state.stepResults[s.id];
      return r !== undefined && !r.skipped;
    })
    .flatMap((s) => s.alternativ.filter((a) => a.ratt).map((a) => findDesignation(a.text)))
    .filter((d): d is string => d !== null);
  const objecting = objectors.map((o) => o.designation).filter((d): d is string => d !== null);
  const others = [...new Set(notified)].filter((d) => !objecting.some((o) => fold(o) === fold(d)));
  if (others.length === 0) return null;
  const missing = others.filter(
    (d) => !recipients.some((r) => isNeighbour(r.mottagare, d, parties)),
  );
  return {
    id: 'meddelande_grannar',
    title: 'Meddelande till övriga grannar',
    passed: missing.length === 0,
    severity: 'tip',
    message:
      missing.length === 0
        ? 'Övriga grannar som underrättats får meddelande om beslutet.'
        : 'Meddelandet om kungörelsen ska senast samma dag skickas till grannarna som underrättats och inte delges.',
    lawRefs: ['PBL 9 kap. 110 §', 'PBL 9 kap. 109 §'],
    details: missing.map((d) => `Saknas: ${d}`),
  };
}

/**
 * A start notice goes to the developer (byggherren), here the applicant. 9 kap. 108 § does
 * not apply, so any way of sending it passes (FL 33 §); serving it (delges) is a tip, since
 * the time for appeal then starts to run (FL 44 §).
 */
function startNoticeDeliveryCheck(
  recipients: readonly DecisionRecipient[],
  parties: CaseParties,
): Omit<DecisionCheck, 'details'> {
  const found = recipients.filter((r) => isApplicant(r.mottagare, parties));
  const served = found.some((r) => r.satt === 'delges');
  return {
    id: 'delgivning_sokande',
    title: 'Startbeskedet till byggherren',
    passed: found.length > 0,
    severity: 'error',
    message:
      found.length === 0
        ? 'Byggherren saknas i expedieringen. Startbeskedet ska skickas till byggherren, som är part i ärendet.'
        : served
          ? 'Byggherren delges startbeskedet, så att tiden för överklagande börjar löpa.'
          : 'Byggherren får startbeskedet. Överväg att delge det, så att tiden för överklagande börjar löpa (44 § förvaltningslagen).',
    lawRefs: ['FL 33 §', 'FL 44 §'],
  };
}

/* ------------------------------------------------------------- start notice content */

const START_NOTICE_INFORMATION: {
  id: string;
  title: string;
  pattern: RegExp;
  found: string;
  missing: string;
  lawRefs: string[];
}[] = [
  {
    id: 'startbesked_kontrollplan',
    title: 'Kontrollplanen fastställs',
    pattern: /kontrollplan/i,
    found: 'Startbeskedet tar upp kontrollplanen.',
    missing:
      'Hittade ingen kontrollplan. I startbeskedet ska nämnden fastställa den kontrollplan som ska gälla, med uppgift om vem som gör kontrollerna.',
    lawRefs: ['PBL 10 kap. 24 § 1'],
  },
  {
    id: 'startbesked_slutbesked',
    title: 'Handlingar inför slutbesked',
    pattern: /slutbesked/i,
    found: 'Startbeskedet tar upp slutbeskedet.',
    missing:
      'Hittade inget om slutbeskedet. Startbeskedet ska ange vilka handlingar som ska lämnas in inför slutbeskedet.',
    lawRefs: ['PBL 10 kap. 24 § 4'],
  },
  {
    id: 'startbesked_ibruktagande',
    title: 'Inte i bruk före slutbesked',
    pattern: /i bruk|ibruktag|användas|använda/i,
    found: 'Upplysning om att det nya inte får tas i bruk före slutbesked finns.',
    missing:
      'Hittade ingen upplysning om att det som byggts eller installerats inte får tas i bruk förrän nämnden gett slutbesked.',
    lawRefs: ['PBL 10 kap. 4 §'],
  },
  {
    id: 'startbesked_giltighetstid',
    title: 'Giltighetstid',
    pattern: /två år|upphör att gälla|25 §/i,
    found: 'Upplysning om hur länge startbeskedet gäller finns.',
    missing:
      'Hittade ingen upplysning om giltighetstiden. Ett startbesked för en anmälningspliktig åtgärd upphör att gälla två år efter att det gavs.',
    lawRefs: ['PBL 10 kap. 24 a §', 'PBL 10 kap. 25 §'],
  },
];

/* ------------------------------------------------- advance notice (förhandsbesked) */

/** 104 §: what a positive förhandsbesked must say, instead of 105 § for a permit. */
const ADVANCE_NOTICE_INFORMATION: typeof PERMIT_INFORMATION = [
  {
    id: 'upplysning_forhandsbesked_giltighet',
    title: 'Upplysning om giltighetstid',
    pattern: /två år/i,
    found: 'Upplysning om att förhandsbeskedet gäller om bygglov söks inom två år finns.',
    missing:
      'Hittade ingen upplysning om att förhandsbeskedet bara gäller om bygglov söks inom två år efter att beslutet fått laga kraft.',
    lawRefs: ['PBL 9 kap. 104 § 1'],
  },
  {
    id: 'upplysning_forhandsbesked_paborja',
    title: 'Upplysning om att åtgärden inte får påbörjas',
    pattern: /påbörja|bygglov och startbesked|startbesked/i,
    found: 'Upplysning om att förhandsbeskedet inte innebär att åtgärden får påbörjas finns.',
    missing:
      'Hittade ingen upplysning om att förhandsbeskedet inte innebär att åtgärden får påbörjas; bygglov och startbesked krävs.',
    lawRefs: ['PBL 9 kap. 104 § 2'],
  },
];

/* ------------------------------------------------------------- permit information */

const PERMIT_INFORMATION: {
  id: string;
  title: string;
  pattern: RegExp;
  found: string;
  missing: string;
  lawRefs: string[];
}[] = [
  {
    id: 'upplysning_startbesked',
    title: 'Upplysning om startbesked',
    pattern: /startbesked/i,
    found: 'Upplysning om att startbesked krävs finns.',
    missing:
      'Hittade ingen upplysning om att åtgärden inte får påbörjas förrän nämnden gett startbesked.',
    lawRefs: ['PBL 9 kap. 105 § 4', 'PBL 9 kap. 114 §'],
  },
  {
    id: 'upplysning_giltighetstid',
    title: 'Upplysning om giltighetstid',
    pattern: /giltighet|två år|fem år|115 §/i,
    found: 'Upplysning om lovets giltighetstid finns.',
    missing:
      'Hittade ingen upplysning om giltighetstiden (påbörjas inom två år och avslutas inom fem år från laga kraft).',
    lawRefs: ['PBL 9 kap. 105 § 1', 'PBL 9 kap. 115 §'],
  },
  {
    id: 'upplysning_laga_kraft',
    title: 'Upplysning om påbörjande före laga kraft',
    pattern: /laga kraft/i,
    found: 'Upplysning om risken med att påbörja före laga kraft finns.',
    missing:
      'Hittade ingen upplysning om att en åtgärd som påbörjas innan beslutet fått laga kraft kan behöva återställas.',
    lawRefs: ['PBL 9 kap. 105 § 5'],
  },
  {
    id: 'upplysning_kontrollansvarig',
    title: 'Upplysning om kontrollansvarig',
    pattern: /kontrollansvarig/i,
    found: 'Upplysning om kontrollansvarig finns.',
    missing: 'Hittade ingen upplysning om kontrollansvarig.',
    lawRefs: ['PBL 9 kap. 105 § 3'],
  },
];

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
