import { addDays, daysBetween } from './dates';
import { SUSPENSION_REASONS, type SuspensionReason } from '@bygglov/content-schema';
import type {
  CaseDeadline,
  CaseState,
  DeadlineBasis,
  DeadlineStatus,
  FeeCalculation,
  FeeLine,
  Injunction,
  Suspension,
} from './types';

/**
 * Handläggningstid under 9 kap. 99 § PBL (lydelse från 2025-12-01) and the fee reduction in
 * 12 kap. 8 a § PBL.
 *
 * - The ten weeks run from the application day (99 § första stycket 1).
 * - If the applicant later, on their own initiative, hands in more material or changes the
 *   application, they run from that day instead (99 § första stycket 2).
 * - If the board orders the applicant to remedy a deficiency (91 §) within three weeks of
 *   the day in 1 or 2, they run from the day the deficiency was remedied (99 § första
 *   stycket 4). A later injunction does not move the start.
 * - When several of these apply, the latest day counts. The applicant is to be told in
 *   writing when the clock starts on another day than the application day (100 § 2).
 * - The deadline may be extended once by at most ten weeks (99 § andra stycket), counted
 *   from the deadline that applies.
 * - The fee is reduced by one fifth for every started week the deadline is exceeded
 *   (12 kap. 8 a §).
 * - Vilande (9 kap. 102 §): "Trots 99 § får byggnadsnämnden besluta att ett ärende om lov
 *   eller förhandsbesked inte ska avgöras förrän 1. frågan om dispens från strandskydd har
 *   avgjorts, …". 12 kap. 8 a § första stycket (lydelse 2025:974, riksdagen.se, hämtad
 *   2026-11-05) says: "Avgiften ska dock inte reduceras om tidsfristen överskrids på grund av
 *   ett beslut enligt 9 kap. 102 §." The simulator models this as a pause: the days the case
 *   rests after the ten weeks have started do not count, so the date from which the fee is
 *   reduced moves by as many days. While the case rests, the clock does not run at all.
 *
 * Not modelled: the defence authorities' answer (99 § första stycket 3), the shorter
 * deadlines in 99 a § and the solar energy exception, and the two-year limit for planarbete
 * in 102 § andra stycket.
 */

export const DEADLINE_DAYS = 70;
export const INJUNCTION_WINDOW_DAYS = 21;
export const MAX_EXTENSION_WEEKS = 10;
/** 12 kap. 8 a § PBL: one fifth per started week. */
export const DEFAULT_REDUCTION_PER_WEEK = 0.2;
const REDUCTION_KEY = /^reduktion/;

export const DEADLINE_LAW_REFS = ['PBL 9 kap. 99 §'];
export const FEE_LAW_REFS = ['PBL 12 kap. 8 a §', 'PBL 9 kap. 107 §'];

const INFORM_APPLICANT =
  ' Sökanden ska informeras skriftligen om den ändrade tidpunkten (9 kap. 100 § 2).';

/** What the case waits for under 9 kap. 102 § första stycket 1–3, as "förrän …". */
export const SUSPENSION_REASON_TEXT: Record<SuspensionReason, string> = {
  strandskydd: 'frågan om dispens från strandskydd har avgjorts',
  expropriation: 'frågan om expropriation har avgjorts',
  planarbete: 'planarbetet har avslutats',
};

/** "9 kap. 102 § första stycket 1" for a reason. */
export function suspensionLawRef(reason: SuspensionReason): string {
  const point = SUSPENSION_REASONS.indexOf(reason) + 1;
  return `9 kap. 102 § första stycket ${point}`;
}

export interface DeadlineInput {
  applicationDate: string;
  /** Injunctions to complete the application, in any order. */
  injunctionDates?: readonly string[];
  completionDate?: string | null;
  /**
   * Days when the applicant, on their own initiative, handed in more material or changed
   * the application (99 § första stycket 2), in any order. Days on or before the
   * application day are ignored.
   */
  amendmentDates?: readonly string[];
  extensionWeeks?: number;
  /** Periods the case rested under 102 § (`to` null while it still rests). */
  suspensions?: readonly Pick<Suspension, 'from' | 'to'>[];
}

/** The decision deadline under 9 kap. 99 §, paused while the case rests (102 §). */
export function computeDeadline(input: DeadlineInput): CaseDeadline {
  const { applicationDate } = input;
  const extensionWeeks = input.extensionWeeks ?? 0;
  const completionDate = input.completionDate ?? null;
  const amendments = [...(input.amendmentDates ?? [])].filter((d) => d > applicationDate).sort();
  const amendmentDate = amendments[amendments.length - 1] ?? null;
  const suspensions = [...(input.suspensions ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  const ongoing = suspensions.find((s) => s.to === null) ?? null;
  const suspendedSince = ongoing?.from ?? null;

  // 99 § första stycket 4: the injunction must come within three weeks of the day in 1 or 2.
  const injunctions = [...(input.injunctionDates ?? [])].sort();
  const anchorOf = (injunction: string): string | null =>
    [applicationDate, ...amendments]
      .filter(
        (from) => from <= injunction && daysBetween(from, injunction) <= INJUNCTION_WINDOW_DAYS,
      )
      .pop() ?? null;
  const injunctionDate = injunctions.find((d) => anchorOf(d) !== null) ?? injunctions[0] ?? null;
  const anchor = injunctionDate === null ? null : anchorOf(injunctionDate);
  const injunctionInTime = injunctionDate === null ? null : anchor !== null;
  const anchorText =
    anchor === null || anchor === applicationDate
      ? `ansökningsdagen ${applicationDate}`
      : `ändringen av ansökan ${anchor}`;

  const extension =
    extensionWeeks > 0
      ? ` Fristen har förlängts med ${extensionWeeks} ${extensionWeeks === 1 ? 'vecka' : 'veckor'} (99 § andra stycket).`
      : '';
  const restingNow =
    suspendedSince === null
      ? ''
      : ` Ärendet är vilande sedan ${suspendedSince} (9 kap. 102 §), så fristen löper inte förrän vilandeförklaringen upphör.`;

  if (injunctionInTime === true && completionDate === null) {
    return {
      applicationDate,
      startDate: null,
      basis: 'vantar_pa_komplettering',
      amendmentDate,
      injunctionDate,
      injunctionInTime,
      extensionWeeks,
      suspendedSince,
      suspendedDays: 0,
      deadlineDate: null,
      explanation:
        `Föreläggandet om komplettering skickades ${injunctionDate}, inom tre veckor från ${anchorText}. ` +
        'Tioveckorsfristen börjar därför löpa först den dag bristen avhjälps (9 kap. 99 § första stycket 4).' +
        restingNow +
        extension,
    };
  }

  // The latest applicable start counts; on the same day the remedied deficiency wins.
  const fromCompletion =
    injunctionInTime === true &&
    completionDate !== null &&
    (amendmentDate === null || completionDate >= amendmentDate);
  const basis: DeadlineBasis = fromCompletion
    ? 'komplettering'
    : amendmentDate !== null
      ? 'andring_pa_sokandens_initiativ'
      : 'ansokningsdagen';
  const startDate =
    basis === 'komplettering'
      ? (completionDate ?? applicationDate)
      : basis === 'andring_pa_sokandens_initiativ'
        ? (amendmentDate ?? applicationDate)
        : applicationDate;

  // 102 §: days the case rested after the clock started are not counted.
  const resting = suspensions.flatMap((s) => {
    if (s.to === null) return [];
    const from = s.from > startDate ? s.from : startDate;
    const days = daysBetween(from, s.to);
    return days > 0 ? [{ from: s.from, to: s.to, days }] : [];
  });
  const suspendedDays = resting.reduce((sum, r) => sum + r.days, 0);
  const deadlineDate =
    ongoing === null
      ? addDays(startDate, DEADLINE_DAYS + extensionWeeks * 7 + suspendedDays)
      : null;
  const runsOut = deadlineDate === null ? '.' : ` och löper ut ${deadlineDate}.`;

  let explanation: string;
  if (basis === 'komplettering') {
    explanation =
      `Föreläggandet om komplettering skickades ${injunctionDate}, inom tre veckor från ${anchorText}. ` +
      `Tioveckorsfristen räknas därför från den dag bristen avhjälptes, ${completionDate} (9 kap. 99 § första stycket 4)${runsOut}`;
  } else if (basis === 'andring_pa_sokandens_initiativ') {
    explanation =
      `Ny tidsfrist: sökanden kom på eget initiativ in med en ändring av ansökan eller ytterligare underlag ${amendmentDate}. ` +
      `Tioveckorsfristen räknas från den dagen (9 kap. 99 § första stycket 2)${runsOut}`;
  } else if (injunctionInTime === false) {
    explanation =
      `Föreläggandet om komplettering skickades ${injunctionDate}, mer än tre veckor efter ansökningsdagen. ` +
      `Tioveckorsfristen räknas därför fortfarande från ansökningsdagen ${applicationDate} (9 kap. 99 § första stycket 1)${runsOut}`;
  } else {
    explanation = `Tioveckorsfristen räknas från ansökningsdagen ${applicationDate} (9 kap. 99 § första stycket 1)${runsOut}`;
  }
  if (suspendedDays > 0) {
    const periods = resting.map((r) => `${r.from}–${r.to}`).join(' och ');
    explanation +=
      ` Ärendet var vilande ${periods} (9 kap. 102 §). ${suspendedDays} ${suspendedDays === 1 ? 'dag' : 'dagar'} av den tiden ` +
      'räknas inte in i fristen, eftersom avgiften inte reduceras när fristen överskrids på grund av vilandebeslutet (12 kap. 8 a §).';
  }
  explanation += restingNow;
  if (basis === 'komplettering' || basis === 'andring_pa_sokandens_initiativ') {
    explanation += INFORM_APPLICANT;
  }
  return {
    applicationDate,
    startDate,
    basis,
    amendmentDate,
    injunctionDate,
    injunctionInTime,
    extensionWeeks,
    suspendedSince,
    suspendedDays,
    deadlineDate,
    explanation: explanation + extension,
  };
}

/** Kinds of injunction that ask the applicant to remedy deficiencies (9 kap. 91 §). */
export function isCompletionInjunction(injunction: Pick<Injunction, 'kind'>): boolean {
  return /komplett/.test(injunction.kind);
}

/** The 99 § deadline for a case state. */
export function caseDeadline(state: CaseState): CaseDeadline {
  return computeDeadline({
    applicationDate: state.applicationDate,
    injunctionDates: state.injunctions.filter(isCompletionInjunction).map((i) => i.date),
    completionDate: state.completionDate,
    amendmentDates: state.amendmentDates,
    extensionWeeks: state.extensionWeeks,
    suspensions: state.suspensions,
  });
}

/** Where the deadline stands on `onDate` (default: the simulated date). */
export function deadlineStatus(state: CaseState, onDate: string = state.simDate): DeadlineStatus {
  return statusOf(caseDeadline(state), onDate);
}

export function statusOf(deadline: CaseDeadline, onDate: string): DeadlineStatus {
  if (deadline.startDate === null || deadline.deadlineDate === null) {
    return { ...deadline, onDate, daysElapsed: null, daysLeft: null, weeksOverdue: 0 };
  }
  const daysLeft = daysBetween(onDate, deadline.deadlineDate);
  return {
    ...deadline,
    onDate,
    daysElapsed: daysBetween(deadline.startDate, onDate),
    daysLeft,
    weeksOverdue: daysLeft < 0 ? Math.ceil(-daysLeft / 7) : 0,
  };
}

/**
 * The fee for a decision on `decisionDate`, per amount in the case's `taxa`. Entries whose
 * key starts with `reduktion` are factors, every other entry is an amount in SEK.
 */
export function calculateFee(
  taxa: Readonly<Record<string, number>>,
  deadline: CaseDeadline,
  decisionDate: string,
): FeeCalculation {
  const status = statusOf(deadline, decisionDate);
  const reductionPerWeek = taxa['reduktion_per_vecka'] ?? DEFAULT_REDUCTION_PER_WEEK;
  const reduction = Math.min(1, status.weeksOverdue * reductionPerWeek);
  const lines: FeeLine[] = Object.entries(taxa)
    .filter(([key]) => !REDUCTION_KEY.test(key))
    .map(([key, baseAmount]) => ({
      key,
      baseAmount,
      expectedAmount: Math.round(baseAmount * (1 - reduction)),
    }));

  const explanation: string[] = lines.map(
    (line) => `Enligt taxan, ${taxaLabel(line.key)}: ${formatKronor(line.baseAmount)}.`,
  );
  if (status.deadlineDate === null && status.suspendedSince !== null) {
    explanation.push(
      `Ärendet är vilande sedan ${status.suspendedSince} (9 kap. 102 §), så tioveckorsfristen löper inte och avgiften reduceras inte (12 kap. 8 a §).`,
    );
  } else if (status.deadlineDate === null) {
    explanation.push(
      'Tioveckorsfristen har inte börjat löpa (komplettering väntas), så ingen reduktion.',
    );
  } else if (status.weeksOverdue === 0) {
    explanation.push(
      `Beslut ${decisionDate}, inom tidsfristen som löper ut ${status.deadlineDate} (9 kap. 99 §). Ingen reduktion.`,
    );
    if (status.suspendedDays > 0) {
      explanation.push(
        `Fristen är förskjuten med ${status.suspendedDays} ${status.suspendedDays === 1 ? 'dag' : 'dagar'} då ärendet var vilande (9 kap. 102 §, 12 kap. 8 a §).`,
      );
    }
  } else {
    const overdueDays = -(status.daysLeft ?? 0);
    if (status.suspendedDays > 0) {
      explanation.push(
        `Fristen är förskjuten med ${status.suspendedDays} ${status.suspendedDays === 1 ? 'dag' : 'dagar'} då ärendet var vilande (9 kap. 102 §, 12 kap. 8 a §).`,
      );
    }
    explanation.push(
      `Tidsfristen löpte ut ${status.deadlineDate} (9 kap. 99 §). Beslut ${decisionDate}, ${overdueDays} ${overdueDays === 1 ? 'dag' : 'dagar'} för sent = ${startedWeeks(status.weeksOverdue)}.`,
      `Reduktion ${status.weeksOverdue} × ${formatShare(reductionPerWeek)} = ${formatShare(reduction)} av avgiften (12 kap. 8 a §).`,
      ...lines.map(
        (line) =>
          `${formatKronor(line.baseAmount)} × (1 − ${formatShare(reduction)}) = ${formatKronor(line.expectedAmount)}.`,
      ),
    );
  }
  return {
    decisionDate,
    deadline: status,
    reductionPerWeek,
    weeksOverdue: status.weeksOverdue,
    reduction,
    lines,
    explanation,
  };
}

/** "bygglov_tillbyggnad_16_49kvm" → "bygglov tillbyggnad 16–49 kvm". */
function taxaLabel(key: string): string {
  return key
    .replace(/(\d+)_(\d+)/g, '$1–$2')
    .replace(/_/g, ' ')
    .replace(/(\d)(kvm|m2|m²)\b/g, '$1 $2');
}

/** "9 800 kr". */
export function formatKronor(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '−' : ''}${digits} kr`;
}

/** "1 påbörjad vecka", "2 påbörjade veckor". */
export function startedWeeks(weeks: number): string {
  return weeks === 1 ? '1 påbörjad vecka' : `${weeks} påbörjade veckor`;
}

function formatShare(share: number): string {
  return `${String(Math.round(share * 1000) / 10).replace('.', ',')} %`;
}
