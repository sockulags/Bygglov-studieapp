import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingViewer } from './drawing-viewer';

// A 100 × 100 mm sheet at 1:500 with a 40 × 20 mm building (20 × 10 m) in the drawing layer.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100" data-scale="1:500" data-units="mm" data-meters-per-unit="0.5">
<g data-layer="ram"><rect x="0" y="0" width="100" height="100" fill="#fff"/></g>
<g transform="translate(10 10)" class="ritning" data-layer="ritning"><rect x="10" y="10" width="40" height="20" fill="none" stroke="#000"/></g>
</svg>`;

/** The image is 400 × 400 px (4 px per mm); the frame 432 px wide, so the view is 1:1 at 16 px. */
const toScreen = (x: number, y: number) => ({ clientX: 16 + 4 * x, clientY: 16 + 4 * y });

function click(frame: HTMLElement, x: number, y: number, offset = { dx: 0, dy: 0 }) {
  const at = toScreen(x, y);
  const init = {
    button: 0,
    pointerId: 1,
    clientX: at.clientX + offset.dx,
    clientY: at.clientY + offset.dy,
  };
  fireEvent.pointerDown(frame, init);
  fireEvent.pointerUp(frame, init);
}

async function renderLoaded() {
  render(
    <DrawingViewer
      src="/content/arenden/A901/handlingar/situationsplan.svg"
      title="Situationsplan"
    />,
  );
  const img = document.querySelector('img')!;
  Object.defineProperty(img, 'naturalWidth', { value: 400 });
  Object.defineProperty(img, 'naturalHeight', { value: 400 });
  fireEvent.load(img);
  const measure = await screen.findByRole('button', { name: /Mät/ });
  const frame = screen.getByRole('img', { name: /Situationsplan/ });
  return { measure, frame };
}

describe('DrawingViewer measuring', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } })),
      ),
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(432);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('measures distances in metres, snapping to corners within 8 px', async () => {
    const user = userEvent.setup();
    const { measure, frame } = await renderLoaded();
    expect(measure).toHaveAttribute('aria-pressed', 'false');
    await user.click(measure);
    expect(measure).toHaveAttribute('aria-pressed', 'true');

    // Near the building's corners (sheet 20,20 and 60,20): snapped, 40 mm = 20 m.
    click(frame, 20, 20, { dx: 5, dy: -4 });
    click(frame, 60, 20, { dx: -3, dy: 6 });
    // Free points far from any line: 10 mm = 5 m.
    click(frame, 80, 70);
    click(frame, 80, 80);

    const list = screen.getByRole('list', { name: 'Mått' });
    expect(within(list).getByText('Mått 1: Avstånd 20,0 meter')).toBeInTheDocument();
    expect(within(list).getByText('Mått 2: Avstånd 5,0 meter')).toBeInTheDocument();
    expect(screen.getByText('Avstånd 5,0 meter.')).toBeInTheDocument();
    const overlay = screen.getByTestId('measure-overlay');
    expect(overlay).toHaveTextContent('20,0 m');
    expect(overlay).toHaveTextContent('5,0 m');

    await user.click(screen.getByRole('button', { name: 'Rensa' }));
    expect(screen.queryByRole('list', { name: 'Mått' })).not.toBeInTheDocument();
  });

  it('measures areas with a polygon closed by double-click', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: /Yta/ }));
    const frame = screen.getByRole('img', { name: /Situationsplan/ });
    click(frame, 20, 20);
    click(frame, 60, 20);
    click(frame, 60, 40);
    click(frame, 20, 40);
    // The double-click's second click lands on the last point and is ignored.
    click(frame, 20, 40);
    fireEvent.doubleClick(frame, toScreen(20, 40));
    // 40 × 20 mm at 1:500 = 20 × 10 m.
    expect(screen.getByText('Mått 1: Yta 200,0 kvadratmeter')).toBeInTheDocument();
    expect(screen.getByTestId('measure-overlay')).toHaveTextContent('200,0 kvm');
  });

  it('keeps measuring right after zooming and panning', async () => {
    const user = userEvent.setup();
    const { frame } = await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Zooma in' }));
    // Pan by dragging 40 px to the right.
    fireEvent.pointerDown(frame, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frame, { button: 0, pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(frame, { button: 0, pointerId: 1, clientX: 140, clientY: 100 });
    await user.click(screen.getByRole('button', { name: /Mät/ }));
    // The building's top edge is 160 px long at 100 % and 200 px at 125 %; snapping finds
    // its corners wherever they are now.
    const corner = (x: number, y: number) => {
      const scale = 1.25;
      const cx = 216 - (216 - 16) * scale + 40; // zoomed around the frame centre, then panned
      const cy = 0 - (0 - 16) * scale; // the frame has no height in jsdom
      return { clientX: cx + 4 * x * scale, clientY: cy + 4 * y * scale };
    };
    for (const p of [corner(20, 20), corner(60, 20)]) {
      const init = { button: 0, pointerId: 1, clientX: p.clientX + 3, clientY: p.clientY + 3 };
      fireEvent.pointerDown(frame, init);
      fireEvent.pointerUp(frame, init);
    }
    expect(screen.getByText('Mått 1: Avstånd 20,0 meter')).toBeInTheDocument();
  });

  it('toggles with M, and Esc cancels before it clears', async () => {
    const user = userEvent.setup();
    const { measure, frame } = await renderLoaded();
    // Stands in for the case view's own Esc handler, which closes the document.
    const onWindowEscape = vi.fn();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onWindowEscape();
    };
    window.addEventListener('keydown', listener);
    frame.focus();
    await user.keyboard('m');
    expect(measure).toHaveAttribute('aria-pressed', 'true');

    click(frame, 80, 70);
    click(frame, 80, 80);
    click(frame, 80, 90);
    // The first Esc cancels the line in progress, the second ends measuring and clears.
    await user.keyboard('{Escape}');
    expect(screen.getByText('Mätningen avbröts.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Mått' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Mått' })).not.toBeInTheDocument();
    expect(measure).toHaveAttribute('aria-pressed', 'false');
    // Neither Esc reached the case view (which would close the document).
    expect(onWindowEscape).not.toHaveBeenCalled();
    // With nothing to cancel, Esc goes through.
    await user.keyboard('{Escape}');
    expect(onWindowEscape).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', listener);

    await act(async () => {
      await user.keyboard('M');
    });
    expect(measure).toHaveAttribute('aria-pressed', 'true');
  });
});
