import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminConfig, AdminUserDetail, UserRole } from '../../lib/api/types';
import {
  Button,
  Chip,
  FormError,
  Input,
  PasswordInput,
  Select,
} from '../ui';

export interface AdminUserFormValues {
  email: string;
  password: string;
  name: string;
  phone: string;
  locality: string;
  positionIds: number[];
  role: UserRole;
  state: 'active' | 'suspended';
}

export interface AdminUserFormProps {
  mode: 'create' | 'edit';
  config: AdminConfig;
  initial?: AdminUserDetail | undefined;
  submitting: boolean;
  error: string | null;
  onSubmit(values: AdminUserFormValues): void;
  onCancel(): void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialValues(initial?: AdminUserDetail): AdminUserFormValues {
  return {
    email: initial?.email ?? '',
    password: '',
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    locality: initial?.locality ?? '',
    positionIds: initial?.positions.map((position) => position.id) ?? [],
    role: initial?.role ?? 'user',
    state: initial?.state === 'suspended' ? 'suspended' : 'active',
  };
}

export function AdminUserForm({
  mode,
  config,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: AdminUserFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AdminUserFormValues>(() =>
    initialValues(initial),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof AdminUserFormValues>(
    key: K,
    value: AdminUserFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const togglePosition = (id: number) => {
    update(
      'positionIds',
      values.positionIds.includes(id)
        ? values.positionIds.filter((current) => current !== id)
        : [...values.positionIds, id],
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};

    if (!EMAIL_PATTERN.test(values.email.trim())) {
      next.email = t('admin.users.validation.email');
    }
    if (mode === 'create' && values.password.length < 8) {
      next.password = t('validation.passwordMin');
    }
    if (mode === 'edit' && values.password.length > 0 && values.password.length < 8) {
      next.password = t('validation.passwordMin');
    }
    if (values.password.length > 72) {
      next.password = t('validation.passwordMax');
    }
    if (values.name.trim().length < 2) {
      next.name = t('admin.users.validation.name');
    }
    if (values.phone.trim().length < 7) {
      next.phone = t('admin.users.validation.phone');
    }
    if (!values.locality) {
      next.locality = t('admin.users.validation.locality');
    }
    if (values.positionIds.length === 0) {
      next.positionIds = t('admin.users.validation.positions');
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    onSubmit({
      ...values,
      email: values.email.trim(),
      name: values.name.trim(),
      phone: values.phone.trim(),
      password: values.password,
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <Input
        id="admin-user-email"
        label={t('admin.users.fields.email')}
        type="email"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        required
        onChange={(event) => update('email', event.target.value)}
      />

      <PasswordInput
        id="admin-user-password"
        label={t('admin.users.fields.password')}
        autoComplete="new-password"
        hint={
          mode === 'edit'
            ? t('admin.users.fields.passwordEditHint')
            : t('admin.users.fields.passwordHint')
        }
        value={values.password}
        error={errors.password}
        required={mode === 'create'}
        onChange={(event) => update('password', event.target.value)}
      />

      <Input
        id="admin-user-name"
        label={t('admin.users.fields.name')}
        autoComplete="name"
        value={values.name}
        error={errors.name}
        required
        onChange={(event) => update('name', event.target.value)}
      />

      <Input
        id="admin-user-phone"
        label={t('admin.users.fields.phone')}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={values.phone}
        error={errors.phone}
        required
        onChange={(event) => update('phone', event.target.value)}
      />

      <Select
        id="admin-user-locality"
        label={t('admin.users.fields.locality')}
        value={values.locality}
        error={errors.locality}
        required
        onChange={(event) => update('locality', event.target.value)}
      >
        <option value="">{t('admin.users.fields.localityPlaceholder')}</option>
        {config.localities.map((locality) => (
          <option key={locality.id} value={locality.name}>
            {locality.name}
          </option>
        ))}
      </Select>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          {t('admin.users.fields.positions')}
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        </legend>
        <p className="mt-1 text-xs text-ink-soft">
          {t('admin.users.fields.positionsHint')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {config.positions.map((position) => (
            <Chip
              key={position.id}
              selected={values.positionIds.includes(position.id)}
              className="capitalize"
              onClick={() => togglePosition(position.id)}
            >
              {position.title}
            </Chip>
          ))}
        </div>
        {errors.positionIds ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
            {errors.positionIds}
          </p>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Select
          id="admin-user-role"
          label={t('admin.users.fields.role')}
          value={values.role}
          onChange={(event) =>
            update('role', event.target.value as UserRole)
          }
        >
          <option value="user">{t('admin.users.roles.user')}</option>
          <option value="admin">{t('admin.users.roles.admin')}</option>
        </Select>

        {mode === 'edit' ? (
          <Select
            id="admin-user-state"
            label={t('admin.users.fields.state')}
            value={values.state}
            onChange={(event) =>
              update(
                'state',
                event.target.value === 'suspended' ? 'suspended' : 'active',
              )
            }
          >
            <option value="active">{t('admin.users.states.active')}</option>
            <option value="suspended">
              {t('admin.users.states.suspended')}
            </option>
          </Select>
        ) : null}
      </div>

      <FormError>{error}</FormError>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={submitting}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" fullWidth loading={submitting}>
          {mode === 'create'
            ? t('admin.users.createUserAction')
            : t('admin.users.saveAction')}
        </Button>
      </div>
    </form>
  );
}
