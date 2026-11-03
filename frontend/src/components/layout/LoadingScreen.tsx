import { useTranslation } from 'react-i18next';
import { Spinner } from '../ui/Spinner';

export function LoadingScreen({ message }: { message?: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={28} className="text-primary-600" />
        <p role="status" className="text-sm text-ink-soft">
          {message ?? t('common.loading')}
        </p>
      </div>
    </div>
  );
}
