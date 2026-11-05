import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleContent } from '@/content';
import { createMemoryDataStore, setDataStore, type DataStore } from '@/data';
import { multipleChoice, open, q, trueFalse } from '@/engine/fixtures';
import { readStoredResult } from './session-result';
import { QuizView } from './quiz-view';
import {
  clearStudyRun,
  flushStudyWrites,
  goToNextQuestion,
  startStudyRun,
  submitAnswer,
  submitSelfAssessment,
  useStudyStore,
} from './study-store';

const uncertain = q({
  id: 'uncertain',
  typ: 'sant_falskt',
  fraga: 'Osäkert lagrum?',
  svar: true,
  lagrum_osaker: true,
});

const content = assembleContent({
  'moduler.json': {
    moduler: [
      {
        id: '03-lovplikt',
        ordning: 3,
        titel: 'Lovplikt',
        beskrivning: 'Om lov.',
        lagrum_sammanfattning: 'PBL 9 kap.',
      },
    ],
  },
  'fragor/03-lovplikt.json': {
    modul: '03-lovplikt',
    fragor: [multipleChoice, trueFalse, open, uncertain],
  },
});

let store: DataStore;

beforeEach(() => {
  store = createMemoryDataStore();
  setDataStore(store);
  clearStudyRun();
});

afterEach(() => {
  setDataStore(null);
  clearStudyRun();
});

function currentQuestionId(): string | undefined {
  const run = useStudyStore.getState().run;
  return run?.session.items[run.session.index]?.question.id;
}

describe('study store', () => {
  it('stores every answer, updates FSRS and saves the summary', async () => {
    await startStudyRun({ mode: 'module-review', moduleId: '03-lovplikt' }, content);
    const run = useStudyStore.getState().run;
    expect(run?.title).toBe('Modulgenomgång · Lovplikt');
    expect(run?.session.items.map((i) => i.question.id)).toEqual(['mc', 'tf', 'op', 'uncertain']);

    submitAnswer({ type: 'flerval', selected: 1 }, 5000);
    goToNextQuestion();
    submitAnswer({ type: 'sant_falskt', value: true }, 3000);
    goToNextQuestion();
    submitAnswer({ type: 'oppen', text: 'Mitt svar' }, 60_000);
    submitSelfAssessment([0]);
    goToNextQuestion();
    goToNextQuestion(); // skip the last one
    await flushStudyWrites();

    const answers = await store.answers.listAnswers();
    expect(answers.map((a) => [a.questionId, a.correct, a.mode])).toEqual([
      ['mc', true, 'module-review'],
      ['tf', false, 'module-review'],
      ['op', false, 'module-review'],
    ]);
    const states = await store.reviews.listReviewStates();
    expect(states.map((s) => s.questionId).sort()).toEqual(['mc', 'op', 'tf']);
    expect(states.every((s) => s.reps === 1)).toBe(true);

    const [session] = await store.sessions.listRecent();
    expect(session?.finishedAt).not.toBeNull();
    const result = readStoredResult(session?.result);
    expect(result).toMatchObject({ total: 4, correct: 1, skipped: 1 });
    expect(answers.every((a) => a.sessionId === session?.id)).toBe(true);

    expect(useStudyStore.getState().run?.session.status).toBe('finished');
  });

  it('starts repetition from due questions and practice from mistakes', async () => {
    await expect(startStudyRun({ mode: 'review', moduleIds: [] }, content)).rejects.toThrow(
      /Inga frågor väntar/,
    );
    await startStudyRun({ mode: 'quick-quiz', moduleIds: ['03-lovplikt'] }, content);
    // Quick quiz skips open questions.
    expect(useStudyStore.getState().run?.session.items).toHaveLength(3);
    await startStudyRun({ mode: 'practice', questionIds: ['tf'], moduleIds: [] }, content);
    expect(useStudyStore.getState().run?.title).toBe('Öva på felen');
    expect(currentQuestionId()).toBe('tf');
    await expect(
      startStudyRun({ mode: 'study', moduleId: '03-lovplikt' }, content),
    ).resolves.toMatchObject({ mode: 'study' });
    expect(useStudyStore.getState().run?.session.items.map((i) => i.question.id)).toEqual(['op']);
  });
});

function Harness() {
  const run = useStudyStore((s) => s.run);
  return run ? <QuizView run={run} /> : null;
}

describe('QuizView', () => {
  it('answers with the keyboard and shows the explanation with draft marker', async () => {
    const user = userEvent.setup();
    await startStudyRun({ mode: 'module-review', moduleId: '03-lovplikt' }, content);
    render(
      <TooltipPrimitive.Provider>
        <Harness />
      </TooltipPrimitive.Provider>,
    );
    expect(screen.getByText('Fråga 1 av 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vilken?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fråga handledaren' })).not.toBeInTheDocument();

    await user.keyboard('2');
    expect(await screen.findByRole('heading', { name: 'Rätt' })).toBeInTheDocument();
    expect(screen.getByText('Förklaring.')).toBeInTheDocument();
    expect(screen.getByText('B är rätt.')).toBeInTheDocument();
    expect(screen.getByText('Utkast, ej granskad av handledare')).toBeInTheDocument();
    expect(screen.getByText('Rättsläge 2025-12-01')).toBeInTheDocument();
    expect(screen.getByText('PBL 9 kap. 4 §')).toBeInTheDocument();
    // The tutor is offered once the question is answered.
    expect(screen.getByRole('button', { name: 'Fråga handledaren' })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByText('Fråga 2 av 4')).toBeInTheDocument();
    await user.keyboard('s');
    expect(await screen.findByRole('heading', { name: 'Inte rätt' })).toBeInTheDocument();

    // Jump to the question with an uncertain law reference.
    act(() => {
      goToNextQuestion();
      goToNextQuestion();
    });
    await user.click(screen.getByRole('button', { name: /Sant/ }));
    expect(
      screen.getByRole('img', { name: /Kontrollera paragrafen i Lagtextens byggregler/ }),
    ).toBeInTheDocument();
    await flushStudyWrites();
  });
});
