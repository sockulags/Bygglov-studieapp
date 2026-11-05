import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembleContent } from '@/content';
import { createMemoryDataStore, setDataStore } from '@/data';
import { q } from '@/engine/fixtures';
import { QuizView } from './quiz-view';
import {
  clearStudyRun,
  endStudyRun,
  flushStudyWrites,
  startStudyRun,
  useStudyStore,
} from './study-store';
import { SummaryView } from './summary-view';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100" data-scale="1:500" data-units="mm" data-meters-per-unit="0.5">
<g data-layer="ritning"><rect x="10" y="10" width="40" height="20" fill="none" stroke="#000"/></g>
</svg>`;

const drawing = q({
  id: 'rit-901',
  typ: 'ritning',
  fraga: 'Hur långt är det till gränsen?',
  fil: 'arenden/A901-test/handlingar/situationsplan.svg',
  bild_text: 'Situationsplan i skala 1:500.',
  svar: 3,
  tolerans: 0.1,
  enhet: 'm',
});

const content = assembleContent({
  'moduler.json': {
    moduler: [
      {
        id: '08-ritning-berakning',
        ordning: 8,
        titel: 'Ritning och beräkning',
        beskrivning: 'Om ritningar.',
        lagrum_sammanfattning: 'PBL 9 kap.',
      },
    ],
  },
  'fragor/08-ritning-berakning.json': { modul: '08-ritning-berakning', fragor: [drawing] },
});

const URL = '/content/fragor/08-ritning-berakning/rit-901.svg';

function Quiz() {
  const run = useStudyStore((s) => s.run);
  return run ? <QuizView run={run} /> : null;
}

/** Gives the drawing a natural size so the viewer shows it and enables measuring. */
function loadImage() {
  const img = document.querySelector<HTMLImageElement>(`img[src="${URL}"]`);
  if (!img) throw new Error('No drawing image');
  Object.defineProperty(img, 'naturalWidth', { value: 400 });
  Object.defineProperty(img, 'naturalHeight', { value: 400 });
  fireEvent.load(img);
}

beforeEach(async () => {
  setDataStore(createMemoryDataStore());
  clearStudyRun();
  window.scrollTo = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } })),
    ),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(432);
  await startStudyRun({ mode: 'module-review', moduleId: '08-ritning-berakning' }, content);
});

afterEach(async () => {
  await flushStudyWrites();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setDataStore(null);
  clearStudyRun();
});

describe('ritning questions', () => {
  it('shows the drawing in the measuring viewer above the answer, with M as shortcut', async () => {
    const user = userEvent.setup();
    render(
      <TooltipPrimitive.Provider>
        <Quiz />
      </TooltipPrimitive.Provider>,
    );
    loadImage();
    expect(screen.getByRole('toolbar', { name: 'Zoom och mät' })).toBeInTheDocument();
    expect(screen.getByText('Situationsplan i skala 1:500.')).toBeInTheDocument();
    const frame = screen.getByRole('img', { name: /Situationsplan i skala 1:500/ });
    const input = screen.getByRole('textbox');
    // The drawing comes before the answer field.
    expect(frame.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const measure = await screen.findByRole('button', { name: /Mät/ });
    expect(measure).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('m');
    expect(measure).toHaveAttribute('aria-pressed', 'true');
    // The quiz shortcuts still work and do not touch the measuring tool.
    await user.keyboard('?');
    expect(screen.getByText(/M mäter på ritningen/)).toBeInTheDocument();
    expect(measure).toHaveAttribute('aria-pressed', 'true');
    // Typing "m" in the answer field is text, not the shortcut.
    await user.type(input, '3 m');
    expect(input).toHaveValue('3 m');
    expect(measure).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('M');
    expect(measure).toHaveAttribute('aria-pressed', 'true');
    await user.click(frame);
    await user.keyboard('M');
    expect(measure).toHaveAttribute('aria-pressed', 'false');
    expect(useStudyStore.getState().run?.session.items[0]?.response).toBeNull();
  });

  it('shows the drawing again in the review at the end of the pass', async () => {
    const user = userEvent.setup();
    act(() => endStudyRun());
    const run = useStudyStore.getState().run;
    if (!run) throw new Error('No run');
    const rootRoute = createRootRoute({ component: () => <SummaryView run={run} /> });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(<RouterProvider router={router} />);
    await user.click(await screen.findByRole('button', { name: /Hur långt är det till gränsen/ }));
    loadImage();
    expect(screen.getByRole('toolbar', { name: 'Zoom och mät' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Mät/ })).toBeInTheDocument();
  });
});
