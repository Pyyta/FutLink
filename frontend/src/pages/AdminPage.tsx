import { useQuery } from '@tanstack/react-query';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminConfigSection } from '../components/admin/AdminConfigSection';
import { AdminContentsSection } from '../components/admin/AdminContentsSection';
import { AdminReportsSection } from '../components/admin/AdminReportsSection';
import { AdminUsersSection } from '../components/admin/AdminUsersSection';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AlertCircleIcon,
  Button,
  CalendarIcon,
  Card,
  ClipboardListIcon,
  ShieldIcon,
  Spinner,
  UsersIcon,
  type IconProps,
} from '../components/ui';
import { getErrorMessage } from '../lib/api/error-message';
import { adminApi } from '../lib/api/endpoints';

type AdminTab = 'users' | 'contents' | 'reports' | 'config';

const TABS: { id: AdminTab; icon: ComponentType<IconProps> }[] = [
  { id: 'users', icon: UsersIcon },
  { id: 'contents', icon: ClipboardListIcon },
  { id: 'reports', icon: CalendarIcon },
  { id: 'config', icon: ShieldIcon },
];

export function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>('users');
  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminApi.getConfig(),
  });

  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

      <div
        role="tablist"
        aria-label={t('admin.tabsLabel')}
        className="grid grid-cols-2 gap-1 rounded-card bg-surface-sunken p-1"
      >
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
            }}
            className={`flex items-center justify-center gap-2 rounded-control px-3 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? 'bg-white text-brand-950 shadow-card'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Icon size={16} />
            {t(`admin.tabs.${id}`)}
          </button>
        ))}
      </div>

      {configQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : configQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <div>
              <p className="text-sm font-semibold text-primary-900">
                {t('admin.loadError')}
              </p>
              <p className="mt-1 text-xs text-primary-900/80">
                {getErrorMessage(configQuery.error, t)}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={configQuery.isFetching}
            onClick={() => {
              void configQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : configQuery.data ? (
        <div role="tabpanel" aria-label={t(`admin.tabs.${tab}`)}>
          {tab === 'users' ? (
            <AdminUsersSection config={configQuery.data.config} />
          ) : tab === 'contents' ? (
            <AdminContentsSection
              ratingMax={configQuery.data.config.ratings.maxScore}
            />
          ) : tab === 'reports' ? (
            <AdminReportsSection />
          ) : (
            <AdminConfigSection config={configQuery.data.config} />
          )}
        </div>
      ) : null}
    </div>
  );
}
