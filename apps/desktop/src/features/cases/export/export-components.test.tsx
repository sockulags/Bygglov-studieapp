import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCaseFile, type CaseFile } from '@bygglov/content-schema';
import type * as ContentModule from '@/content';
import { createMemoryDataStore, setDataStore, type DataStore } from '@/data';
import { ExportDecisionButton } from './export-decision-button';
import { SupervisorFeedbackPanel } from './supervisor-feedback-panel';

const parsed = parseCaseFile({
  id: 'A099',
  titel: 'Förråd på Testgården 1',
  niva: 1,
  fastighet: 'Testgården 1, Fiktiva kommun',
  sammanfattning: 'Ett litet testärende.',
  startdatum: '2026-04-01',
  larandemal: ['Pröva ett förråd'],
  taxa: { bygglov: 5000 },
  handlingar: [{ id: 'H1', typ: 'ansokan', titel: 'Ansökan', fil: 'handlingar/ansokan.md' }],
  steg: [
    {
      id: 'S1',
      typ: 'beslut',
      rubrik: 'Fatta beslut',
      forvantat_beslut: 'bevilja',
      bedomningspunkter: ['Beslutet har lagstöd'],
    },
  ],
});
if (!parsed.success) throw new Error('test case does not parse');
const testCase: CaseFile = parsed.data;

vi.mock('@/content', async (importOriginal) => {
  const actual = await importOriginal<typeof ContentModule>();
  return {
    ...actual,
    loadContent: () => ({
      modules: [],
      questionsByModule: new Map(),
      cases: [testCase],
      index: null,
    }),
  };
});

let store: DataStore;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  store = createMemoryDataStore();
  setDataStore(store);
});

afterEach(() => {
  setDataStore(null);
  vi.restoreAllMocks();
});

async function seedDecision() {
  await store.cases.startCase({ caseId: 'A099', currentStepId: null, simDate: '2026-04-10' });
  return store.cases.submitDecision({
    caseId: 'A099',
    decision: {
      utfall: 'bevilja',
      lagstod: ['PBL 9 kap. 30 §'],
      motivering: 'Förenligt med planen.',
      villkor_upplysningar: '',
      avgift: 5000,
      overklagandehanvisning: true,
      expediering: [{ mottagare: 'Sökanden', satt: 'delges' }],
    },
  });
}

describe('ExportDecisionButton', () => {
  it('copies the report as text and marks the decision exported', async () => {
    const decision = await seedDecision();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    // user-event installs its own clipboard stub on navigator.
    const user = userEvent.setup();
    const onExported = vi.fn();

    render(
      <ExportDecisionButton caseId="A099" decisionId={decision.id} onExported={onExported} />,
      {
        wrapper,
      },
    );
    await user.click(screen.getByRole('button', { name: 'Exportera till handledare' }));
    const dialog = await screen.findByRole('dialog');
    const notes = within(dialog).getByLabelText(/Anteckningar och reflektioner/);
    await waitFor(() => expect(notes).toBeEnabled());
    await user.type(notes, 'Osäker på avgiften.');
    await user.click(within(dialog).getByRole('button', { name: 'Kopiera som text' }));

    await waitFor(() => expect(onExported).toHaveBeenCalledWith('text'));
    const text = await navigator.clipboard.readText();
    expect(text).toContain('# Beslutsrapport: Förråd på Testgården 1');
    expect(text).toContain('> Osäker på avgiften.');
    expect(within(dialog).getByText(/Rapporten är kopierad/)).toBeInTheDocument();
    expect((await store.cases.getDecision(decision.id))?.exportedAt).not.toBeNull();
    expect(await store.settings.get('beslutsrapport.anteckningar.' + decision.id)).toBe(
      'Osäker på avgiften.',
    );
  });

  it('prints the HTML report from a hidden frame', async () => {
    const decision = await seedDecision();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const print = vi.fn();
    const append = HTMLElement.prototype.append;
    vi.spyOn(HTMLElement.prototype, 'append').mockImplementation(function (
      this: HTMLElement,
      ...nodes: (Node | string)[]
    ) {
      append.apply(this, nodes);
      for (const node of nodes) {
        if (node instanceof HTMLIFrameElement) {
          Object.defineProperty(node, 'contentWindow', {
            value: { print, focus: vi.fn(), addEventListener: vi.fn() },
          });
        }
      }
    });
    const user = userEvent.setup();
    render(<ExportDecisionButton caseId="A099" decisionId={decision.id} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Exportera till handledare' }));
    const dialog = await screen.findByRole('dialog');
    const pdf = within(dialog).getByRole('button', { name: 'Spara som PDF' });
    await waitFor(() => expect(pdf).toBeEnabled());
    await user.click(pdf);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const frame = document.querySelector('iframe');
    expect(frame?.srcdoc).toContain('Handledarens bedömning');
    await waitFor(async () =>
      expect((await store.cases.getDecision(decision.id))?.exportedAt).not.toBeNull(),
    );
  });
});

describe('SupervisorFeedbackPanel', () => {
  it('registers a grade and a comment', async () => {
    const decision = await seedDecision();
    const user = userEvent.setup();
    render(<SupervisorFeedbackPanel decisionId={decision.id} />, { wrapper });

    expect(await screen.findByText(/Ingen bedömning registrerad än/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrera handledarens bedömning' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Spara bedömningen' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Välj ett betyg.');

    await user.click(within(dialog).getByLabelText('Komplettera'));
    await user.type(within(dialog).getByLabelText('Kommentar'), 'Delge grannen också.');
    await user.click(within(dialog).getByRole('button', { name: 'Spara bedömningen' }));

    expect(await screen.findByText('Delge grannen också.')).toBeInTheDocument();
    expect(screen.getByText('Komplettera')).toBeInTheDocument();
    expect(await store.cases.listSupervisorFeedback(decision.id)).toMatchObject([
      { grade: 'Komplettera', text: 'Delge grannen också.' },
    ]);
  });
});
