import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders its label and defaults to type="button"', () => {
    render(<Button>Spara</Button>);
    const button = screen.getByRole('button', { name: 'Spara' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies the variant class', () => {
    render(<Button variant="danger">Ta bort</Button>);
    expect(screen.getByRole('button', { name: 'Ta bort' }).className).toContain('text-brick');
  });
});
