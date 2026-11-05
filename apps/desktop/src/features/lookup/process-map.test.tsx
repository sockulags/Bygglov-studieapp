import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadLookup } from '@/content';
import { ProcessMap } from './process-map';
import { sampleProcess } from './test-fixtures';

describe('ProcessMap', () => {
  it('draws one button per step and one arrow per edge, with the loop dashed', () => {
    const process = sampleProcess();
    const { container } = render(
      <ProcessMap process={process} layout="diagram" onSelectStep={() => {}} />,
    );
    const diagram = screen.getByTestId('process-diagram');
    expect(diagram).toHaveAccessibleName('Processkarta: Provprocess');
    const steps = within(diagram).getAllByRole('button');
    expect(steps.map((b) => b.dataset.step)).toEqual(['in', 'komplett', 'komplettering', 'beslut']);
    // The name holds all visible text of the box, the time limit too (label in name).
    expect(steps[0]).toHaveAccessibleName('1. Ansökan kommer in. Tio veckor (start)');
    expect(steps[1]).toHaveAccessibleName(
      '2. Fullständighetsgranskning. Är ansökan komplett? (förgrening)',
    );
    expect(steps[1]).toHaveAttribute('data-kind', 'question');
    expect(steps[3]).toHaveAttribute('data-kind', 'end');

    const edges = [...container.querySelectorAll('[data-edge]')].map((g) =>
      g.getAttribute('data-edge'),
    );
    expect(edges.sort()).toEqual(
      [
        'in->komplett',
        'komplett->beslut',
        'komplett->komplettering',
        'komplettering->komplett',
      ].sort(),
    );
    const loop = container.querySelector('[data-edge="komplettering->komplett"] path');
    expect(loop).toHaveAttribute('stroke-dasharray', '5 4');
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Ja', 'Nej', 'Kompletterat']));
  });

  it('places side-track steps in their own column', () => {
    render(<ProcessMap process={sampleProcess()} layout="diagram" onSelectStep={() => {}} />);
    const left = (id: string) =>
      Number.parseFloat((document.querySelector(`[data-step="${id}"]`) as HTMLElement).style.left);
    expect(left('komplettering')).toBeGreaterThan(left('komplett'));
    expect(left('beslut')).toBe(left('komplett'));
  });

  it('opens a step when it is clicked and marks the selected step', () => {
    const onSelectStep = vi.fn();
    render(
      <ProcessMap
        process={sampleProcess()}
        layout="diagram"
        selectedStepId="komplett"
        onSelectStep={onSelectStep}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Föreläggande om komplettering/ }));
    expect(onSelectStep).toHaveBeenCalledWith('komplettering');
    expect(screen.getByRole('button', { name: /Fullständighetsgranskning/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('renders a numbered list with the ways on in list mode', () => {
    const onSelectStep = vi.fn();
    render(<ProcessMap process={sampleProcess()} layout="list" onSelectStep={onSelectStep} />);
    const list = screen.getByTestId('process-list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    const ways = within(list).getAllByRole('list', { name: 'Vägar vidare' });
    // The branch point and the loop back each list their ways on.
    expect(ways).toHaveLength(2);
    fireEvent.click(
      within(ways[0] as HTMLElement).getByRole('button', { name: /Nej: Föreläggande/ }),
    );
    expect(onSelectStep).toHaveBeenCalledWith('komplettering');
  });

  it('renders every bundled process map without missing steps', () => {
    for (const process of loadLookup().processes) {
      const { unmount } = render(
        <ProcessMap process={process} layout="diagram" onSelectStep={() => {}} />,
      );
      const buttons = within(screen.getByTestId('process-diagram')).getAllByRole('button');
      expect(buttons).toHaveLength(process.steg.length);
      unmount();
    }
  });
});
