import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { BottomSheet } from './BottomSheet';

function renderSheet(onClose = vi.fn()) {
  const view = render(
    <I18nextProvider i18n={i18n}>
      <BottomSheet
        open
        onClose={onClose}
        title="Filtros"
        description="Ajusta la búsqueda"
      >
        <p>Contenido del panel</p>
      </BottomSheet>
    </I18nextProvider>,
  );

  return { onClose, ...view };
}

describe('BottomSheet', () => {
  it('muestra un diálogo accesible y enfoca el cierre', () => {
    renderSheet();

    expect(
      screen.getByRole('dialog', { name: 'Filtros' }),
    ).toHaveAccessibleDescription('Ajusta la búsqueda');
    expect(
      screen.getByRole('button', { name: 'Cerrar panel' }),
    ).toHaveFocus();
  });

  it('cierra con Escape y con el botón', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('bloquea el scroll y lo restaura al desmontar', () => {
    const { unmount } = renderSheet();

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('no renderiza nada cuando está cerrado', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <BottomSheet open={false} onClose={() => undefined} title="Filtros">
          <p>Contenido</p>
        </BottomSheet>
      </I18nextProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
