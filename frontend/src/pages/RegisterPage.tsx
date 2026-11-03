import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  FormError,
  Input,
  PasswordInput,
  useToast,
} from '../components/ui';
import { ApiError } from '../lib/api/client';
import { getErrorMessage } from '../lib/api/error-message';
import { registerSchema, type RegisterFormValues } from '../lib/auth/schemas';
import { useSession } from '../lib/auth/session-context';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { t } = useTranslation();
  const { signUp } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await signUp({ email: values.email, password: values.password });
      toast.info(t('auth.registerSuccess'));
      navigate('/perfil/completar', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_IN_USE') {
        setError('email', { message: t('errors.codes.EMAIL_IN_USE') });
        return;
      }
      setFormError(getErrorMessage(error, t));
    }
  });

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
    >
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
          autoComplete="new-password"
          placeholder={t('auth.passwordPlaceholder')}
          hint={t('auth.passwordHint')}
          required
          error={
            errors.password?.message ? t(errors.password.message) : undefined
          }
          {...register('password')}
        />

        <PasswordInput
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
          required
          error={
            errors.confirmPassword?.message
              ? t(errors.confirmPassword.message)
              : undefined
          }
          {...register('confirmPassword')}
        />

        <FormError>{formError}</FormError>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          {t('auth.registerAction')}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        {t('auth.hasAccount')}{' '}
        <Link
          to="/login"
          className="font-semibold text-primary-700 hover:underline"
        >
          {t('auth.loginAction')}
        </Link>
      </p>
    </AuthLayout>
  );
}
