import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LookupContent } from '@/content';
import { LookupSearch } from './lookup-search';
import { buildSearchIndex } from './search';
import { sampleProcess } from './test-fixtures';

const lookup = {
  glossary: [
    { id: 'nockhojd', term: 'Nockhöjd', definition: 'Höjden till nocken.', lagrum: [], modul: 'x' },
    {
      id: 'byggnadshojd',
      term: 'Byggnadshöjd',
      definition: 'En annan höjd.',
      lagrum: [],
      modul: 'x',
    },
  ],
  processes: [sampleProcess()],
  laws: [],
  chapters: [],
} as unknown as LookupContent;
const index = buildSearchIndex(lookup, []);

describe('LookupSearch', () => {
  it('focuses the field on "/" and opens the chosen hit with the keyboard', () => {
    const onOpen = vi.fn();
    render(
      <>
        <button type="button">Annat</button>
        <LookupSearch index={index} onOpen={onOpen} />
      </>,
    );
    const input = screen.getByRole('combobox', { name: 'Sök i Uppslag' });
    screen.getByRole('button', { name: 'Annat' }).focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'höjd' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ kind: 'term' });
    expect(input).toHaveValue('');
  });

  it('does not take "/" typed into another field', () => {
    render(
      <>
        <input aria-label="Annat fält" />
        <LookupSearch index={index} onOpen={() => {}} />
      </>,
    );
    const other = screen.getByRole('textbox', { name: 'Annat fält' });
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(other).toHaveFocus();
  });

  it('says so when nothing matches and clears on Escape', () => {
    render(<LookupSearch index={index} onOpen={() => {}} />);
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, { target: { value: 'xyzzy' } });
    expect(screen.getByRole('listbox')).toHaveTextContent('Inga träffar');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });
});
