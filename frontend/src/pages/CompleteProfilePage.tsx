import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/layout/BrandLogo';
import { LoadingScreen } from '../components/layout/LoadingScreen';
import { ProfileForm } from '../components/profile/ProfileForm';
import { Button, Chip, useToast } from '../components/ui';
import { LogOutIcon } from '../components/ui/icons';
import { useSession } from '../lib/auth/session-context';

export function CompleteProfilePage() {
  const { t } = useTranslation();
  const { user, signOut, updateProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  if (!user) return <LoadingScreen />;
  if (user.profileCompleted) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh bg-surface-sunken">
      <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-white">
        <header className="flex items-center justify-between border-b border-line px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
          <BrandLogo />
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<LogOutIcon size={16} />}
            onClick={() => {
              void signOut();
            }}
          >
            {t('common.logout')}
          </Button>
        </header>

        <main className="flex-1 px-5 py-6 pb-10">
          <Chip tone="primary">{t('completeProfile.step')}</Chip>

          <h1 className="mt-3 text-title text-brand-950">
            {t('completeProfile.title')}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {t('completeProfile.body')}
          </p>

          <ProfileForm
            defaultValues={{
              name: user.name ?? '',
              phone: user.phone ?? '',
              locality: user.locality ?? '',
              positionIds: user.positions.map((position) => position.id),
            }}
            submitLabel={t('completeProfile.save')}
            onSubmit={async (values) => {
              const updated = await updateProfile(values);
              await queryClient.invalidateQueries({
                queryKey: ['public-profile', updated.id],
              });
              toast.success(t('completeProfile.success'));
              navigate('/', { replace: true });
            }}
          />

          <p className="mt-6 text-center text-xs text-ink-faint">
            {t('completeProfile.note')}
          </p>
        </main>
      </div>
    </div>
  );
}
