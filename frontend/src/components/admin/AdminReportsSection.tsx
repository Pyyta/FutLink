import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../lib/api/error-message';
import { adminApi } from '../../lib/api/endpoints';
import type { AdminReport, ReportType } from '../../lib/api/types';
import { formatDateTime, formatShortDate } from '../../lib/format';
import { isAppLocale, type AppLocale } from '../../i18n';
import {
  AlertCircleIcon,
  Button,
  Card,
  FormError,
  Input,
  Select,
  Spinner,
  useToast,
} from '../ui';
import { AdminPagination } from './AdminPagination';

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;
const MAX_RANGE_MS = 366 * DAY_MS;

type TypeFilter = '' | ReportType;

interface GenerateForm {
  type: ReportType;
  from: string;
  to: string;
}

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

function bogotaDateValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  const year = values.year;
  const month = values.month;
  const day = values.day;
  if (!year || !month || !day) return '';

  return `${year}-${month}-${day}`;
}

function defaultForm(): GenerateForm {
  const now = Date.now();
  return {
    type: 'users',
    from: bogotaDateValue(new Date(now - 30 * DAY_MS)),
    to: bogotaDateValue(new Date(now + DAY_MS)),
  };
}

function bogotaDayStart(value: string): string {
  return new Date(`${value}T00:00:00-05:00`).toISOString();
}

export function AdminReportsSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GenerateForm>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [page, setPage] = useState(1);

  const reportsQuery = useQuery({
    queryKey: ['admin-reports', typeFilter, page],
    queryFn: () =>
      adminApi.listReports({
        type: typeFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      adminApi.generateReport({
        type: form.type,
        from: bogotaDayStart(form.from),
        to: bogotaDayStart(form.to),
      }),
    onSuccess: () => {
      show('success', t('admin.reports.generated'));
      setFormError(null);
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
    onError: (error) => {
      setFormError(getErrorMessage(error, t));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (report: AdminReport) => ({
      report,
      csv: await adminApi.exportReport(report.id),
    }),
    onSuccess: ({ report, csv }) => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `futlink-reporte-${report.type}-${report.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      show('success', t('admin.reports.downloadSuccess'));
    },
    onError: (error) => {
      show('error', getErrorMessage(error, t));
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.from || !form.to) {
      setFormError(t('admin.reports.validation.datesRequired'));
      return;
    }

    const fromMs = Date.parse(bogotaDayStart(form.from));
    const toMs = Date.parse(bogotaDayStart(form.to));

    if (fromMs >= toMs) {
      setFormError(t('admin.reports.validation.range'));
      return;
    }

    if (toMs - fromMs > MAX_RANGE_MS) {
      setFormError(t('admin.reports.validation.maxRange'));
      return;
    }

    setFormError(null);
    generateMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card padding="md">
        <form className="space-y-3" onSubmit={submit}>
          <Select
            id="admin-reports-type"
            label={t('admin.reports.typeFilter')}
            value={form.type}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                type: event.target.value as ReportType,
              }));
            }}
          >
            <option value="users">{t('admin.reports.types.users')}</option>
            <option value="matches">{t('admin.reports.types.matches')}</option>
            <option value="requests">
              {t('admin.reports.types.requests')}
            </option>
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="admin-reports-from"
              type="date"
              label={t('admin.reports.from')}
              value={form.from}
              required
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  from: event.target.value,
                }));
              }}
            />

            <Input
              id="admin-reports-to"
              type="date"
              label={t('admin.reports.to')}
              value={form.to}
              required
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  to: event.target.value,
                }));
              }}
            />
          </div>

          <p className="text-xs text-ink-soft">
            {t('admin.reports.periodHint')}
          </p>

          <FormError>{formError}</FormError>

          <Button
            type="submit"
            fullWidth
            loading={generateMutation.isPending}
          >
            {t('admin.reports.generateAction')}
          </Button>
        </form>
      </Card>

      <div className="flex items-end justify-between gap-3">
        <Select
          id="admin-reports-filter"
          label={t('admin.reports.typeFilter')}
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as TypeFilter);
            setPage(1);
          }}
          containerClassName="max-w-[60%]"
        >
          <option value="">{t('admin.reports.allTypes')}</option>
          <option value="users">{t('admin.reports.types.users')}</option>
          <option value="matches">{t('admin.reports.types.matches')}</option>
          <option value="requests">
            {t('admin.reports.types.requests')}
          </option>
        </Select>

        <p className="pb-2 text-xs font-semibold text-ink-soft">
          {reportsQuery.data
            ? t('admin.reports.total', { count: reportsQuery.data.total })
            : null}
        </p>
      </div>

      {reportsQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : reportsQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {getErrorMessage(reportsQuery.error, t)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={reportsQuery.isFetching}
            onClick={() => {
              void reportsQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : reportsQuery.data && reportsQuery.data.reports.length > 0 ? (
        <>
          <ul className="space-y-3">
            {reportsQuery.data.reports.map((report) => (
              <li key={report.id}>
                <Card padding="md" className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-pill bg-mint px-2.5 py-1 text-[11px] font-bold text-primary-800">
                        {t(`admin.reports.types.${report.type}`)}
                      </span>
                      <h2 className="mt-1.5 text-heading text-ink">
                        {t('admin.reports.period', {
                          from: formatShortDate(report.periodStart, locale),
                          to: formatShortDate(report.periodEnd, locale),
                        })}
                      </h2>
                    </div>

                    <span className="shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-soft">
                      {t('admin.reports.rowCount', {
                        count: report.rowCount,
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-ink-soft">
                    {t('admin.reports.generatedBy', {
                      name:
                        report.generatedBy?.name ??
                        t('admin.reports.unknownAuthor'),
                    })}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {t('admin.reports.generatedAt', {
                      date: formatDateTime(report.createdAt, locale),
                    })}
                  </p>

                  <Button
                    size="sm"
                    variant="outline"
                    loading={
                      downloadMutation.isPending &&
                      downloadMutation.variables?.id === report.id
                    }
                    onClick={() => {
                      downloadMutation.mutate(report);
                    }}
                  >
                    {t('admin.reports.downloadAction')}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>

          <AdminPagination
            page={reportsQuery.data.page}
            totalPages={reportsQuery.data.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <p className="text-sm text-ink-soft">
            {typeFilter
              ? t('admin.reports.emptyFiltered')
              : t('admin.reports.empty')}
          </p>
        </Card>
      )}
    </div>
  );
}
