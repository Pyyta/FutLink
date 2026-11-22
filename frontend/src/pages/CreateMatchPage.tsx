import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Button,
  Card,
  FormError,
  Input,
  Select,
  Spinner,
  useToast,
} from '../components/ui';
import { ChevronLeftIcon } from '../components/ui/icons';
import { getErrorMessage } from '../lib/api/error-message';
import { catalogApi, matchesApi } from '../lib/api/endpoints';
import {
  createMatchSchema,
  type CreateMatchFormValues,
} from '../lib/auth/schemas';
import { useSession } from '../lib/auth/session-context';

function bogotaDateTimeMin(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function CreateMatchPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: catalogApi.get,
    staleTime: 60 * 60 * 1000,
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateMatchFormValues>({
    resolver: zodResolver(createMatchSchema),
    defaultValues: {
      matchDate: '',
      locality: user?.locality ?? '',
      modality: '',
      description: '',
      positions: user?.positions[0]
        ? [{ positionId: user.positions[0].id, slots: 1 }]
        : [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'positions',
  });
  const positions = watch('positions') ?? [];
  const totalSlots = positions.reduce(
    (total, position) => total + (Number.isFinite(position.slots) ? position.slots : 0),
    0,
  );
  const usedPositionIds = positions.map((position) => position.positionId);
  const catalog = catalogQuery.data;

  const translateError = (message?: string) =>
    message ? t(message) : undefined;

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const { match } = await matchesApi.create({
        matchDate: `${values.matchDate}:00-05:00`,
        locality: values.locality.trim(),
        modality: values.modality.trim() || null,
        description: values.description.trim() || null,
        positions: values.positions,
      });
      await queryClient.invalidateQueries({ queryKey: ['match-search'] });
      toast.success(t('createMatch.success'));
      navigate(`/partidos/${match.id}`, { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error, t));
    }
  });

  const backToProfile = () => {
    navigate('/perfil');
  };

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<ChevronLeftIcon size={16} />}
        className="-ml-2"
        onClick={backToProfile}
      >
        {t('createMatch.back')}
      </Button>

      <PageHeader
        title={t('createMatch.title')}
        subtitle={t('createMatch.subtitle')}
      />

      {catalogQuery.isLoading ? (
        <Card tone="mint" padding="md">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('createMatch.catalogLoading')}
          </div>
        </Card>
      ) : null}

      {catalogQuery.isError ? (
        <Card tone="mint" padding="md" className="space-y-3">
          <p className="text-sm font-semibold text-primary-900">
            {t('createMatch.catalogError')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={catalogQuery.isFetching}
            onClick={() => {
              void catalogQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : null}

      {catalog ? (
        <form className="space-y-5" onSubmit={submit} noValidate>
          <Input
            label={t('createMatch.matchDate')}
            type="datetime-local"
            min={bogotaDateTimeMin()}
            required
            error={translateError(errors.matchDate?.message)}
            {...register('matchDate')}
          />

          <Select
            label={t('createMatch.locality')}
            required
            error={translateError(errors.locality?.message)}
            {...register('locality')}
          >
            <option value="">{t('createMatch.localityPlaceholder')}</option>
            {catalog.localities.map((locality) => (
              <option key={locality.name} value={locality.name}>
                {locality.name}
              </option>
            ))}
          </Select>

          <Input
            label={t('createMatch.modality')}
            placeholder={t('createMatch.modalityPlaceholder')}
            maxLength={20}
            error={translateError(errors.modality?.message)}
            {...register('modality')}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="match-description"
              className="block text-sm font-semibold text-ink"
            >
              {t('createMatch.description')}
            </label>
            <textarea
              id="match-description"
              rows={4}
              maxLength={500}
              placeholder={t('createMatch.descriptionPlaceholder')}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby="match-description-hint"
              className="w-full rounded-control border border-line-strong bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/30"
              {...register('description')}
            />
            {errors.description?.message ? (
              <p role="alert" className="text-xs font-medium text-danger-600">
                {translateError(errors.description.message)}
              </p>
            ) : (
              <p id="match-description-hint" className="text-xs text-ink-soft">
                {t('createMatch.descriptionHint', {
                  count: watch('description')?.length ?? 0,
                })}
              </p>
            )}
          </div>

          <Card padding="md">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-ink">
                {t('createMatch.vacancies')}
                <span aria-hidden="true" className="ml-0.5 text-danger-600">
                  *
                </span>
              </legend>
              <p className="text-xs text-ink-soft">
                {t('createMatch.vacanciesHint')}
              </p>

              {fields.map((field, index) => {
                const selectedId = positions[index]?.positionId;
                const selectedTitle = catalog.positions.find(
                  (position) => position.id === selectedId,
                )?.title;

                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 rounded-control bg-surface-sunken p-3"
                  >
                    <Select
                      label={t('createMatch.position')}
                      required
                      error={translateError(errors.positions?.[index]?.positionId?.message)}
                      {...register(`positions.${index}.positionId`, {
                        valueAsNumber: true,
                      })}
                    >
                      <option value="">
                        {t('createMatch.positionPlaceholder')}
                      </option>
                      {catalog.positions.map((position) => (
                        <option
                          key={position.id}
                          value={position.id}
                          disabled={
                            usedPositionIds.includes(position.id) &&
                            position.id !== selectedId
                          }
                        >
                          {position.title}
                        </option>
                      ))}
                    </Select>

                    <Input
                      label={t('createMatch.slots')}
                      type="number"
                      min={1}
                      max={30}
                      inputMode="numeric"
                      required
                      error={translateError(errors.positions?.[index]?.slots?.message)}
                      {...register(`positions.${index}.slots`, {
                        valueAsNumber: true,
                      })}
                    />

                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="col-span-2 justify-self-start"
                        onClick={() => remove(index)}
                      >
                        {t('createMatch.removePosition', {
                          position: selectedTitle ?? '',
                        })}
                      </Button>
                    ) : null}
                  </div>
                );
              })}

              {errors.positions?.message ? (
                <p role="alert" className="text-xs font-medium text-danger-600">
                  {translateError(errors.positions.message)}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    fields.length >= catalog.positions.length ||
                    fields.length >= 30
                  }
                  onClick={() => {
                    const nextPosition = catalog.positions.find(
                      (position) => !usedPositionIds.includes(position.id),
                    );
                    if (nextPosition) {
                      append({ positionId: nextPosition.id, slots: 1 });
                    }
                  }}
                >
                  {t('createMatch.addPosition')}
                </Button>
                <p className="text-right text-xs font-semibold text-primary-700">
                  {t('createMatch.totalSlots', { count: totalSlots })}
                </p>
              </div>
            </fieldset>
          </Card>

          <FormError>{formError}</FormError>

          <div className="space-y-2 pb-2">
            <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
              {t('createMatch.submit')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              disabled={isSubmitting}
              onClick={backToProfile}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
