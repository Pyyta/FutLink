import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, FormError, Input, PasswordInput } from '../components/ui';
import { getErrorMessage } from '../lib/api/error-message';
import { loginSchema, type LoginFormValues } from '../lib/auth/schemas';
import { useSession } from '../lib/auth/session-context';
import { AuthLayout } from './AuthLayout';

interface LoginLocationState {
  from?: unknown;
}

function redirectTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const from = redirectTarget(
    (location.state as LoginLocationState | null)?.from,
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const user = await signIn(values);
      const target = user.profileCompleted ? (from ?? '/') : '/perfil/completar';
      navigate(target, { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error, t));
    }
  });

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label={t('auth.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          required
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />

        <PasswordInput
          label={t('auth.password')}
          autoComplete="current-password"
          placeholder={t('auth.passwordPlaceholder')}
          required
          error={
            errors.password?.message ? t(errors.password.message) : undefined
          }
          {...register('password')}
        />

        <FormError>{formError}</FormError>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          {t('auth.loginAction')}
        </Button>
      </form>

      <div className="mt-5 space-y-2 text-center text-sm">
        <p className="text-ink-soft">
          {t('auth.noAccount')}{' '}
          <Link
            to="/registro"
            className="font-semibold text-primary-700 hover:underline"
          >
            {t('auth.registerAction')}
          </Link>
        </p>

        <p>
          <Link
            to="/recuperar"
            className="font-semibold text-primary-700 hover:underline"
          >
            {t('auth.forgotPassword')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
