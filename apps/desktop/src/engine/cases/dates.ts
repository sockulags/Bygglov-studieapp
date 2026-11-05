/**
 * Calendar helpers for the simulated case calendar. Dates are plain `YYYY-MM-DD` strings
 * and all arithmetic is done in UTC, so daylight saving time never shifts a day.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A real calendar date as `YYYY-MM-DD` (rejects e.g. 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function toUtc(date: string): number {
  if (!isIsoDate(date)) throw new RangeError(`Ogiltigt datum: "${date}" (ska vara ÅÅÅÅ-MM-DD).`);
  return Date.parse(`${date}T00:00:00Z`);
}

/** `date` plus `days` calendar days (negative to go back). */
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days))
    throw new RangeError(`Antal dagar ska vara ett heltal, inte ${days}.`);
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** The later of two dates. */
export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

/** Swedish long form, e.g. "2 mars 2026". */
export function formatSwedishDate(date: string): string {
  const d = new Date(toUtc(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`;
}

/* ------------------------------------------------------------------ working days */

/** Easter Sunday (Gregorian computus) as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Day of the week, 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** The weekday (0–6) on or after `from` within `days` days. */
function firstWeekdayFrom(from: string, day: number): string {
  let date = from;
  while (weekday(date) !== day) date = addDays(date, 1);
  return date;
}

/**
 * Days that are not weekdays for a time limit under 2 § lagen (1930:173) om beräkning av
 * lagstadgad tid: Saturdays, Sundays, other public holidays (allmänna helgdagar),
 * midsommarafton, julafton and nyårsafton.
 */
export function isNonWorkingDay(date: string): boolean {
  const day = weekday(date);
  if (day === 0 || day === 6) return true;
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  const fixed = ['01-01', '01-06', '05-01', '06-06', '12-24', '12-25', '12-26', '12-31'];
  if (fixed.includes(md)) return true;
  const easter = easterSunday(year);
  const movable = [
    addDays(easter, -2), // långfredagen
    addDays(easter, 1), // annandag påsk
    addDays(easter, 39), // Kristi himmelsfärdsdag
    addDays(firstWeekdayFrom(`${year}-06-20`, 6), -1), // midsommarafton (Friday)
  ];
  return movable.includes(date);
}

/** `date` itself if it is a weekday for a time limit, otherwise the next such day. */
export function nextWorkingDay(date: string): string {
  let result = date;
  while (isNonWorkingDay(result)) result = addDays(result, 1);
  return result;
}
