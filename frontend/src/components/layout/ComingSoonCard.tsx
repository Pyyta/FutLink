import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';

export interface ComingSoonCardProps {
  phase: number;
  title: string;
  body: string;
}

export function ComingSoonCard({ phase, title, body }: ComingSoonCardProps) {
  const { t } = useTranslation();

  return (
    <Card tone="mint" padding="lg">
      <Chip tone="primary">{t('common.phase', { phase })}</Chip>
      <h2 className="mt-3 text-heading text-brand-950">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
    </Card>
  );
}
