import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('asocia la etiqueta y la ayuda con el campo', () => {
    render(<Input label="Correo" hint="Usaremos tu correo para avisarte" />);

    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAccessibleDescription(
      'Usaremos tu correo para avisarte',
    );
  });

  it('expone el error y marca el campo como inválido', () => {
    render(<Input label="Correo" error="Escribe un correo válido" />);

    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe un correo válido',
    );
    expect(input).toHaveAccessibleDescription('Escribe un correo válido');
  });
});
