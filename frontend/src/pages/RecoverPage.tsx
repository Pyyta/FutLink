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
import { authApi } from '../lib/api/endpoints';
import { getErrorMessage } from '../lib/api/error-message';
import {
  recoverEmailSchema,
  resetPasswordSchema,
  type RecoverEmailFormValues,
  type ResetPasswordFormValues,
} from '../lib/auth/schemas';
import { AuthLayout } from './AuthLayout';

type RecoverStep = 'request' | 'reset';

export function RecoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<RecoverStep>('request');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const requestForm = useForm<RecoverEmailFormValues>({
    resolver: zodResolver(recoverEmailSchema),
    defaultValues: { email: '' },
  });

  const resetForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const onRequest = requestForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await authApi.forgotPassword(values.email);
      setEmail(values.email);
      resetForm.reset();
      setStep('reset');
    } catch (error) {
      setFormError(getErrorMessage(error, t));
    }
  });

  const onReset = resetForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await authApi.resetPassword({
        email,
        code: values.code,
        newPassword: values.newPassword,
      });
      toast.success(t('auth.resetSuccess'));
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error, t));
    }
  });

  const onResend = async () => {
    setResending(true);
    try {
      await authApi.forgotPassword(email);
      toast.info(t('auth.resendSuccess'));
    } catch (error) {
      toast.error(getErrorMessage(error, t));
    } finally {
      setResending(false);
    }
  };

  const onUseAnotherEmail = () => {
    setFormError(null);
    requestForm.reset({ email });
    setStep('request');
  };

  if (step === 'request') {
    return (
      <AuthLayout
        title={t('auth.recoverTitle')}
        subtitle={t('auth.recoverSubtitle')}
      >
        <form className="space-y-4" onSubmit={onRequest} noValidate>
          <Input
            label={t('auth.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            required
            error={
              requestForm.formState.errors.email?.message
                ? t(requestForm.formState.errors.email.message)
                : undefined
            }
            {...requestForm.register('email')}
          />

          <FormError>{formError}</FormError>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={requestForm.formState.isSubmitting}
          >
            {t('auth.recoverAction')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm">
          <Link
            to="/login"
            className="font-semibold text-primary-700 hover:underline"
          >
            {t('common.back')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.recoverCodeTitle')}
      subtitle={t('auth.recoverCodeSubtitle', { email })}
    >
      <p className="rounded-2xl border border-primary-100 bg-mint p-3 text-xs leading-relaxed text-primary-900">
        {t('auth.recoverPrivacyNote')}
      </p>

      <form className="mt-4 space-y-4" onSubmit={onReset} noValidate>
        <Input
          label={t('auth.code')}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t('auth.codePlaceholder')}
          maxLength={6}
          hint={t('auth.codeHint')}
          required
          error={
            resetForm.formState.errors.code?.message
              ? t(resetForm.formState.errors.code.message)
              : undefined
          }
          {...resetForm.register('code')}
        />

        <PasswordInput
          label={t('auth.newPassword')}
          autoComplete="new-password"
          placeholder={t('auth.newPasswordPlaceholder')}
          hint={t('auth.passwordHint')}
          required
          error={
            resetForm.formState.errors.newPassword?.message
              ? t(resetForm.formState.errors.newPassword.message)
              : undefined
          }
          {...resetForm.register('newPassword')}
        />

        <PasswordInput
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
          required
          error={
            resetForm.formState.errors.confirmPassword?.message
              ? t(resetForm.formState.errors.confirmPassword.message)
              : undefined
          }
          {...resetForm.register('confirmPassword')}
        />

        <FormError>{formError}</FormError>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={resetForm.formState.isSubmitting}
        >
          {t('auth.resetAction')}
        </Button>
      </form>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          size="sm"
          loading={resending}
          onClick={() => {
            void onResend();
          }}
        >
          {t('auth.resendCode')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onUseAnotherEmail}>
          {t('auth.useAnotherEmail')}
        </Button>
      </div>

      <p className="mt-4 text-center text-sm">
        <Link
          to="/login"
          className="font-semibold text-primary-700 hover:underline"
        >
          {t('common.back')}
        </Link>
      </p>
    </AuthLayout>
  );
}
