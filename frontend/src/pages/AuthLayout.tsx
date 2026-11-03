import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-brand-950 bg-brand-glow">
      <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/futlink-logo.png"
            alt="FutLink"
            className="w-36 rounded-3xl shadow-glow"
          />
          <p className="text-sm font-medium text-white/70">
            {t('common.tagline')}
          </p>
        </header>

        <main className="mt-7 flex-1">
          <div className="rounded-sheet bg-white p-5 shadow-frame">
            <h1 className="text-title text-ink">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {subtitle}
            </p>

            <div className="mt-5">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
