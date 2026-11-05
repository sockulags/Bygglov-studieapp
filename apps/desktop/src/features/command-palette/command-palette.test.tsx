import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ContentModule from '@/content';
import { useKeydown } from '@/lib/use-keydown';
import { useUiStore } from '@/store/ui';
import { CommandPalette } from './command-palette';
import { usePaletteStore } from './palette-store';
import { ShortcutsHelpDialog } from './shortcuts-help-dialog';
import { useGlobalShortcuts } from './use-global-shortcuts';

vi.mock('@/content', async (importOriginal) => {
  const original = await importOriginal<typeof ContentModule>();
  const { sampleSources: sources, sampleLookup: lookup } = await import('./test-fixtures');
  const s = sources();
  return {
    ...original,
    loadContent: () => ({
      modules: s.modules,
      questionsByModule: new Map(
        [...s.questionCounts].map(([id, n]) => [id, Array.from({ length: n })]),
      ),
      cases: s.cases,
      index: {},
    }),
    loadLookup: () => lookup,
  };
});

function Layout() {
  useGlobalShortcuts();
  return (
    <>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <CommandPalette />
      <ShortcutsHelpDialog />
    </>
  );
}

/** A view with its own "?" help, like the quiz. */
function QuizLike() {
  useKeydown((event) => {
    if (event.key === '?') event.preventDefault();
  });
  return <h1>Quiz</h1>;
}

function SearchPage() {
  return (
    <>
      <h1>Uppslag</h1>
      <input aria-label="Sök i Uppslag" aria-keyshortcuts="/" />
    </>
  );
}

function renderApp(path = '/') {
  const root = createRootRoute({ component: Layout });
  const page = (p: string, title: string) =>
    createRoute({ getParentRoute: () => root, path: p, component: () => <h1>{title}</h1> });
  const router = createRouter({
    routeTree: root.addChildren([
      page('/', 'Hem'),
      page('/study', 'Plugga'),
      page('/study/session', 'Pass'),
      page('/cases', 'Ärenden'),
      page('/cases/$caseId', 'Ärendet'),
      createRoute({ getParentRoute: () => root, path: '/lookup', component: SearchPage }),
      page('/results', 'Mina resultat'),
      page('/settings', 'Inställningar'),
      createRoute({ getParentRoute: () => root, path: '/quiz', component: QuizLike }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  usePaletteStore.setState({
    open: false,
    helpOpen: false,
    tutorOpen: false,
    recent: [],
    lookupRequest: null,
  });
  useUiStore.setState({ theme: 'system', sidebarCollapsed: false });
});

const palette = () => screen.getByRole('dialog', { name: 'Kommandopalett' });
const input = () => screen.getByRole('combobox', { name: 'Sök i appen' });

describe('CommandPalette', () => {
  it('opens on Ctrl+K and closes on Esc', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    expect(palette()).toBeInTheDocument();
    expect(input()).toHaveFocus();
    expect(within(palette()).getByRole('group', { name: 'Vyer' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('also opens with Cmd+K from a text field', async () => {
    const user = userEvent.setup();
    renderApp('/lookup');
    await user.click(await screen.findByRole('textbox', { name: 'Sök i Uppslag' }));
    await user.keyboard('{Meta>}k{/Meta}');
    expect(palette()).toBeInTheDocument();
  });

  it('moves with the arrow keys and wraps around', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    const options = within(palette()).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await user.keyboard('{ArrowDown}');
    expect(input()).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input()).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
  });

  it('finds a term without å/ä/ö, opens it in Uppslag and remembers it', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('nockhojd');
    const option = within(palette()).getByRole('option', { selected: true });
    expect(option).toHaveTextContent('Nockhöjd');
    expect(within(option).getByText('Nockhöjd', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 träff');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/lookup'));
    expect(usePaletteStore.getState().lookupRequest).toEqual({ kind: 'term', id: 'nockhojd' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.keyboard('{Control>}k{/Control}');
    const recent = within(palette()).getByRole('group', { name: 'Senaste' });
    expect(within(recent).getByRole('option')).toHaveTextContent('Nockhöjd');
  });

  it('opens a case and runs actions', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('bjorken{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/cases/A002'));
    await waitFor(() => expect(document.getElementById('main')).toHaveFocus());

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('morkt');
    await user.click(within(palette()).getByRole('option', { name: /Byt till mörkt läge/ }));
    expect(useUiStore.getState().theme).toBe('dark');

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('kortkommandon{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Kortkommandon' })).toBeInTheDocument();
  });

  it('shows a message when nothing matches', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('xyzzy');
    expect(within(palette()).getByText(/Pröva ett kortare ord/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Inga träffar');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });
});

describe('global shortcuts', () => {
  it('goes to views with g and a second key', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('gr');
    await waitFor(() => expect(router.state.location.pathname).toBe('/results'));
    await user.keyboard('gä');
    await waitFor(() => expect(router.state.location.pathname).toBe('/cases'));
    await user.keyboard('gi');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    // A view key alone does nothing.
    await user.keyboard('h');
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('ignores shortcuts while typing', async () => {
    const user = userEvent.setup();
    const router = renderApp('/lookup');
    await user.click(await screen.findByRole('textbox', { name: 'Sök i Uppslag' }));
    await user.keyboard('gh?');
    expect(router.state.location.pathname).toBe('/lookup');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses the view search on /, and opens the palette where there is none', async () => {
    const user = userEvent.setup();
    renderApp('/lookup');
    const search = await screen.findByRole('textbox', { name: 'Sök i Uppslag' });
    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    act(() => search.blur());
    await user.keyboard('gh');
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('/');
    expect(palette()).toBeInTheDocument();
  });

  it('opens the shortcuts dialog on ? and closes it again', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('?');
    const help = await screen.findByRole('dialog', { name: 'Kortkommandon' });
    expect(within(help).getByText('Gå till Ärenden')).toBeInTheDocument();
    expect(within(help).getAllByText('G sedan H').length).toBeGreaterThan(0);
    await user.keyboard('?');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('leaves ? to a view with its own help', async () => {
    const user = userEvent.setup();
    renderApp('/quiz');
    await screen.findByRole('heading', { name: 'Quiz' });
    await user.keyboard('?');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the palette in charge of the keyboard while it is open', async () => {
    const user = userEvent.setup();
    const router = renderApp();
    await screen.findByRole('heading', { name: 'Hem' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('gr');
    expect(router.state.location.pathname).toBe('/');
    expect(input()).toHaveValue('gr');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
