import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('expone el promedio como imagen accesible', () => {
    render(<StarRating value={4} />);

    expect(
      screen.getByRole('img', { name: '4 de 5 estrellas' }),
    ).toBeInTheDocument();
  });

  it('admite promedios fraccionarios', () => {
    render(<StarRating value={3.5} />);

    expect(
      screen.getByRole('img', { name: '3.5 de 5 estrellas' }),
    ).toBeInTheDocument();
  });

  it('permite calificar y refleja la selección', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);

    expect(
      screen.getByRole('button', { name: 'Calificar con 2 estrellas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Calificar con 3 estrellas' }),
    ).toHaveAttribute('aria-pressed', 'false');

    await user.click(
      screen.getByRole('button', { name: 'Calificar con 4 estrellas' }),
    );

    expect(onChange).toHaveBeenCalledWith(4);
  });
});
