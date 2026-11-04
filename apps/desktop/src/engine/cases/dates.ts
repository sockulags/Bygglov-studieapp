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
