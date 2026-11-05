import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { answersPerBucket, casesPerStatus, windowDays, type MasterySeries } from './aggregate';
import { AnswersChart } from './answers-chart';
import { CaseStatusChart, DecisionChecksChart } from './case-charts';
import { MasteryChart } from './mastery-chart';
import { TagsChart } from './tags-chart';

const NOW = new Date(2026, 10, 5, 15, 0, 0);
const days = windowDays('4v', NOW, null);

function series(moduleId: string, title: string, slot: number, end: number): MasterySeries {
  return {
    moduleId,
    title,
    slot,
    points: days.map((day, i) => ({ day, mastery: Math.round((end * i) / (days.length - 1)) })),
  };
}

describe('MasteryChart', () => {
  it('draws one line per module with a legend, end labels and a table view', async () => {
    const user = userEvent.setup();
    render(
      <MasteryChart
        days={days}
        series={[
          series('03-lovplikt', 'Lovplikt', 0, 60),
          series('06-handlaggning', 'Handläggning', 1, 20),
        ]}
        hiddenModules={0}
      />,
    );
    const card = screen.getByRole('group', { name: 'Behärskning per modul över tid' });
    expect(card.querySelectorAll('path[data-mark="line"]')).toHaveLength(2);
    expect(within(card).getByText('Lovplikt 60 %')).toBeInTheDocument();
    expect(within(card).getByText('Handläggning 20 %')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem')).toHaveLength(2); // legend

    await user.click(within(card).getByRole('button', { name: 'Visa tabell' }));
    const table = within(card).getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Lovplikt' })).toBeInTheDocument();
    // One row per week: 28 days → 4 rows, newest first.
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('60 %');
    await user.click(within(card).getByRole('button', { name: 'Visa diagram' }));
    expect(within(card).queryByRole('table')).not.toBeInTheDocument();
  });

  it('reads out a day with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <MasteryChart
        days={days}
        series={[series('03-lovplikt', 'Lovplikt', 0, 60)]}
        hiddenModules={0}
      />,
    );
    const chart = screen.getByRole('img', { name: /Linjediagram/ });
    chart.focus();
    await user.keyboard('{End}');
    expect(screen.getByText(/Lovplikt 60 %$/, { selector: '[aria-live]' })).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByText(/Lovplikt 0 %$/, { selector: '[aria-live]' })).toBeInTheDocument();
  });

  it('explains what will show when nothing is studied', () => {
    render(<MasteryChart days={days} series={[]} hiddenModules={0} />);
    expect(screen.getByText(/När du svarat på frågor/)).toBeInTheDocument();
  });
});

describe('AnswersChart', () => {
  it('stacks right and wrong and lists the days with answers in the table', async () => {
    const user = userEvent.setup();
    const answers = [
      { correct: true, at: new Date(2026, 10, 5, 9) },
      { correct: false, at: new Date(2026, 10, 5, 10) },
      { correct: true, at: new Date(2026, 10, 3, 9) },
    ].map((a, i) => ({
      id: i + 1,
      questionId: 'a',
      moduleId: '03-lovplikt',
      answeredAt: a.at.toISOString(),
      correct: a.correct,
      score: null,
      answer: null,
      responseTimeMs: null,
      mode: 'quick-quiz' as const,
      sessionId: null,
    }));
    const { buckets, unit } = answersPerBucket(answers, days);
    render(<AnswersChart buckets={buckets} unit={unit} />);
    const card = screen.getByRole('group', { name: 'Svar per dag' });
    expect(
      within(card).getByText('3 svar i perioden. Delvis rätt räknas som fel.'),
    ).toBeInTheDocument();
    expect(card.querySelectorAll('path[data-mark="bar"]')).toHaveLength(3);
    await user.click(within(card).getByRole('button', { name: 'Visa tabell' }));
    const rows = within(card).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/5 nov.*1.*1.*2/);
  });

  it('says so when the period has no answers', () => {
    const { buckets, unit } = answersPerBucket([], days);
    render(<AnswersChart buckets={buckets} unit={unit} />);
    expect(screen.getByText('Inga svar i den valda perioden.')).toBeInTheDocument();
  });
});

describe('TagsChart', () => {
  it('labels every bar with its share and number of questions', () => {
    render(
      <TagsChart
        hasAnswers
        tags={[{ tag: 'liten_avvikelse', answered: 4, correct: 1, accuracy: 0.25 }]}
      />,
    );
    expect(screen.getByText('liten avvikelse: 25 % rätt av 4 frågor')).toBeInTheDocument();
  });

  it('has an encouraging empty state', () => {
    render(<TagsChart hasAnswers tags={[]} />);
    expect(screen.getByText(/Inga tydligt svaga ämnen/)).toBeInTheDocument();
  });
});

describe('case charts', () => {
  it('shows cases per status as one bar and a meter per decision', () => {
    render(
      <>
        <CaseStatusChart counts={casesPerStatus(['pagar', 'inlamnat', 'bedomt'])} />
        <DecisionChecksChart
          now={NOW}
          rows={[
            {
              key: 'A001:0',
              caseId: 'A001',
              title: 'A001 Komplementbyggnad',
              submittedAt: new Date(2026, 9, 1).toISOString(),
              decisionDate: '2026-03-01',
              passed: 7,
              total: 9,
            },
          ]}
        />
      </>,
    );
    expect(
      screen.getByRole('img', { name: 'Ärenden per status: Ny 0, Pågår 1, Inlämnat 1, Bedömt 1.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('meter', { name: 'A001 Komplementbyggnad: 7 av 9 kontroller godkända' }),
    ).toBeInTheDocument();
  });

  it('has empty states', () => {
    render(
      <>
        <CaseStatusChart counts={casesPerStatus([])} />
        <DecisionChecksChart now={NOW} rows={[]} />
      </>,
    );
    expect(screen.getByText('Det finns inga ärenden i appen än.')).toBeInTheDocument();
    expect(screen.getByText('Inga inlämnade beslut i perioden.')).toBeInTheDocument();
  });
});
