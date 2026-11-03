import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

export interface AdminPaginationProps {
  page: number;
  totalPages: number;
  onChange(page: number): void;
}

export function AdminPagination({
  page,
  totalPages,
  onChange,
}: AdminPaginationProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        leadingIcon={<ChevronLeftIcon size={16} />}
        disabled={page <= 1}
        onClick={() => {
          onChange(page - 1);
        }}
      >
        {t('admin.previous')}
      </Button>

      <p className="text-xs font-semibold text-ink-soft">
        {t('admin.pageOf', { page, totalPages })}
      </p>

      <Button
        variant="outline"
        size="sm"
        trailingIcon={<ChevronRightIcon size={16} />}
        disabled={page >= totalPages}
        onClick={() => {
          onChange(page + 1);
        }}
      >
        {t('admin.next')}
      </Button>
    </div>
  );
}
