import { localDateKey } from '@/features/progress/progress';

const time = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "i dag 14:05", "i går 09:12", "3 nov." or "3 nov. 2025" for another year. */
export function formatWhen(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = localDateKey(date);
  if (key === localDateKey(now)) return `i dag ${time.format(date)}`;
  if (key === localDateKey(yesterday)) return `i går ${time.format(date)}`;
  return date.getFullYear() === now.getFullYear()
    ? dayMonth.format(date)
    : dayMonthYear.format(date);
}

/** "i dag", "i morgon" or a date, for the next repetition. */
export function formatDueDay(date: Date, now: Date = new Date()): string {
  if (date.getTime() <= now.getTime()) return 'nu';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = localDateKey(date);
  if (key === localDateKey(now)) return `i dag ${time.format(date)}`;
  if (key === localDateKey(tomorrow)) return 'i morgon';
  return dayMonth.format(date);
}

/** "4 min", "1 min 20 s", "35 s". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  if (minutes >= 10 || rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

/** "12:05" countdown for the exam timer. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** "1 fråga", "3 frågor". */
export function pluralQuestions(count: number): string {
  return `${count} ${count === 1 ? 'fråga' : 'frågor'}`;
}
