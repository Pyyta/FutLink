import { useTranslation } from 'react-i18next';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src="/brand/futlink-mark.png"
        alt={compact ? t('common.appName') : ''}
        width={32}
        height={32}
        className="h-8 w-8 rounded-[10px] shadow-glow"
      />
      {!compact ? (
        <span className="text-lg font-extrabold tracking-tight">
          <span className="text-ink">fut</span>
          <span className="bg-gradient-to-r from-primary-600 to-accent-cyan bg-clip-text text-transparent">
            link
          </span>
        </span>
      ) : null}
    </span>
  );
}
