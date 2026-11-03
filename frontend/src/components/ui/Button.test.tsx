import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('responde al clic', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('se deshabilita y anuncia la carga', () => {
    render(<Button loading>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('aplica variante y ancho completo', () => {
    render(
      <Button variant="danger" fullWidth>
        Eliminar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button.className).toContain('bg-danger-600');
    expect(button.className).toContain('w-full');
  });
});
