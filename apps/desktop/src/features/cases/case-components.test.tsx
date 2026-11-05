import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  parseCaseFile,
  type CaseFile,
  type ChecklistStep as ChecklistContent,
} from '@bygglov/content-schema';
import {
  emptyDecisionDraft,
  startCase,
  stepFeedback,
  submitStep,
  type DecisionDraft,
  type StepAnswer,
} from '@/engine';
import { createMemoryDataStore, setDataStore } from '@/data';
import { extensionAvailability } from './case-model';
import { flushCaseWrites, startNewCase, useCaseStore } from './case-store';
import { DecisionForm } from './decision/decision-form';
import { ExtendDeadlineDialog } from './extend-deadline-dialog';
import { ChecklistStep } from './steps/checklist-step';

function testCase(): CaseFile {
  const result = parseCaseFile({
    id: 'A901',
    titel: 'Tillbyggnad av enbostadshus',
    niva: 2,
    status: 'utkast',
    rattslage: '2025-12-01',
    fastighet: 'Eken 3, Testby kommun',
    sammanfattning: 'Ett testärende.',
    startdatum: '2026-03-02',
    larandemal: ['Testa'],
    taxa: { bygglov_tillbyggnad_16_49kvm: 9800 },
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
        typ: 'checklista',
        rubrik: 'Är ansökan komplett?',
        poster: [
          { text: 'Situationsplan', finns: true },
          { text: 'Sektionsritning', finns: false, kommentar: 'Behövs för att se höjden' },
          { text: 'Kontrollplan', finns: false },
        ],
      },
      {
        id: 'S2',
        typ: 'beslut',
        rubrik: 'Fatta beslut',
        forvantat_beslut: 'bevilja',
        bedomningspunkter: ['Rätt'],
        lagrum: ['PBL 9 kap. 56 §'],
      },
    ],
  });
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

const caseFile = testCase();
const checklist = caseFile.steg[0] as ChecklistContent;

describe('ChecklistStep', () => {
  it('submits only when every post is marked, with digits toggling posts', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(answer: StepAnswer) => void>();
    render(<ChecklistStep step={checklist} answer={null} feedback={null} onSubmit={onSubmit} />);

    const submit = screen.getByRole('button', { name: /Lämna in/ });
    expect(submit).toBeDisabled();
    expect(screen.getByText('0 av 3 markerade')).toBeInTheDocument();

    const situation = screen.getByRole('radiogroup', { name: '1. Situationsplan' });
    await user.click(within(situation).getByRole('radio', { name: 'Finns' }));
    expect(within(situation).getByRole('radio', { name: 'Finns' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // "2" marks post 2 as finns, a second "2" switches it to saknas.
    await user.keyboard('2');
    await user.keyboard('2');
    await user.click(
      within(screen.getByRole('radiogroup', { name: '3. Kontrollplan' })).getByRole('radio', {
        name: 'Finns',
      }),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'checklista', marks: [true, false, true] });
  });

  it('shows right and wrong per post, with the comment, after submission', () => {
    const state = startCase(caseFile, { seed: 1 });
    const answer = { type: 'checklista', marks: [true, true, false] } as const;
    const next = submitStep(caseFile, state, 'S1', answer).state;
    render(
      <ChecklistStep
        step={checklist}
        answer={answer}
        feedback={stepFeedback(caseFile, next, 'S1')}
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Lämna in/ })).not.toBeInTheDocument();
    const section = screen.getByRole('radiogroup', { name: '2. Sektionsritning' }).parentElement;
    expect(section).toHaveTextContent('Fel: saknas.');
    expect(section).toHaveTextContent('Behövs för att se höjden');
    expect(screen.getAllByText(/^Rätt: /)).toHaveLength(2);
  });
});

describe('DecisionForm', () => {
  /** Renders the form as a controlled component, the way DecisionScreen uses it. */
  function renderForm(onSubmit: (draft: DecisionDraft) => void) {
    let draft: DecisionDraft = {
      ...emptyDecisionDraft(),
      lagstod: ['PBL 9 kap. 56 §'],
      motivering: 'Åtgärden uppfyller kraven.',
      avgift: 9800,
      expediering: [{ mottagare: 'Sökanden', satt: 'delges' }],
    };
    const props = () => ({
      caseFile,
      draft,
      diaryNumber: 'BN 2026-1',
      onSubmit,
      onChange: (next: DecisionDraft) => {
        draft = next;
        view.rerender(<DecisionForm {...props()} />);
      },
    });
    const view = render(<DecisionForm {...props()} />);
    return view;
  }

  it('stops a decision without appeal notice, and the checkbox writes the standard text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: DecisionDraft) => void>();
    renderForm(onSubmit);

    await user.click(screen.getByRole('button', { name: 'Lämna in beslutet' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Överklagandehänvisning saknas');
    expect(alert).not.toHaveTextContent('Motivering saknas');

    const checkbox = screen.getByRole('checkbox', { name: /Överklagandehänvisning/ });
    expect(checkbox).toHaveAccessibleDescription(/Överklagandehänvisning saknas/);
    await user.click(checkbox);
    // The issue list updates while it is shown, and the standard text appears.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const standard = screen.getByLabelText('Standardtext om överklagande');
    expect(standard).toHaveTextContent(
      'Beslutet kan överklagas till länsstyrelsen (13 kap. 3 § PBL)',
    );
    expect(standard).toHaveTextContent('diarienummer BN 2026-1');

    await user.click(screen.getByRole('button', { name: 'Lämna in beslutet' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ overklagandehanvisning: true });
  });

  it('lets her submit anyway after seeing what is missing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: DecisionDraft) => void>();
    renderForm(onSubmit);
    await user.click(screen.getByRole('button', { name: 'Lämna in beslutet' }));
    await user.click(screen.getByRole('button', { name: 'Lämna in ändå' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ overklagandehanvisning: false }),
    );
  });

  it('fills in the fee from the taxa and adds free-text law references', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(draft: DecisionDraft) => void>();
    render(
      <DecisionForm
        caseFile={caseFile}
        draft={emptyDecisionDraft()}
        onChange={onChange}
        onSubmit={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Taxan: Bygglov tillbyggnad 16–49 kvm/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ avgift: 9800 }));
    const free = screen.getByPlaceholderText(/Annat lagrum/);
    await user.type(free, 'PBL 9 kap. 60 §');
    fireEvent.keyDown(free, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lagstod: ['PBL 9 kap. 60 §'] }),
    );
  });
});

describe('ExtendDeadlineDialog', () => {
  it('extends the deadline with weeks and a reason that reach the diary', async () => {
    setDataStore(createMemoryDataStore());
    const c = testCase();
    const { state } = startNewCase(c, { seed: 1 });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ExtendDeadlineDialog
        caseFile={c}
        state={state}
        availability={extensionAvailability(state)}
        open
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Förläng tidsfristen' });
    // Without a reason nothing happens and the field says why.
    await user.click(within(dialog).getByRole('button', { name: 'Förläng fristen' }));
    expect(within(dialog).getByLabelText('Skäl till förlängningen')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const weeks = within(dialog).getByLabelText(/Antal veckor/);
    await user.clear(weeks);
    await user.type(weeks, '3');
    expect(within(dialog).getByText('Ny sista dag för beslut: 2026-06-01.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Skäl till förlängningen'), 'Remissvar saknas');
    await user.click(within(dialog).getByRole('button', { name: 'Förläng fristen' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const next = useCaseStore.getState().active?.state;
    expect(next?.extensionWeeks).toBe(3);
    expect(next?.diary.at(-2)?.text).toContain('Skäl: Remissvar saknas.');
    await flushCaseWrites();
  });

  it('explains why the deadline cannot be extended', () => {
    const c = testCase();
    const state = startCase(c, { seed: 1 });
    render(
      <ExtendDeadlineDialog
        caseFile={c}
        state={state}
        availability={{ allowed: false, reason: 'Fristen är redan förlängd.' }}
        open
        onOpenChange={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Fristen kan inte förlängas' });
    expect(within(dialog).getByText('Fristen är redan förlängd.')).toBeInTheDocument();
  });
});
