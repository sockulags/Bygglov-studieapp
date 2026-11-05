import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownBody } from './paper';

describe('MarkdownBody tables', () => {
  it('leaves out an empty header row, so no empty column headers are read out', () => {
    const { container } = render(
      <MarkdownBody>{'| | |\n| --- | --- |\n| Sökande | Anna Ek |\n'}</MarkdownBody>,
    );
    expect(container.querySelector('thead')).toBeNull();
    expect(screen.getByRole('cell', { name: 'Anna Ek' })).toBeInTheDocument();
  });

  it('turns an empty header cell into a plain cell and keeps real headers', () => {
    render(
      <MarkdownBody>
        {'| Uppgifter om byggnaden | |\n| --- | --- |\n| Nockhöjd | 3,6 m |\n'}
      </MarkdownBody>,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
    expect(
      screen.getByRole('columnheader', { name: 'Uppgifter om byggnaden' }),
    ).toBeInTheDocument();
  });
});
