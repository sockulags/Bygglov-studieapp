import type { SessionItem } from '@/engine';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="grid gap-x-3 sm:grid-cols-[7rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-brick' : 'text-ink'}>
        {value}
      </dd>
    </div>
  );
}

/** "Ditt svar / Rätt svar" for one answered question in the summary. */
export function AnswerRecap({ item }: { item: SessionItem }) {
  const { question, response } = item;
  if (!response) return null;
  const { answer, result } = response;
  const rows: { label: string; value: string; tone?: 'ok' | 'bad' }[] = [];

  if (question.typ === 'flerval' && answer.type === 'flerval') {
    const chosen = answer.selected === null ? null : question.alternativ[answer.selected];
    const right = question.alternativ.find((a) => a.ratt);
    rows.push({
      label: 'Ditt svar',
      value: chosen?.text ?? 'Inget svar',
      tone: chosen?.ratt ? 'ok' : 'bad',
    });
    if (!chosen?.ratt && right) rows.push({ label: 'Rätt svar', value: right.text });
  } else if (question.typ === 'flersvar' && answer.type === 'flersvar') {
    const chosen = question.alternativ.filter((_, i) => answer.selected.includes(i));
    rows.push({
      label: 'Du valde',
      value: chosen.length ? chosen.map((a) => a.text).join(' · ') : 'Inget',
    });
    rows.push({
      label: 'Rätt svar',
      value: question.alternativ
        .filter((a) => a.ratt)
        .map((a) => a.text)
        .join(' · '),
    });
  } else if (result.kind === 'graded' && !result.selfAssessed) {
    const partName =
      question.typ === 'lucktext'
        ? 'Lucka'
        : question.typ === 'ordning'
          ? 'Plats'
          : question.typ === 'para_ihop'
            ? 'Par'
            : null;
    for (const part of result.items) {
      const many = result.items.length > 1 && partName !== null;
      rows.push({
        label: many ? `${partName} ${part.index + 1}` : 'Ditt svar',
        value: part.given ?? 'Inget svar',
        tone: part.correct ? 'ok' : 'bad',
      });
      if (!part.correct) rows.push({ label: 'Rätt svar', value: part.expected });
    }
  }

  if (rows.length === 0) return null;
  return (
    <dl className="mb-4 flex flex-col gap-2 rounded-md bg-bg px-4 py-3 text-[0.9375rem]">
      {rows.map((row, i) => (
        <Row key={i} {...row} />
      ))}
    </dl>
  );
}
