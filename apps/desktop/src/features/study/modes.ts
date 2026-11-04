import type { StudyMode } from '@/data';

/** The study modes the Plugga view offers (docs/02 → Studielägen). */
export type PracticeMode = Extract<
  StudyMode,
  'quick-quiz' | 'module-review' | 'review' | 'study' | 'exam'
>;

export interface ModeInfo {
  id: PracticeMode;
  label: string;
  /** Short noun phrase used in titles, e.g. "Snabbquiz · Lovplikt". */
  short: string;
  description: string;
}

/** Number of questions and minutes in Tentaläge. */
export const EXAM_QUESTION_COUNT = 20;
export const EXAM_MINUTES = 30;

export const MODES: readonly ModeInfo[] = [
  {
    id: 'quick-quiz',
    label: 'Snabbquiz',
    short: 'Snabbquiz',
    description:
      'Tio slumpade frågor ur modulen, med förklaring och lagrum efter varje svar. Välj en modul nedan eller blanda alla.',
  },
  {
    id: 'module-review',
    label: 'Modulgenomgång',
    short: 'Modulgenomgång',
    description:
      'Alla frågor i modulen i pedagogisk ordning, även de öppna. Ta god tid på dig och läs förklaringarna.',
  },
  {
    id: 'review',
    label: 'Repetition',
    short: 'Repetition',
    description:
      'Frågor som är på väg att glömmas, enligt repetitionsschemat. Du får dem igen precis innan du tappar dem.',
  },
  {
    id: 'study',
    label: 'Instudering',
    short: 'Instudering',
    description:
      'Öppna frågor där du formulerar svaret själv, jämför med facit och bockar av vad du fick med.',
  },
  {
    id: 'exam',
    label: 'Tenta',
    short: 'Tenta',
    description: `${EXAM_QUESTION_COUNT} blandade frågor på ${EXAM_MINUTES} minuter. Ingen förklaring under tiden, resultatet visas i slutet.`,
  },
];

const byId = new Map(MODES.map((mode) => [mode.id, mode]));

export function modeInfo(mode: PracticeMode): ModeInfo {
  const info = byId.get(mode);
  if (!info) throw new Error(`Okänt studieläge: ${mode}`);
  return info;
}

export function isPracticeMode(value: unknown): value is PracticeMode {
  return typeof value === 'string' && byId.has(value as PracticeMode);
}

/** Swedish label for any stored study mode (also 'case'). */
export function studyModeLabel(mode: StudyMode): string {
  if (mode === 'case') return 'Ärende';
  return modeInfo(mode).label;
}
