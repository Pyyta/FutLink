import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api/client';
import { catalogApi } from '../../lib/api/endpoints';
import { getErrorMessage } from '../../lib/api/error-message';
import {
  profileSchema,
  type ProfileFormValues,
} from '../../lib/auth/schemas';
import {
  Button,
  Card,
  Chip,
  FormError,
  Input,
  Select,
  Spinner,
} from '../ui';

export interface ProfileFormProps {
  defaultValues: ProfileFormValues;
  submitLabel: string;
  onSubmit(values: ProfileFormValues): Promise<void>;
  onCancel?: () => void;
}

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

export function ProfileForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: ProfileFormProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: catalogApi.get,
    staleTime: 60 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  const translateError = (message?: string) =>
    message ? t(message) : undefined;

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PHONE_IN_USE') {
        setError('phone', { message: t('errors.codes.PHONE_IN_USE') });
        return;
      }
      setFormError(getErrorMessage(error, t));
    }
  });

  const catalog = catalogQuery.data;

  return (
    <>
      {catalogQuery.isLoading ? (
        <Card tone="mint" padding="md" className="mt-5">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('completeProfile.catalogLoading')}
          </div>
        </Card>
      ) : null}

      {catalogQuery.isError ? (
        <Card tone="mint" padding="md" className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-primary-900">
            {t('completeProfile.catalogError')}
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
        <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
          <Input
            label={t('completeProfile.name')}
            autoComplete="name"
            placeholder={t('completeProfile.namePlaceholder')}
            required
            error={translateError(errors.name?.message)}
            {...register('name')}
          />

          <Input
            label={t('completeProfile.phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('completeProfile.phonePlaceholder')}
            hint={t('completeProfile.phoneHint')}
            required
            error={translateError(errors.phone?.message)}
            {...register('phone')}
          />

          <Select
            label={t('completeProfile.locality')}
            required
            error={translateError(errors.locality?.message)}
            {...register('locality')}
          >
            <option value="">{t('completeProfile.localityPlaceholder')}</option>
            {catalog.localities.map((locality) => (
              <option key={locality.name} value={locality.name}>
                {locality.name}
              </option>
            ))}
          </Select>

          <Controller
            control={control}
            name="positionIds"
            render={({ field, fieldState }) => (
              <fieldset>
                <legend className="text-sm font-semibold text-ink">
                  {t('completeProfile.positions')}
                  <span aria-hidden="true" className="ml-0.5 text-danger-600">
                    *
                  </span>
                </legend>
                <p className="mt-1 text-xs text-ink-soft">
                  {t('completeProfile.positionsHint')}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {catalog.positions.map((position) => (
                    <Chip
                      key={position.id}
                      selected={field.value.includes(position.id)}
                      className="capitalize"
                      onClick={() =>
                        field.onChange(toggleId(field.value, position.id))
                      }
                    >
                      {position.title}
                    </Chip>
                  ))}
                </div>

                {fieldState.error?.message ? (
                  <p
                    role="alert"
                    className="mt-1.5 text-xs font-medium text-danger-600"
                  >
                    {t(fieldState.error.message)}
                  </p>
                ) : null}
              </fieldset>
            )}
          />

          <FormError>{formError}</FormError>

          <div className="space-y-2">
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={isSubmitting}
            >
              {submitLabel}
            </Button>
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </>
  );
}
