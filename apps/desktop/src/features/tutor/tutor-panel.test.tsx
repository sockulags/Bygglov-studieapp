import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/query-client';
import { createMemoryDataStore, setDataStore, type DataStore } from '@/data';
import { AskTutorButton } from './ask-tutor-button';
import { buildQuestionContext } from './context';
import { MOCK_NOTICE, MockTransport } from './mock-transport';
import { TUTOR_SETTING_KEYS } from './settings';
import { questionSuggestions } from './suggestions';
import { multipleChoice } from './test-question';
import { setTutorTransport } from './transport';
import { resetTutorStore } from './tutor-store';

const answer = { type: 'flerval', selected: 0 } as const;
const context = buildQuestionContext(multipleChoice, answer);
const suggestions = questionSuggestions(multipleChoice, answer);

let store: DataStore;
let transport: MockTransport;

function renderButton() {
  const rootRoute = createRootRoute({
    component: () => <AskTutorButton context={context} suggestions={suggestions} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openPanel() {
  const user = userEvent.setup();
  renderButton();
  await user.click(await screen.findByRole('button', { name: 'Fråga handledaren' }));
  const panel = await screen.findByRole('dialog', { name: 'Fråga handledaren' });
  return { user, panel };
}

beforeEach(() => {
  // The router resets the scroll position on navigation; jsdom has no scrolling.
  window.scrollTo = () => {};
  store = createMemoryDataStore();
  setDataStore(store);
  transport = new MockTransport({ delayMs: 0 });
  setTutorTransport(transport);
  resetTutorStore();
  queryClient.clear();
});

afterEach(() => {
  setDataStore(null);
  setTutorTransport(null);
  resetTutorStore();
  queryClient.clear();
});

describe('TutorPanel with MockTransport', () => {
  it('streams an answer to a suggestion and shows its cost', async () => {
    const { user, panel } = await openPanel();
    expect(within(panel).getByText(`Fråga ${multipleChoice.id}`)).toBeInTheDocument();
    expect(within(panel).getByText(MOCK_NOTICE)).toBeInTheDocument();
    expect(within(panel).getByText(/kan gå igenom facit med dig/)).toBeInTheDocument();

    const group = within(panel).getByRole('group', { name: 'Förslag på frågor' });
    expect(
      within(group).getByRole('button', { name: 'Varför är alternativ 1 fel?' }),
    ).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Förklara djupare' }));

    expect(
      await within(panel).findByText(/inspelat svar som visar hur handledaren/),
    ).toBeInTheDocument();
    expect(await within(panel).findByText(/^Senaste svaret: ca /)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Kopiera svar' })).toBeInTheDocument();
    // Markdown is rendered: the law reference is bold.
    expect(within(panel).getByText('9 kap. 9 § PBL').tagName).toBe('STRONG');
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.messages.at(-1)?.content).toBe('Förklara djupare');
    await waitFor(async () => expect((await store.aiUsage.totals()).requests).toBe(1));
    expect(await within(panel).findByText(/^I dag (?!0,00)/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Ny konversation' }));
    expect(within(panel).queryByText(/inspelat svar/)).not.toBeInTheDocument();
  });

  it('sends a typed question with Enter', async () => {
    const { user, panel } = await openPanel();
    const input = within(panel).getByRole('textbox', { name: 'Din fråga till handledaren' });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'Gäller det även utanför plan?{Enter}');
    expect(await within(panel).findByText('Gäller det även utanför plan?')).toBeInTheDocument();
    await within(panel).findByRole('button', { name: 'Kopiera svar' });
    expect(transport.requests[0]?.messages.at(-1)?.content).toBe('Gäller det även utanför plan?');
    expect(input).toHaveValue('');
  });

  it('explains what to do when no key is stored', async () => {
    await transport.clearKey();
    const { panel } = await openPanel();
    expect(await within(panel).findByText('Handledaren behöver en nyckel')).toBeInTheDocument();
    const link = within(panel).getByRole('link', { name: 'Gå till Inställningar' });
    expect(link.getAttribute('href')).toBe('/settings#settings-assistant');
    expect(
      within(panel).queryByRole('group', { name: 'Förslag på frågor' }),
    ).not.toBeInTheDocument();
  });

  it('refuses new questions when the daily cap is reached', async () => {
    await store.settings.set(TUTOR_SETTING_KEYS.dailyCapSek, 1);
    await store.aiUsage.recordUsage({
      model: 'claude-opus-5-5',
      inputTokens: 1,
      outputTokens: 1,
      costSek: 1.5,
      contextKind: 'question',
    });
    const { panel } = await openPanel();
    expect(
      await within(panel).findByText(/Dagens kostnadstak på 1\skr är nått/),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('textbox', { name: 'Din fråga till handledaren' }),
    ).toBeDisabled();
    expect(
      within(panel).queryByRole('group', { name: 'Förslag på frågor' }),
    ).not.toBeInTheDocument();
    expect(transport.requests).toEqual([]);
  });

  it('does not let key presses reach the shortcuts of the view behind', async () => {
    const { user, panel } = await openPanel();
    let reached = 0;
    const listener = () => (reached += 1);
    window.addEventListener('keydown', listener);
    try {
      await user.type(within(panel).getByRole('textbox'), '1');
      act(() => within(panel).getByRole('button', { name: 'Stäng' }).focus());
      await user.keyboard('2');
    } finally {
      window.removeEventListener('keydown', listener);
    }
    expect(reached).toBe(0);
  });
});
