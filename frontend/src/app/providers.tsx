import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { ToastProvider } from '../components/ui/Toast';
import { i18n } from '../i18n';
import { SessionProvider } from '../lib/auth/session-context';
import { queryClient } from './query-client';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
