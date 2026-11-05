import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LookupContent } from '@/content';
import { LookupNavContext } from './lookup-nav';
import { ProcessTab, type ProcessSelection } from './process-tab';
import { sampleProcess } from './test-fixtures';

const lookup = {
  glossary: [
    {
      id: 'komplettering',
      term: 'Komplettering',
      definition: 'D.',
      lagrum: [],
      modul: '06-handlaggning',
    },
  ],
  processes: [sampleProcess()],
  laws: [],
  chapters: [],
} as unknown as LookupContent;

function Harness({ open }: { open: (target: unknown) => void }) {
  const [selection, setSelection] = useState<ProcessSelection | undefined>();
  return (
    <LookupNavContext.Provider value={{ open }}>
      <ProcessTab lookup={lookup} modules={[]} selection={selection} onSelect={setSelection} />
    </LookupNavContext.Provider>
  );
}

describe('ProcessTab', () => {
  it('opens a step in a box with its description, deadline, lagrum and ways on', () => {
    const open = vi.fn();
    render(<Harness open={open} />);
    fireEvent.click(screen.getByRole('button', { name: /Föreläggande om komplettering/ }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Föreläggande om komplettering' }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent('Sökanden föreläggs att komplettera.');
    expect(dialog).toHaveTextContent('steg 3 av 4');

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'PBL 9 kap. 91 §, visa i lagrumsregistret' }),
    );
    expect(open).toHaveBeenCalledWith({ kind: 'reference', reference: 'PBL 9 kap. 91 §' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Komplettering' }));
    expect(open).toHaveBeenCalledWith({ kind: 'term', id: 'komplettering' });

    // Following the loop back opens the earlier step in the same box.
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Kompletterat: Fullständighetsgranskning/ }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Är ansökan komplett?');
  });

  it('shows the deadline of a step', () => {
    render(<Harness open={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ansökan kommer in/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Frist: Tio veckor');
  });
});
