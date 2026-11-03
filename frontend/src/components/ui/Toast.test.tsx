import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const toast = useToast();

  return (
    <button type="button" onClick={() => toast.error('No se pudo guardar')}>
      Mostrar aviso
    </button>
  );
}

function renderToast() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    </I18nextProvider>,
  );
}

describe('Toast', () => {
  it('muestra el aviso con su tono y permite descartarlo', async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole('button', { name: 'Mostrar aviso' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo guardar');
    expect(alert.className).toContain('border-danger');

    await user.click(screen.getByRole('button', { name: 'Descartar aviso' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
